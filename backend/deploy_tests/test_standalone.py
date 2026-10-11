"""Fast, provider-free smoke tests for independent IPTV deployment."""
import socket

import httpx
import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

from standalone import app
from outbound_guard import enforce_request_host


def test_health_without_mongo(monkeypatch):
    monkeypatch.delenv("LUX_ALLOWED_HOSTS", raising=False)
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["configured"] is False


def test_unconfigured_public_proxy_refuses_requests(monkeypatch):
    monkeypatch.delenv("LUX_ALLOWED_HOSTS", raising=False)
    with TestClient(app) as client:
        response = client.get("/api/playlists/proxy", params={"url": "https://example.com/media.m3u"})
    assert response.status_code == 503


def test_private_or_unlisted_sources_blocked(monkeypatch):
    monkeypatch.setenv("LUX_ALLOWED_HOSTS", "example.com")
    with TestClient(app) as client:
        for path in ("/api/playlists/proxy", "/api/media/proxy", "/api/media/remux"):
            response = client.get(path, params={"url": "http://127.0.0.1:1234/secret"})
            assert response.status_code == 403, (path, response.text)


def test_missing_url_keeps_fastapi_validation(monkeypatch):
    monkeypatch.setenv("LUX_ALLOWED_HOSTS", "example.com")
    with TestClient(app) as client:
        response = client.get("/api/playlists/proxy")
        post_response = client.post("/api/playlists/parse-url", json={"source_type": "m3u"})
    assert response.status_code == 422
    assert post_response.status_code == 422


def test_post_streaming_m3u_validates_url_and_allowlist(monkeypatch):
    monkeypatch.delenv("LUX_ALLOWED_HOSTS", raising=False)
    with TestClient(app) as client:
        no_config = client.post("/api/playlists/proxy", json={"url": "https://example.com/test.m3u"})
    assert no_config.status_code == 503

    monkeypatch.setenv("LUX_ALLOWED_HOSTS", "example.com")
    with TestClient(app) as client:
        bad_host = client.post("/api/playlists/proxy", json={"url": "http://127.0.0.1:1234/private.m3u"})
        empty = client.post("/api/playlists/proxy", json={})
    assert bad_host.status_code == 403
    assert empty.status_code == 422


@pytest.mark.asyncio
async def test_redirect_host_cannot_escape_allowlist(monkeypatch):
    monkeypatch.setenv("LUX_ALLOWED_HOSTS", "example.com")
    def fake_getaddrinfo(*args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 443))]
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    def redirect(request: httpx.Request):
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data"})

    transport = httpx.MockTransport(redirect)
    async with httpx.AsyncClient(transport=transport, follow_redirects=True, event_hooks={"request": [enforce_request_host]}) as client:
        with pytest.raises(HTTPException) as exc:
            await client.get("https://example.com/playlist")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_provider_http_200_json_error_is_not_imported_as_m3u(monkeypatch):
    from routers import playlists

    class StubClient:
        closed = False

        def __init__(self, **kwargs):
            pass

        def build_request(self, method, url):
            return httpx.Request(method, url)

        async def send(self, req, stream=False):
            return httpx.Response(
                200,
                content=b'{"error":"MySQL: Cannot connect to database!"}',
                headers={"content-type": "application/json"},
                request=req,
            )

        async def aclose(self):
            self.closed = True

    fake = StubClient()
    monkeypatch.setattr(playlists.httpx, "AsyncClient", lambda **kwargs: fake)
    with pytest.raises(HTTPException) as exc:
        await playlists._stream_playlist_url("https://example.com/catalog.m3u")
    assert exc.value.status_code == 502
    assert "MySQL" not in exc.value.detail
    assert fake.closed is True


@pytest.mark.asyncio
async def test_playlist_streams_valid_m3u_without_entire_file_buffer(monkeypatch):
    from routers import playlists

    content = b'#EXTM3U\n#EXTINF:-1,A&E\nhttps://example.com/live.m3u8\n'

    class StubClient:
        def __init__(self, **kwargs):
            pass

        def build_request(self, method, url):
            return httpx.Request(method, url)

        async def send(self, req, stream=False):
            return httpx.Response(200, content=content, request=req)

        async def aclose(self):
            return None

    monkeypatch.setattr(playlists.httpx, "AsyncClient", StubClient)
    response = await playlists._stream_playlist_url("https://example.com/catalog.m3u")
    received = b"".join([chunk async for chunk in response.body_iterator])
    assert received == content

@pytest.mark.asyncio
async def test_extra_allowed_host_is_accepted_by_outbound_guard(monkeypatch):
    """Direct request must not 403 after standalone accepted the same exact host."""
    monkeypatch.setenv("LUX_ALLOWED_HOSTS", "example.com")
    monkeypatch.setenv("LUX_EXTRA_ALLOWED_HOSTS", "cdn.jmvstream.com")

    def fake_getaddrinfo(*args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 443))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    checked = []
    def serve(request: httpx.Request):
        checked.append(request.url.host)
        return httpx.Response(200, content=b"ok")

    async with httpx.AsyncClient(transport=httpx.MockTransport(serve),
                                 event_hooks={"request": [enforce_request_host]}) as client:
        response = await client.get("https://cdn.jmvstream.com/playlist.m3u8")
    assert response.status_code == 200
    assert checked == ["cdn.jmvstream.com"]


@pytest.mark.asyncio
async def test_extra_host_does_not_allow_unlisted_redirect(monkeypatch):
    monkeypatch.setenv("LUX_ALLOWED_HOSTS", "example.com")
    monkeypatch.setenv("LUX_EXTRA_ALLOWED_HOSTS", "cdn.jmvstream.com")
    def fake_getaddrinfo(*args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 443))]
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    def redirect(request: httpx.Request):
        return httpx.Response(302, headers={"location": "https://unapproved.example.net/media"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(redirect),
                                 follow_redirects=True,
                                 event_hooks={"request": [enforce_request_host]}) as client:
        with pytest.raises(HTTPException) as exc:
            await client.get("https://cdn.jmvstream.com/playlist.m3u8")
    assert exc.value.status_code == 403
