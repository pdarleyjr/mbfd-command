from __future__ import annotations

import asyncio
from typing import Any

from fastapi import WebSocket


class IncidentHub:
    """Single-process, incident-keyed WebSocket fan-out."""

    def __init__(self) -> None:
        self._incidents: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, incident_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._incidents.setdefault(incident_id, set()).add(websocket)

    async def disconnect(self, incident_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            peers = self._incidents.get(incident_id)
            if not peers:
                return
            peers.discard(websocket)
            if not peers:
                self._incidents.pop(incident_id, None)

    async def broadcast(self, incident_id: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            peers = list(self._incidents.get(incident_id, set()))
        stale: list[WebSocket] = []
        for peer in peers:
            try:
                await peer.send_json(payload)
            except Exception:
                stale.append(peer)
        for peer in stale:
            await self.disconnect(incident_id, peer)

    async def send_one(self, websocket: WebSocket, payload: dict[str, Any]) -> None:
        await websocket.send_json(payload)
