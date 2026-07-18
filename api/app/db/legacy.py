from __future__ import annotations

import asyncio
import json

from ..schemas import ParsedMessage
from .connection import db_connection


async def ensure_incident(incident_id: str, now: str) -> None:
    def write() -> None:
        with db_connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute("INSERT OR IGNORE INTO incidents (id, first_seen) VALUES (?, ?)", (incident_id, now))
                conn.commit()
            except Exception:
                conn.rollback()
                raise
    await asyncio.to_thread(write)


async def add_transcript(incident_id: str, msg: ParsedMessage, at: str) -> dict:
    def write() -> dict:
        with db_connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                cur = conn.execute(
                    """INSERT INTO transcript
                       (incident_id, at, speaker, recipient, display_prefix, raw_text,
                        corrected_text, message_type, priority, confidence, flags)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    (incident_id, at, msg.speaker, msg.recipient, msg.display_prefix, msg.raw_text,
                     msg.corrected_text, msg.message_type, msg.priority, msg.confidence, json.dumps(msg.flags)),
                )
                conn.commit()
                return {"id": cur.lastrowid, "at": at, **msg.model_dump()}
            except Exception:
                conn.rollback()
                raise
    return await asyncio.to_thread(write)


async def get_transcript(incident_id: str) -> list[dict]:
    def read() -> list[dict]:
        with db_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM transcript WHERE incident_id=? ORDER BY id", (incident_id,)
            ).fetchall()
            return [
                {
                    "id": row["id"], "at": row["at"], "speaker": row["speaker"],
                    "recipient": row["recipient"], "display_prefix": row["display_prefix"],
                    "raw_text": row["raw_text"], "corrected_text": row["corrected_text"],
                    "message_type": row["message_type"], "priority": row["priority"],
                    "confidence": row["confidence"], "flags": json.loads(row["flags"]),
                }
                for row in rows
            ]
    return await asyncio.to_thread(read)


async def clear_transcript(incident_id: str) -> None:
    def write() -> None:
        with db_connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute("DELETE FROM transcript WHERE incident_id=?", (incident_id,))
                conn.commit()
            except Exception:
                conn.rollback()
                raise
    await asyncio.to_thread(write)


async def save_board(incident_id: str, board_json: str, now: str) -> None:
    def write() -> None:
        with db_connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute(
                    """INSERT INTO board_snapshots VALUES (?, ?, ?)
                       ON CONFLICT(incident_id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at""",
                    (incident_id, board_json, now),
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
    await asyncio.to_thread(write)


async def get_board(incident_id: str) -> dict | None:
    def read() -> dict | None:
        with db_connection() as conn:
            row = conn.execute(
                "SELECT json, updated_at FROM board_snapshots WHERE incident_id=?", (incident_id,)
            ).fetchone()
            return None if row is None else {"board": json.loads(row["json"]), "updatedAt": row["updated_at"]}
    return await asyncio.to_thread(read)
