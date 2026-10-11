import re
import unicodedata
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from uuid import uuid4

import httpx
from outbound_guard import enforce_request_host
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse

from models.playlist import PlaylistItem, PlaylistParseResult, PlaylistUrlRequest

router = APIRouter(prefix="/playlists", tags=["playlists"])
MAX_PLAYLIST_BYTES = 256 * 1024 * 1024
MAX_PLAYLIST_ITEMS = 30000


def _clean(value: str | None) -> str:
    return (value or "").strip().strip('"')


def _attributes(line: str) -> dict[str, str]:
    return {
        key.lower(): value
        for key, value in re.findall(r'([\w-]+)="([^"]*)"', line)
    }


def _kind(title: str, group: str, stream_url: str) -> str:
    clean_group = "".join(char for char in unicodedata.normalize("NFD", group.lower()) if unicodedata.category(char) != "Mn")
    path = stream_url.split("?", 1)[0].lower()
    extension = path.rsplit(".", 1)[-1] if "." in path.rsplit("/", 1)[-1] else ""
    if re.search(r"\b(canal|canais|ao vivo|live|pay[- ]?per[- ]?view|ppv|24h|radio)\b", clean_group) or extension == "ts":
        return "live"
    if re.search(r"\b(?:s|t)\d{1,2}\s*[-_. ]*e(?:p)?\s*\d{1,3}\b|\b\d{1,2}x\d{1,3}\b", title, re.IGNORECASE):
        return "series"
    if re.search(r"\b(serie|series|novela|novelas|dorama|doramas|temporada|temporadas|episodio|episodios|anime|animes)\b", clean_group):
        return "series"
    if re.search(r"\b(filme|filmes|movie|movies|cinema|vod|acao|animacao|aventura|comedia|crime|documentario|documentarios|drama|fantasia|faroeste|ficcao|infantil|lancamento|lancamentos|nacional|nacionais|romance|suspense|terror)\b", clean_group):
        return "movie"
    if extension == "m3u8":
        return "live"
    return "movie"


def _episode(title: str) -> tuple[int | None, int | None]:
    match = re.search(r"\b(?:s|t)(\d{1,2})\s*[-_. ]*e(?:p)?\s*(\d{1,3})\b", title, re.IGNORECASE)
    if not match:
        match = re.search(r"\b(\d{1,2})x(\d{1,3})\b", title, re.IGNORECASE)
    return (int(match.group(1)), int(match.group(2))) if match else (None, None)


def parse_m3u(text: str) -> tuple[list[PlaylistItem], bool]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    items: list[PlaylistItem] = []
    pending: dict[str, str] = {}
    pending_title = ""
    truncated = False
    for line in lines:
        if line.startswith("#EXTINF"):
            pending = _attributes(line)
            pending_title = line.split(",", 1)[1].strip() if "," in line else pending.get("tvg-name", "Untitled")
            continue
        if line.startswith("#"):
            continue
        title = _clean(pending.get("tvg-name") or pending_title or line.rsplit("/", 1)[-1])
        group = _clean(pending.get("group-title") or pending.get("group") or "")
        season, episode = _episode(title)
        if len(items) >= MAX_PLAYLIST_ITEMS:
            truncated = True
            break
        items.append(
            PlaylistItem(
                id=str(uuid4()),
                title=title or "Sem título",
                stream_url=line,
                kind=_kind(title, group, line),
                group=group,
                logo=pending.get("tvg-logo") or pending.get("logo"),
                poster=pending.get("tvg-logo") or pending.get("poster"),
                season=season,
                episode=episode,
            )
        )
        pending = {}
        pending_title = ""
    return items, truncated


def _xstream_base(server: str) -> tuple[str, dict[str, str]]:
    raw = server.strip()
    parsed = urlparse(raw if "://" in raw else f"http://{raw}")
    query = {key: values[0] for key, values in parse_qs(parsed.query).items() if values}
    base = urlunparse((parsed.scheme, parsed.netloc, "", "", "", "")).rstrip("/")
    return base, query


async def _xstream_request(client: httpx.AsyncClient, base: str, username: str, password: str, action: str | None = None):
    params = {"username": username, "password": password}
    if action:
        params["action"] = action
    response = await client.get(f"{base}/player_api.php", params=params)
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict) and payload.get("user_info", {}).get("auth") == 0:
        raise HTTPException(status_code=401, detail="Credenciais XStream inválidas")
    return payload if isinstance(payload, (dict, list)) else {}


class M3UStreamRequest(BaseModel):
    url: str = Field(..., min_length=8)


@router.get("/proxy")
async def proxy_m3u(url: str = Query(..., min_length=8)):
    # Retain compatibility with clients already importing by GET.
    return await _stream_playlist_url(url)


@router.post("/proxy")
async def proxy_m3u_post(request: M3UStreamRequest):
    # Keep provider credentials out of the URL of the API request.
    return await _stream_playlist_url(request.url)


