from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Any
from uuid import uuid4

from ..schemas import ParsedMessage
from .connection import db_connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _entry(row: Any) -> dict[str, Any]:
    parsed = json.loads(row["parsed_json"]) if row["parsed_json"] else {}
    return {
        "id": row["id"],
        "at": row["created_at"],
        "speaker": parsed.get("speaker"),
        "recipient": parsed.get("recipient"),
        "displayPrefix": parsed.get("display_prefix") or "inaudible",
        "rawText": row["raw_text"],
        "correctedText": row["corrected_text"] or row["raw_text"],
        "messageType": parsed.get("message_type") or "unknown",
        "priority": parsed.get("priority") or "routine",
        "confidence": parsed.get("confidence", 0.0),
        "flags": parsed.get("flags") or (["pending_enrichment"] if row["state"] == "raw" else []),
        "sequence": row["sequence"],
        "state": row["state"],
        "sttLatencyMs": row["stt_latency_ms"],
    }


class TranscriptRepository:
    def __init__(self, path: str):
        self.path = path

    def next_sequence(self, incident_id: str) -> int:
        with db_connection(self.path) as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(sequence), 0) + 1 AS value FROM transcripts_v2 WHERE incident_id=?",
                (incident_id,),
            ).fetchone()
            return int(row["value"])

    def add_raw(
        self,
        incident_id: str,
        sequence: int,
        text: str,
        audio_started_at: str | None,
        audio_ended_at: str | None,
        stt_latency_ms: int,
    ) -> dict[str, Any]:
        entry_id, now = f"tx_{uuid4().hex}", _now()
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute(
                    """INSERT INTO transcripts_v2
                       (id, incident_id, sequence, state, raw_text, corrected_text,
                        parsed_json, audio_started_at, audio_ended_at, stt_latency_ms,
                        created_at, updated_at)
                       VALUES (?, ?, ?, 'raw', ?, ?, NULL, ?, ?, ?, ?, ?)""",
                    (entry_id, incident_id, sequence, text, text, audio_started_at,
                     audio_ended_at, stt_latency_ms, now, now),
                )
                row = conn.execute("SELECT * FROM transcripts_v2 WHERE id=?", (entry_id,)).fetchone()
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return _entry(row)

    def enrich(self, entry_id: str, parsed: ParsedMessage) -> dict[str, Any]:
        now = _now()
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute(
                    """UPDATE transcripts_v2 SET state='enriched', corrected_text=?,
                       parsed_json=?, updated_at=? WHERE id=?""",
                    (parsed.corrected_text, json.dumps(parsed.model_dump()), now, entry_id),
                )
                row = conn.execute("SELECT * FROM transcripts_v2 WHERE id=?", (entry_id,)).fetchone()
                if row is None:
                    raise KeyError(entry_id)
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return _entry(row)

    def list_for_incident(self, incident_id: str) -> list[dict[str, Any]]:
        with db_connection(self.path) as conn:
            rows = conn.execute(
                "SELECT * FROM transcripts_v2 WHERE incident_id=? ORDER BY sequence", (incident_id,)
            ).fetchall()
            return [_entry(row) for row in rows]

    def clear(self, incident_id: str) -> int:
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                cursor = conn.execute("DELETE FROM transcripts_v2 WHERE incident_id=?", (incident_id,))
                conn.commit()
                return cursor.rowcount
            except Exception:
                conn.rollback()
                raise
