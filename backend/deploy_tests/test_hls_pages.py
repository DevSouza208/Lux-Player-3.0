"""HLS manifest rewriting must keep ALL requests on the FastAPI origin.

This catches a regression where the frontend gets the manifest from Render
but hls.js fetches relative .ts segment paths on github.io (404).
"""
from urllib.parse import urlparse, parse_qs
from routers.media import _rewrite_hls


def test_cross_origin_hls_playlist_segments_and_keys_use_api_host():
    origin = "https://lux-player-iptv-api.onrender.com"
    original = "https://media.example.com/live/master.m3u8"
    manifest = (
        "#EXTM3U\n"
        '#EXT-X-KEY:METHOD=AES-128,URI="keyfile.key"\n'
        "#EXTINF:4.0,\n"
        "part-001.ts\n"
        "#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=2000,URI=\"iframes.m3u8\"\n"
    )
    rewritten = _rewrite_hls(manifest, original, origin)
    assert rewritten.startswith("#EXTM3U\n")
    assert "https://lux-player-iptv-api.onrender.com/api/media/proxy?" in rewritten
    assert '/api/media/proxy?url=' in rewritten
    assert "https%3A%2F%2Fmedia.example.com%2Flive%2Fpart-001.ts" in rewritten
    assert "https%3A%2F%2Fmedia.example.com%2Flive%2Fkeyfile.key" in rewritten
    assert "https%3A%2F%2Fmedia.example.com%2Flive%2Fiframes.m3u8" in rewritten
    assert "github.io" not in rewritten


def test_same_origin_hls_legacy_behavior_is_preserved():
    rewritten = _rewrite_hls("#EXTM3U\nsegment.ts\n", "https://media.example.com/play.m3u8")
    assert rewritten.startswith("#EXTM3U\n")
    assert "/api/media/proxy?url=" in rewritten