async def _stream_playlist_url(url: str):
    timeout = httpx.Timeout(75.0, connect=10.0)
    client = httpx.AsyncClient(follow_redirects=True, timeout=timeout, event_hooks={"request": [enforce_request_host]})
    try:
        upstream_request = client.build_request("GET", url)
        upstream_response = await client.send(upstream_request, stream=True)
        upstream_response.raise_for_status()
    except httpx.TimeoutException as exc:
        await client.aclose()
        raise HTTPException(status_code=408, detail="O servidor da playlist demorou demais para responder") from exc
    except httpx.HTTPError as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail="O provedor não conseguiu entregar a playlist.") from exc

    async def stream_playlist():
        try:
            received = 0
            async for chunk in upstream_response.aiter_bytes():
                received += len(chunk)
                if received > MAX_PLAYLIST_BYTES:
                    break
                yield chunk
        finally:
            await upstream_response.aclose()
            await client.aclose()

    return StreamingResponse(
        stream_playlist(),
        media_type="application/x-mpegurl",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.post("/parse-url", response_model=PlaylistParseResult)
async def parse_playlist_url(request: PlaylistUrlRequest):
    if request.source_type == "m3u":
        if not request.url:
            raise HTTPException(status_code=422, detail="URL da playlist é obrigatória")
        try:
            timeout = httpx.Timeout(10.0, connect=4.0)
            async with httpx.AsyncClient(follow_redirects=True, timeout=timeout, event_hooks={"request": [enforce_request_host]}) as client:
                async with client.stream("GET", request.url) as response:
                    response.raise_for_status()
                    chunks: list[bytes] = []
                    received = 0
                    async for chunk in response.aiter_bytes():
                        received += len(chunk)
                        if received > MAX_PLAYLIST_BYTES:
                            raise HTTPException(status_code=413, detail="A playlist excede o limite de 256 MB")
                        chunks.append(chunk)
                    text = b"".join(chunks).decode("utf-8-sig", errors="replace")
        except httpx.TimeoutException as exc:
            raise HTTPException(status_code=408, detail="O servidor da playlist demorou demais para responder") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=400, detail=f"Não foi possível carregar a playlist: {exc}") from exc
        items, truncated = parse_m3u(text)
        warnings = ["A lista foi limitada aos primeiros 30.000 itens para manter o catálogo fluido."] if truncated else []
        return PlaylistParseResult(
            playlist_name=request.playlist_name or urlparse(request.url).path.rsplit("/", 1)[-1] or "Playlist remota",
            source_type="m3u",
            items=items,
            warnings=warnings if items else ["Nenhum item compatível foi encontrado nessa playlist."],
        )

    if not request.server:
        raise HTTPException(status_code=422, detail="Servidor, usuário e senha são obrigatórios")
    base, query = _xstream_base(request.server)
    username = query.get("username") or request.username
    password = query.get("password") or request.password
    if not username or not password:
        raise HTTPException(status_code=422, detail="Servidor, usuário e senha são obrigatórios; uma URL completa pode conter username e password")
    warnings: list[str] = []
    items: list[PlaylistItem] = []
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=35, event_hooks={"request": [enforce_request_host]}) as client:
            login = await _xstream_request(client, base, username, password)
            server_info = login.get("server_info", {}) if isinstance(login, dict) else {}
            secure = str(server_info.get("https", "")).lower() in {"1", "true", "https"}
            scheme = "https" if secure else urlparse(base).scheme
            host_name = server_info.get("url") or urlparse(base).netloc
            port = server_info.get("https_port") if secure else server_info.get("port")
            host = f"{scheme}://{host_name}"
            if port and ":" not in host.rsplit("/", 1)[-1]:
                host = f"{host}:{port}"
            live = await _xstream_request(client, base, username, password, "get_live_streams")
            vod = await _xstream_request(client, base, username, password, "get_vod_streams")
            series = await _xstream_request(client, base, username, password, "get_series")
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Não foi possível carregar o XStream: {exc}") from exc

    for entry in live if isinstance(live, list) else []:
        stream_id = str(entry.get("stream_id", ""))
        if not stream_id:
            continue
        extension = entry.get("container_extension") or "ts"
        items.append(PlaylistItem(id=str(uuid4()), title=entry.get("name", "Canal ao vivo"), stream_url=f"{host}/live/{username}/{password}/{stream_id}.{extension}", kind="live", group=entry.get("category_name", "Ao vivo"), logo=entry.get("stream_icon"), poster=entry.get("stream_icon"), container_extension=extension))
    for entry in vod if isinstance(vod, list) else []:
        stream_id = str(entry.get("stream_id", ""))
        if not stream_id:
            continue
        extension = entry.get("container_extension") or "mp4"
        items.append(PlaylistItem(id=str(uuid4()), title=entry.get("name", "Filme"), stream_url=f"{host}/movie/{username}/{password}/{stream_id}.{extension}", kind="movie", group=entry.get("category_name", "Filmes"), logo=entry.get("stream_icon"), poster=entry.get("stream_icon"), description=entry.get("plot"), container_extension=extension))
    for entry in series if isinstance(series, list) else []:
        series_id = entry.get("series_id")
        if not series_id:
            continue
        warnings.append(f"A série {entry.get('name', 'sem nome')} foi importada; episódios XStream serão detalhados em uma próxima etapa.")
        items.append(PlaylistItem(id=str(uuid4()), title=entry.get("name", "Série"), stream_url=f"{base}/player_api.php?{urlencode({'username': username, 'password': password, 'action': 'get_series_info', 'series_id': series_id})}", kind="series", group=entry.get("category_name", "Séries"), logo=entry.get("cover"), poster=entry.get("cover"), description=entry.get("plot")))
    return PlaylistParseResult(playlist_name=request.playlist_name or "XStream", source_type="xstream", items=items, warnings=warnings)