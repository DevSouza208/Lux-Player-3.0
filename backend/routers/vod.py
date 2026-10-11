"""On-demand playback fallback for incompatible MKV/AVI/HEVC episodes.

The existing /media/proxy and /media/remux routes remain untouched.
Long-form VOD is converted to browser-compatible fragmented MP4 while it streams.
This endpoint deliberately does not support seeking yet; unconverted MP4 seeks
through the normal byte-range-aware proxy.
"""
import asyncio
import shutil
from contextlib import suppress
from urllib.parse import urlparse

import httpx
import imageio_ffmpeg
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from outbound_guard import enforce_request_host
from routers.media import _validate_public_url, UPSTREAM_HEADERS

router = APIRouter(prefix="/media", tags=["media"])
# Protect smaller backends from excessive concurrent video transcodes.
_TRANSCODES = asyncio.Semaphore(2)


def vod_ffmpeg_args() -> list[str]:
    """An MP4 fragment stream Chrome/Edge can decode without full-file buffering."""
    return [
        "-hide_banner", "-loglevel", "error", "-nostdin",
        "-fflags", "+genpts",
        "-probesize", "8000000", "-analyzeduration", "5000000",
        "-i", "pipe:0",
        "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", "scale=w=-2:h='trunc(min(720,ih)/2)*2'",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-pix_fmt", "yuv420p", "-g", "48",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "-f", "mp4", "pipe:1",
    ]


@router.get("/vod")
async def transcode_vod(url: str = Query(..., min_length=8)):
    await _validate_public_url(url)
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=422, detail="URL de vídeo inválida")

    try:
        await asyncio.wait_for(_TRANSCODES.acquire(), timeout=0.2)
    except TimeoutError as exc:
        raise HTTPException(status_code=429, detail="Conversões de vídeo ocupadas. Tente novamente em instantes.") from exc

    client: httpx.AsyncClient | None = None
    upstream: httpx.Response | None = None
    process: asyncio.subprocess.Process | None = None
    feeder: asyncio.Task | None = None
    stderr_task: asyncio.Task | None = None
    released = False

    async def cleanup():
        nonlocal released
        if feeder is not None:
            feeder.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await feeder
        if process is not None:
            if process.stdin and not process.stdin.is_closing():
                process.stdin.close()
            if process.returncode is None:
                with suppress(ProcessLookupError):
                    process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), timeout=3)
                except TimeoutError:
                    with suppress(ProcessLookupError):
                        process.kill()
                    await process.wait()
            if stderr_task is not None:
                stderr_task.cancel()
                with suppress(asyncio.CancelledError, Exception):
                    await stderr_task
        if upstream is not None:
            await upstream.aclose()
        if client is not None:
            await client.aclose()
        if not released:
            released = True
            _TRANSCODES.release()

    try:
        client = httpx.AsyncClient(
            follow_redirects=True,
            event_hooks={"request": [enforce_request_host]},
            timeout=httpx.Timeout(30, connect=8, read=None),
        )
        request = client.build_request("GET", url, headers=UPSTREAM_HEADERS)
        upstream = await client.send(request, stream=True)
        upstream.raise_for_status()

        process = await asyncio.create_subprocess_exec(
            shutil.which("ffmpeg") or imageio_ffmpeg.get_ffmpeg_exe(),
            *vod_ffmpeg_args(),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        assert process.stdin is not None
        assert process.stdout is not None
        assert process.stderr is not None

        stderr_tail = bytearray()

        async def feed():
            try:
                assert upstream is not None and process is not None and process.stdin is not None
                async for chunk in upstream.aiter_raw():
                    process.stdin.write(chunk)
                    await process.stdin.drain()
            except (httpx.HTTPError, BrokenPipeError, ConnectionResetError):
                pass
            finally:
                if process is not None and process.stdin and not process.stdin.is_closing():
                    process.stdin.close()

        async def read_errors():
            assert process is not None and process.stderr is not None
            while chunk := await process.stderr.read(4096):
                stderr_tail.extend(chunk)
                if len(stderr_tail) > 4096:
                    del stderr_tail[:-4096]

        feeder = asyncio.create_task(feed())
        stderr_task = asyncio.create_task(read_errors())

        first = await asyncio.wait_for(process.stdout.read(64 * 1024), timeout=45)
        if not first:
            raise HTTPException(status_code=502, detail="Não foi possível converter o episódio em MP4 reproduzível.")

        async def output():
            try:
                yield first
                assert process is not None and process.stdout is not None
                while chunk := await process.stdout.read(64 * 1024):
                    yield chunk
            finally:
                await cleanup()

        return StreamingResponse(
            output(), media_type="video/mp4",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )
    except HTTPException:
        await cleanup()
        raise
    except (httpx.TimeoutException, TimeoutError) as exc:
        await cleanup()
        raise HTTPException(status_code=504, detail="A conversão do episódio excedeu o tempo limite.") from exc
    except (httpx.HTTPError, OSError, Exception) as exc:
        await cleanup()
        raise HTTPException(status_code=502, detail="Não foi possível abrir ou converter o vídeo.") from exc
