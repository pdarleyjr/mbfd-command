from __future__ import annotations

import asyncio
from typing import Any

from ..config import get_settings
from ..db.transcripts import TranscriptRepository
from ..schemas import ParsedMessage


class TranscriptService:
    def __init__(self, path: str | None = None):
        self.repository = TranscriptRepository(path or get_settings().db_path)

    async def next_sequence(self, incident_id: str) -> int:
        return await asyncio.to_thread(self.repository.next_sequence, incident_id)

    async def add_raw(self, incident_id: str, sequence: int, text: str, **metadata: Any) -> dict:
        return await asyncio.to_thread(
            self.repository.add_raw, incident_id, sequence, text,
            metadata.get("audio_started_at"), metadata.get("audio_ended_at"),
            metadata.get("stt_latency_ms", 0),
        )

    async def enrich(self, entry_id: str, parsed: ParsedMessage) -> dict:
        return await asyncio.to_thread(self.repository.enrich, entry_id, parsed)

    async def list_for_incident(self, incident_id: str) -> list[dict]:
        return await asyncio.to_thread(self.repository.list_for_incident, incident_id)

    async def clear(self, incident_id: str) -> int:
        return await asyncio.to_thread(self.repository.clear, incident_id)
