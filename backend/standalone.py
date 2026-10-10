"""Standalone Lux IPTV API: same playlist/media routers, no Emergent or Mongo required.

Use this ASGI entrypoint for the external Docker deployment. The original
server.py is retained so the Emergent preview remains unaffected during cutover.
"""
import os
import ipaddress
import socket
import asyncio
from urllib.parse import urlparse

from fastapi import FastAPI, Depends, HTTPException, Request
from starlette.middleware.cors import CORSMiddleware

from routers.playlists import router as playlists_router
from routers.media import router as media_router

app = FastAPI(title="Lux Player IPTV API", version="3.0", docs_url=None, redoc_url=None)

origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "https://devsouza208.github.io").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Range"],
    expose_headers=["Content-Length", "Content-Range", "Accept-Ranges"],
)

async def require_allowed_source(request: Request) -> None:
    """Limit which providers the externally accessible proxy can contact.

    This is a deployment guard; it does not replace outbound network policy,
    redirect/DNS-rebinding protection, authentication or rate limiting.
    """
    hosts = {name.strip().lower().strip(".") for name in os.getenv("LUX_ALLOWED_HOSTS", "").split(",") if name.strip()}
    if not hosts:
        raise HTTPException(status_code=503, detail="API ainda não configurada: LUX_ALLOWED_HOSTS")

    if request.method == "GET":
        source = request.query_params.get("url", "")
    else:
        try:
            data = await request.json()
        except ValueError:
            raise HTTPException(status_code=422, detail="JSON inválido")
        source = data.get("server") or data.get("url") or ""
        if source and "://" not in source:
            source = "http://" + source

    parsed = urlparse(source)
    hostname = (parsed.hostname or "").lower().strip(".")
    if parsed.scheme not in {"http", "https"} or not hostname or hostname not in hosts:
        raise HTTPException(status_code=403, detail="Domínio de origem não autorizado")
    if parsed.username or parsed.password:
        raise HTTPException(status_code=403, detail="Credenciais na autoridade da URL não são permitidas")

    # Avoid direct localhost/private targets. HTTP redirects should additionally
    # be constrained by upstream egress policy before exposing to many users.
    try:
        resolved = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM),
        )
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Servidor de origem não encontrado") from exc
    if not resolved or any(not ipaddress.ip_address(entry[4][0]).is_global for entry in resolved):
        raise HTTPException(status_code=403, detail="Endereço de origem não autorizado")


app.include_router(playlists_router, prefix="/api", dependencies=[Depends(require_allowed_source)])
app.include_router(media_router, prefix="/api", dependencies=[Depends(require_allowed_source)])


@app.get("/api/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "lux-player-iptv", "configured": bool(os.getenv("LUX_ALLOWED_HOSTS", "").strip())}
