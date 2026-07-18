from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel


class TranscriptionState(BaseModel):
    incident_id: str
    enabled: bool = False
    capture_client_id: str | None = None
    capture_label: str | None = None
    lease_id: str | None = None
    lease_expires_at: datetime | None = None
    started_at: datetime | None = None
    last_audio_at: datetime | None = None


class LeaseConflict(Exception):
    pass


class InvalidLease(Exception):
    pass


class TranscriptionManager:
    def __init__(self, lease_ttl_s: int = 10):
        self.lease_ttl_s = lease_ttl_s
        self._states: dict[str, TranscriptionState] = {}
        self._connections: dict[str, set[Any]] = {}
        self._lock = asyncio.Lock()

    def state(self, incident_id: str) -> TranscriptionState:
        state = self._states.setdefault(incident_id, TranscriptionState(incident_id=incident_id))
        if self._expired(state):
            self._states[incident_id] = TranscriptionState(incident_id=incident_id)
        return self._states[incident_id]

    async def connect(self, incident_id: str, websocket: Any) -> None:
        async with self._lock:
            self._connections.setdefault(incident_id, set()).add(websocket)

    async def disconnect(self, incident_id: str, websocket: Any) -> None:
        async with self._lock:
            peers = self._connections.get(incident_id)
            if peers:
                peers.discard(websocket)
                if not peers:
                    self._connections.pop(incident_id, None)

    async def acquire(self, incident_id: str, client_id: str, label: str) -> TranscriptionState:
        async with self._lock:
            current = self.state(incident_id)
            if current.enabled and current.capture_client_id != client_id:
                raise LeaseConflict(current.capture_label or current.capture_client_id or "another device")
            now = datetime.now(timezone.utc)
            lease_id = current.lease_id or f"lease_{uuid4().hex}"
            state = TranscriptionState(
                incident_id=incident_id, enabled=True, capture_client_id=client_id,
                capture_label=(label or "Capture device")[:120], lease_id=lease_id,
                lease_expires_at=now + timedelta(seconds=self.lease_ttl_s),
                started_at=current.started_at or now, last_audio_at=current.last_audio_at,
            )
            self._states[incident_id] = state
            return state

    async def heartbeat(self, incident_id: str, client_id: str, lease_id: str, audio: bool = False) -> TranscriptionState:
        async with self._lock:
            state = self.state(incident_id)
            if not state.enabled or state.capture_client_id != client_id or state.lease_id != lease_id:
                raise InvalidLease()
            now = datetime.now(timezone.utc)
            state.lease_expires_at = now + timedelta(seconds=self.lease_ttl_s)
            if audio:
                state.last_audio_at = now
            return state

    async def release(self, incident_id: str) -> TranscriptionState:
        async with self._lock:
            state = TranscriptionState(incident_id=incident_id)
            self._states[incident_id] = state
            return state

    async def broadcast(self, incident_id: str, payload: dict[str, Any]) -> None:
        peers = list(self._connections.get(incident_id, set()))
        stale: list[Any] = []
        for peer in peers:
            try:
                await peer.send_json(payload)
            except Exception:
                stale.append(peer)
        for peer in stale:
            await self.disconnect(incident_id, peer)

    @staticmethod
    def _expired(state: TranscriptionState) -> bool:
        return bool(state.enabled and state.lease_expires_at and state.lease_expires_at <= datetime.now(timezone.utc))
