import httpx
import pytest

BASE = "http://localhost:8001"
SOURCE = "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/br.m3u"


@pytest.mark.asyncio
async def test_remote_m3u_parse_returns_catalog():
    async with httpx.AsyncClient(base_url=BASE, timeout=45) as client:
        response = await client.post(
            "/api/playlists/parse-url",
            json={"source_type": "m3u", "url": SOURCE, "playlist_name": "tscheck-remote"},
        )
    assert response.status_code == 200, response.text[:500]
    payload = response.json()
    assert payload["source_type"] == "m3u"
    assert payload["items"]
    assert any(item["stream_url"] for item in payload["items"])


@pytest.mark.asyncio
async def test_m3u_parse_requires_url():
    async with httpx.AsyncClient(base_url=BASE, timeout=15) as client:
        response = await client.post("/api/playlists/parse-url", json={"source_type": "m3u"})
    assert response.status_code == 422
    assert "URL" in response.text
