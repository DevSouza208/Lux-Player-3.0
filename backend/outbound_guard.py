"""Outbound request guard for independently hosted Lux IPTV APIs.

When LUX_ALLOWED_HOSTS is set, validates every outgoing HTTPX request,
including automatic redirects, so redirects cannot escape the allowlist.
The Emergent development server has no allowlist and remains unchanged.
"""
import asyncio
import ipaddress
import os
import socket
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException


async def enforce_request_host(request: httpx.Request) -> None:
    configured = ",".join((
        os.getenv("LUX_ALLOWED_HOSTS", ""),
        os.getenv("LUX_EXTRA_ALLOWED_HOSTS", ""),
    ))
    if not configured.strip().strip(",").strip():
        return

    allowed = {entry.strip().lower().strip(".") for entry in configured.split(",") if entry.strip()}
    parsed = urlparse(str(request.url))
    hostname = (parsed.hostname or "").strip(".").lower()
    if parsed.scheme not in {"http", "https"} or hostname not in allowed:
        raise HTTPException(status_code=403, detail="Redirecionamento para domínio não autorizado")

    try:
        addresses = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: socket.getaddrinfo(
                hostname,
                parsed.port or (443 if parsed.scheme == "https" else 80),
                type=socket.SOCK_STREAM,
            ),
        )
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Servidor remoto não encontrado") from exc

    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise HTTPException(status_code=403, detail="Endereço remoto não permitido")
