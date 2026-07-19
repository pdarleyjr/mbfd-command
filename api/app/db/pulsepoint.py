from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Any
from uuid import uuid4

from .connection import db_connection


class PulsePointRepository:
    def __init__(self, path: str):
        self.path = path

    def save_feed(self, feed: dict[str, Any]) -> None:
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute(
                    "INSERT INTO pulsepoint_snapshots (id, incident_id, fetched_at, stale, payload_json) VALUES (?, NULL, ?, ?, ?)",
                    (f"ppsnap_{uuid4().hex}", feed.get("fetchedAt") or datetime.now(timezone.utc).isoformat(), int(bool(feed.get("stale"))), json.dumps(feed)),
                )
                conn.execute(
                    """DELETE FROM pulsepoint_snapshots WHERE id IN (
                       SELECT id FROM pulsepoint_snapshots ORDER BY fetched_at DESC LIMIT -1 OFFSET 100
                    )"""
                )
                conn.commit()
            except Exception:
                conn.rollback(); raise

    def latest_feed(self) -> dict[str, Any] | None:
        with db_connection(self.path) as conn:
            row = conn.execute("SELECT payload_json FROM pulsepoint_snapshots ORDER BY fetched_at DESC LIMIT 1").fetchone()
            return json.loads(row["payload_json"]) if row else None
