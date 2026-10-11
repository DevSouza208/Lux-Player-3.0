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
