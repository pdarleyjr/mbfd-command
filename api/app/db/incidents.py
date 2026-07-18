from __future__ import annotations

from datetime import datetime, timezone
import json
import sqlite3
from typing import Any
from uuid import uuid4

from ..domain.models import normalize_incident_snapshot
from .connection import db_connection
from .migrations import _insert_snapshot


def _event_from_row(row: sqlite3.Row) -> dict[str, Any]:
    payload = json.loads(row["payload_json"])
    return {
        "type": "event",
        "eventId": row["id"],
        "incidentId": row["incident_id"],
        "revision": row["revision"],
        "serverAt": row["occurred_at"],
        "actorClientId": row["actor_client_id"],
        "action": row["event_type"],
        "payload": payload,
    }


class IncidentRepository:
    def __init__(self, path: str):
        self.path = path

    def get_snapshot(self, incident_id: str) -> dict[str, Any] | None:
        with db_connection(self.path) as conn:
            row = conn.execute(
                "SELECT snapshot_json FROM incident_snapshots WHERE incident_id=?", (incident_id,)
            ).fetchone()
            return json.loads(row["snapshot_json"]) if row else None

    def get_event_by_command(self, incident_id: str, command_id: str) -> dict[str, Any] | None:
        with db_connection(self.path) as conn:
            row = conn.execute(
                "SELECT * FROM incident_events WHERE incident_id=? AND idempotency_key=?",
                (incident_id, command_id),
            ).fetchone()
            return _event_from_row(row) if row else None

    def list_events(self, incident_id: str, after_revision: int = 0) -> list[dict[str, Any]]:
        with db_connection(self.path) as conn:
            rows = conn.execute(
                """SELECT * FROM incident_events
                   WHERE incident_id=? AND revision>? ORDER BY revision""",
                (incident_id, after_revision),
            ).fetchall()
            return [_event_from_row(row) for row in rows]

    def create(
        self,
        snapshot: dict[str, Any],
        *,
        client_id: str,
        command_id: str,
    ) -> dict[str, Any]:
        canonical = normalize_incident_snapshot(snapshot, revision=1)
        now = datetime.now(timezone.utc).isoformat()
        canonical["updatedAt"] = now
        event_id = f"evt_{uuid4().hex}"
        payload = {"snapshot": canonical}
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                existing = conn.execute(
                    "SELECT * FROM incident_events WHERE incident_id=? AND idempotency_key=?",
                    (canonical["id"], command_id),
                ).fetchone()
                if existing:
                    conn.rollback()
                    return _event_from_row(existing)
                if conn.execute("SELECT 1 FROM incidents_v2 WHERE id=?", (canonical["id"],)).fetchone():
                    raise ValueError("incident already exists")
                _insert_snapshot(conn, canonical)
                conn.execute(
                    """INSERT INTO incident_events
                       (id, incident_id, revision, event_type, actor_client_id,
                        payload_json, idempotency_key, occurred_at)
                       VALUES (?, ?, 1, 'incident.created', ?, ?, ?, ?)""",
                    (event_id, canonical["id"], client_id, json.dumps(payload), command_id, now),
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return {
            "type": "event", "eventId": event_id, "incidentId": canonical["id"],
            "revision": 1, "serverAt": now, "actorClientId": client_id,
            "action": "incident.created", "payload": payload,
        }

    def replace_snapshot(
        self,
        incident_id: str,
        snapshot: dict[str, Any],
        *,
        base_revision: int,
        client_id: str,
        command_id: str,
    ) -> tuple[dict[str, Any], bool]:
        now = datetime.now(timezone.utc).isoformat()
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                duplicate = conn.execute(
                    "SELECT * FROM incident_events WHERE incident_id=? AND idempotency_key=?",
                    (incident_id, command_id),
                ).fetchone()
                if duplicate:
                    conn.rollback()
                    return _event_from_row(duplicate), True

                row = conn.execute(
                    "SELECT revision FROM incidents_v2 WHERE id=?", (incident_id,)
                ).fetchone()
                if row is None:
                    if base_revision != 0:
                        raise RevisionConflict(0)
                    canonical = normalize_incident_snapshot(snapshot, revision=1)
                    canonical["id"] = incident_id
                    canonical["updatedAt"] = now
                    revision = 1
                    action = "incident.created"
                else:
                    current_revision = int(row["revision"])
                    if base_revision != current_revision:
                        raise RevisionConflict(current_revision)
                    revision = current_revision + 1
                    canonical = normalize_incident_snapshot(snapshot, revision=revision)
                    if canonical["id"] != incident_id:
                        raise ValueError("incident mismatch")
                    canonical["updatedAt"] = now
                    action = "incident.replace_snapshot"

                event_id = f"evt_{uuid4().hex}"
                payload = {"snapshot": canonical}
                _insert_snapshot(conn, canonical)
                conn.execute(
                    """INSERT INTO incident_events
                       (id, incident_id, revision, event_type, actor_client_id,
                        payload_json, idempotency_key, occurred_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (event_id, incident_id, revision, action, client_id, json.dumps(payload), command_id, now),
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return ({
            "type": "event", "eventId": event_id, "incidentId": incident_id,
            "revision": revision, "serverAt": now, "actorClientId": client_id,
            "action": action, "payload": payload,
        }, False)


class RevisionConflict(Exception):
    def __init__(self, current_revision: int):
        self.current_revision = current_revision
        super().__init__(f"revision conflict; current revision is {current_revision}")
