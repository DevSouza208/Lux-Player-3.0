"""VOD regression: incompatible Matroska + audio converts to fragmented MP4.

Uses synthetic, locally generated test media. No provider credentials or private
sources are needed and the live-TV MPEG-TS endpoint is not touched.
"""
import subprocess

import imageio_ffmpeg
from fastapi.testclient import TestClient

from routers.vod import vod_ffmpeg_args
from standalone import app


def test_vod_route_exists_but_fails_closed_without_host_config(monkeypatch):
    monkeypatch.delenv("LUX_ALLOWED_HOSTS", raising=False)
    with TestClient(app) as client:
        response = client.get("/api/media/vod", params={"url": "https://example.com/episode.mkv"})
    assert response.status_code == 503


def test_vod_rejects_private_networks(monkeypatch):
    monkeypatch.setenv("LUX_ALLOWED_HOSTS", "example.com")
    with TestClient(app) as client:
        response = client.get("/api/media/vod", params={"url": "http://localhost:8080/private.mkv"})
    assert response.status_code == 403


def test_ffmpeg_converts_synthetic_mkv_to_browser_mp4():
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    src = subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=10",
        "-f", "lavfi", "-i", "sine=frequency=600:sample_rate=48000",
        "-t", "1.2", "-c:v", "mpeg4", "-q:v", "10",
        "-c:a", "pcm_s16le",
        "-f", "matroska", "pipe:1",
    ], capture_output=True, check=True, timeout=30).stdout

    result = subprocess.run([
        ffmpeg, *vod_ffmpeg_args(),
    ], input=src, capture_output=True, timeout=45)

    assert result.returncode == 0, result.stderr.decode(errors="replace")[-1200:]
    assert b"ftyp" in result.stdout[:128]
    assert b"moof" in result.stdout
    assert len(result.stdout) > 4000
