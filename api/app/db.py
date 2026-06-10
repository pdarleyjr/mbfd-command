from __future__ import annotations

import asyncio
import json
import sqlite3
import threading
from pathlib import Path

from .config import get_settings
from .schemas import ParsedMessage

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _connect() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        path = Path(get_settings().db_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(path), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL;")
        _init(_conn)
    return _conn


def _init(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY,
            first_seen TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS transcript (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id TEXT NOT NULL,
            at TEXT NOT NULL,
            speaker TEXT,
            recipient TEXT,
            display_prefix TEXT NOT NULL,
            raw_text TEXT NOT NULL,
            corrected_text TEXT NOT NULL,
            message_type TEXT NOT NULL,
            priority TEXT NOT NULL,
            confidence REAL NOT NULL,
            flags TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_transcript_incident
            ON transcript (incident_id, id);
        CREATE TABLE IF NOT EXISTS board_snapshots (
            incident_id TEXT PRIMARY KEY,
            json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )
    conn.commit()


def _row_to_entry(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "at": row["at"],
        "speaker": row["speaker"],
        "recipient": row["recipient"],
        "display_prefix": row["display_prefix"],
        "raw_text": row["raw_text"],
        "corrected_text": row["corrected_text"],
        "message_type": row["message_type"],
        "priority": row["priority"],
        "confidence": row["confidence"],
        "flags": json.loads(row["flags"]),
    }


# ── Sync core (guarded) ───────────────────────────────────────────────


def _ensure_incident(incident_id: str, now: str) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            "INSERT OR IGNORE INTO incidents (id, first_seen) VALUES (?, ?)",
            (incident_id, now),
        )
        conn.commit()


def _add_transcript(incident_id: str, msg: ParsedMessage, at: str) -> dict:
    with _lock:
        conn = _connect()
        cur = conn.execute(
            """INSERT INTO transcript
               (incident_id, at, speaker, recipient, display_prefix, raw_text,
                corrected_text, message_type, priority, confidence, flags)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                incident_id,
                at,
                msg.speaker,
                msg.recipient,
                msg.display_prefix,
                msg.raw_text,
                msg.corrected_text,
                msg.message_type,
                msg.priority,
                msg.confidence,
                json.dumps(msg.flags),
            ),
        )
        conn.commit()
        row_id = cur.lastrowid
    return {"id": row_id, "at": at, **msg.model_dump()}


def _get_transcript(incident_id: str) -> list[dict]:
    with _lock:
        conn = _connect()
        rows = conn.execute(
            "SELECT * FROM transcript WHERE incident_id = ? ORDER BY id ASC",
            (incident_id,),
        ).fetchall()
    return [_row_to_entry(r) for r in rows]


def _clear_transcript(incident_id: str) -> None:
    with _lock:
        conn = _connect()
        conn.execute("DELETE FROM transcript WHERE incident_id = ?", (incident_id,))
        conn.commit()


def _save_board(incident_id: str, board_json: str, now: str) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            """INSERT INTO board_snapshots (incident_id, json, updated_at)
               VALUES (?, ?, ?)
               ON CONFLICT(incident_id) DO UPDATE SET json=excluded.json,
                                                      updated_at=excluded.updated_at""",
            (incident_id, board_json, now),
        )
        conn.commit()


def _get_board(incident_id: str) -> dict | None:
    with _lock:
        conn = _connect()
        row = conn.execute(
            "SELECT json, updated_at FROM board_snapshots WHERE incident_id = ?",
            (incident_id,),
        ).fetchone()
    if not row:
        return None
    return {"board": json.loads(row["json"]), "updatedAt": row["updated_at"]}


# ── Async wrappers ────────────────────────────────────────────────────


async def ensure_incident(incident_id: str, now: str) -> None:
    await asyncio.to_thread(_ensure_incident, incident_id, now)


async def add_transcript(incident_id: str, msg: ParsedMessage, at: str) -> dict:
    return await asyncio.to_thread(_add_transcript, incident_id, msg, at)


async def get_transcript(incident_id: str) -> list[dict]:
    return await asyncio.to_thread(_get_transcript, incident_id)


async def clear_transcript(incident_id: str) -> None:
    await asyncio.to_thread(_clear_transcript, incident_id)


async def save_board(incident_id: str, board_json: str, now: str) -> None:
    await asyncio.to_thread(_save_board, incident_id, board_json, now)


async def get_board(incident_id: str) -> dict | None:
    return await asyncio.to_thread(_get_board, incident_id)


def init_db() -> None:
    _connect()
