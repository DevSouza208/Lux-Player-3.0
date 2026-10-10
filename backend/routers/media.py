import asyncio
import ipaddress
import re
import socket
from contextlib import suppress
from typing import Literal
from urllib.parse import quote, urljoin, urlparse

import httpx
import imageio_ffmpeg
from outbound_guard import enforce_request_host
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse

router = APIRouter(prefix="/media", tags=["media"])

UPSTREAM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 LuxPlayer/1.0",
    "Accept": "*/*",
}


async def _validate_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=422, detail="URL de mídia inválida")
    try:
        addresses = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM),
        )
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail="O servidor de mídia não foi encontrado") from exc
    if any(not ipaddress.ip_address(address[4][0]).is_global for address in addresses):
        raise HTTPException(status_code=403, detail="Endereço de mídia não permitido")


def _proxied_url(url: str) -> str:
    return f"/api/media/proxy?url={quote(url, safe='')}"


def _rewrite_hls(text: str, source_url: str) -> str:
    rewritten: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            line = re.sub(
                r'URI="([^"]+)"',
                lambda match: f'URI="{_proxied_url(urljoin(source_url, match.group(1)))}"',
                line,
            )
        elif stripped:
            line = _proxied_url(urljoin(source_url, stripped))
        rewritten.append(line)
    return "\n".join(rewritten) + "\n"


@router.get("/proxy")
async def proxy_media(request: Request, url: str = Query(..., min_length=8)):
    await _validate_public_url(url)
    headers = dict(UPSTREAM_HEADERS)
    if request.headers.get("range"):
        headers["Range"] = request.headers["range"]
    client = httpx.AsyncClient(
        follow_redirects=True,
        verify=False,
        event_hooks={"request": [enforce_request_host]},
        timeout=httpx.Timeout(30.0, connect=8.0, read=None),
    )
    try:
        upstream_request = client.build_request("GET", url, headers=headers)
        upstream = await client.send(upstream_request, stream=True)
        upstream.raise_for_status()
    except httpx.TimeoutException as exc:
        await client.aclose()
        raise HTTPException(status_code=408, detail="O servidor de mídia demorou demais para responder") from exc
    except httpx.HTTPError as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail="O provedor recusou a mídia") from exc

    content_type = upstream.headers.get("content-type", "application/octet-stream").split(";", 1)[0]
    final_url = str(upstream.url)
    is_hls = urlparse(final_url).path.lower().endswith(".m3u8") or content_type in {
        "application/vnd.apple.mpegurl",
        "application/x-mpegurl",
        "audio/mpegurl",
        "audio/x-mpegurl",
    }
    if is_hls:
        body = (await upstream.aread()).decode("utf-8-sig", errors="replace")
        await upstream.aclose()
        await client.aclose()
        return Response(
            content=_rewrite_hls(body, final_url),
            media_type="application/vnd.apple.mpegurl",
            headers={"Cache-Control": "no-store"},
        )

    response_headers = {
        "Cache-Control": "private, max-age=300" if content_type.startswith("image/") else "no-store",
        "X-Accel-Buffering": "no",
    }
    for header in ("accept-ranges", "content-range", "content-length"):
        if upstream.headers.get(header):
            response_headers[header.title()] = upstream.headers[header]

    async def stream_upstream():
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        stream_upstream(),
        status_code=upstream.status_code,
        media_type=content_type,
        headers=response_headers,
    )


@router.get("/remux")
async def remux_transport_stream(
    url: str = Query(..., min_length=8),
    output: Literal["mp4", "webm"] = Query("mp4"),
):
    await _validate_public_url(url)
    client = httpx.AsyncClient(
        follow_redirects=True,
        verify=False,
        event_hooks={"request": [enforce_request_host]},
        timeout=httpx.Timeout(30.0, connect=8.0, read=None),
    )
    try:
        upstream_request = client.build_request("GET", url, headers=UPSTREAM_HEADERS)
        upstream = await client.send(upstream_request, stream=True)
        upstream.raise_for_status()
    except httpx.TimeoutException as exc:
        await client.aclose()
        raise HTTPException(status_code=408, detail="O servidor do canal demorou demais para responder") from exc
    except httpx.HTTPError as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail="O provedor recusou o canal") from exc

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    output_args = (
        [
            "-c:v",
            "libvpx",
            "-deadline",
            "realtime",
            "-cpu-used",
            "8",
            "-threads",
            "2",
            "-b:v",
            "1100k",
            "-maxrate",
            "1400k",
            "-bufsize",
            "2200k",
            "-c:a",
            "libopus",
            "-b:a",
            "96k",
            "-f",
            "webm",
            "-cluster_time_limit",
            "1000",
            "-cluster_size_limit",
            "2097152",
            "pipe:1",
        ]
        if output == "webm"
        else [
            "-c",
            "copy",
            "-bsf:a",
            "aac_adtstoasc",
            "-movflags",
            "frag_keyframe+empty_moov+default_base_moof",
            "-f",
            "mp4",
            "pipe:1",
        ]
    )
    process = await asyncio.create_subprocess_exec(
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-fflags",
        "+genpts",
        "-f",
        "mpegts",
        "-i",
        "pipe:0",
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
        *output_args,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    assert process.stdin is not None
    assert process.stdout is not None
    assert process.stderr is not None

    stderr_tail = bytearray()

    async def feed_ffmpeg():
        try:
            async for chunk in upstream.aiter_raw():
                process.stdin.write(chunk)
                await process.stdin.drain()
        except (BrokenPipeError, ConnectionResetError, httpx.HTTPError):
            pass
        finally:
            if not process.stdin.is_closing():
                process.stdin.close()

    async def collect_stderr():
        while chunk := await process.stderr.read(4096):
            stderr_tail.extend(chunk)
            if len(stderr_tail) > 8192:
                del stderr_tail[:-8192]

    feeder = asyncio.create_task(feed_ffmpeg())
    stderr_collector = asyncio.create_task(collect_stderr())

    async def cleanup():
        feeder.cancel()
        if process.returncode is None:
            process.terminate()
            with suppress(TimeoutError):
                await asyncio.wait_for(process.wait(), timeout=3)
            if process.returncode is None:
                process.kill()
                await process.wait()
        stderr_collector.cancel()
        with suppress(asyncio.CancelledError):
            await feeder
        with suppress(asyncio.CancelledError):
            await stderr_collector
        await upstream.aclose()
        await client.aclose()

    try:
        first_chunk = await asyncio.wait_for(process.stdout.read(64 * 1024), timeout=22)
    except TimeoutError as exc:
        await cleanup()
        raise HTTPException(status_code=504, detail="O canal não iniciou a reprodução a tempo") from exc
    if not first_chunk:
        await process.wait()
        error = stderr_tail.decode(errors="replace")[-500:]
        await cleanup()
        raise HTTPException(status_code=502, detail=f"O canal não pôde ser preparado: {error or 'sem dados'}")

    async def stream_remuxed():
        try:
            yield first_chunk
            while chunk := await process.stdout.read(64 * 1024):
                yield chunk
        finally:
            await cleanup()

    return StreamingResponse(
        stream_remuxed(),
        media_type="video/webm" if output == "webm" else "video/mp4",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )