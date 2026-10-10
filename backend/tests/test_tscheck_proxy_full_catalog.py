"""tscheck: proxy transmits playlists with more than 50k entries without truncation.

Spins up a tiny local HTTP server serving a generated M3U with 60,000 EXTINF
entries (above the old 50k ceiling) and asserts /api/playlists/proxy streams
the full body through untouched.
"""

import http.server
import threading

import httpx

ENTRY_COUNT = 60_000


def _build_playlist(count: int) -> bytes:
    lines = ["#EXTM3U"]
    for index in range(count):
        lines.append(f'#EXTINF:-1 group-title="Filmes",tscheck-proxy-full Filme {index:06d}')
        lines.append(f"http://example.invalid/tscheck-proxy-full/{index:06d}.mp4")
    return ("\n".join(lines) + "\n").encode("utf-8")


class _Handler(http.server.BaseHTTPRequestHandler):
    body = b""

    def do_GET(self):  # noqa: N802 - stdlib signature
        self.send_response(200)
        self.send_header("Content-Type", "application/x-mpegurl")
        self.send_header("Content-Length", str(len(self.body)))
        self.end_headers()
        self.wfile.write(self.body)

    def log_message(self, *args):  # silence default stderr logging
        pass


def _serve(playlist_bytes: bytes):
    handler = type("Handler", (_Handler,), {"body": playlist_bytes})
    server = http.server.HTTPServer(("127.0.0.1", 0), handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, port


def test_proxy_streams_full_catalog_above_50k_entries(client: httpx.Client):
    playlist_bytes = _build_playlist(ENTRY_COUNT)
    assert playlist_bytes.count(b"#EXTINF") == ENTRY_COUNT

    server, port = _serve(playlist_bytes)
    try:
        source_url = f"http://127.0.0.1:{port}/tscheck-proxy-full.m3u"
        response = client.get(
            "/playlists/proxy",
            params={"url": source_url},
            timeout=60.0,
        )
        assert response.status_code == 200, response.text
        body = response.content
        assert len(body) == len(playlist_bytes), (
            f"proxy returned {len(body)} bytes, expected full {len(playlist_bytes)} bytes"
        )
        extinf_count = body.count(b"#EXTINF")
        assert extinf_count == ENTRY_COUNT, f"proxy delivered {extinf_count} entries, expected {ENTRY_COUNT}"
        assert b"tscheck-proxy-full Filme 059999" in body
    finally:
        server.shutdown()
