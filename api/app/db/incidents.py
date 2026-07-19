from __future__ import annotations

from datetime import datetime, timezone
import json
import sqlite3
from typing import Any
from uuid import uuid4

from ..domain.models import normalize_incident_snapshot
from .connection import db_connection
from .migrations import _insert_snapshot


def append_event_in_transaction(
    conn: sqlite3.Connection,
    incident_id: str,
    action: str,
    payload: dict[str, Any],
    *,
    client_id: str,
    command_id: str,
    snapshot_changes: dict[str, Any] | None = None,
) -> dict[str, Any]:
    duplicate = conn.execute(
        "SELECT * FROM incident_events WHERE incident_id=? AND idempotency_key=?",
        (incident_id, command_id),
    ).fetchone()
    if duplicate:
        return _event_from_row(duplicate)
    row = conn.execute(
        "SELECT snapshot_json, revision FROM incident_snapshots WHERE incident_id=?", (incident_id,)
    ).fetchone()
    if row is None:
        raise KeyError(incident_id)
    revision = int(row["revision"]) + 1
    now = datetime.now(timezone.utc).isoformat()
    snapshot = json.loads(row["snapshot_json"])
    if snapshot_changes:
        snapshot.update(snapshot_changes)
    snapshot = normalize_incident_snapshot(snapshot, revision=revision)
    snapshot["updatedAt"] = now
    _insert_snapshot(conn, snapshot)
    event_id = f"evt_{uuid4().hex}"
    event_payload = {**payload, "snapshot": snapshot}
    conn.execute(
        """INSERT INTO incident_events
           (id, incident_id, revision, event_type, actor_client_id,
            payload_json, idempotency_key, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (event_id, incident_id, revision, action, client_id, json.dumps(event_payload), command_id, now),
    )
    return {
        "type": "event", "eventId": event_id, "incidentId": incident_id,
        "revision": revision, "serverAt": now, "actorClientId": client_id,
        "action": action, "payload": event_payload,
    }


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

    def list_special_ids(self) -> list[str]:
        with db_connection(self.path) as conn:
            return [row["id"] for row in conn.execute(
                "SELECT id FROM incidents_v2 WHERE mode='special_event' AND lifecycle_status IN ('scheduled','active')"
            ).fetchall()]

    def patch_snapshot(
        self, incident_id: str, changes: dict[str, Any], action: str,
        *, client_id: str, command_id: str, payload: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                event = append_event_in_transaction(
                    conn, incident_id, action, payload or {"changes": changes},
                    client_id=client_id, command_id=command_id, snapshot_changes=changes,
                )
                snapshot = event["payload"]["snapshot"]
                conn.commit()
            except Exception:
                conn.rollback(); raise
        return snapshot, event

    def reconcile_schedule(self, incident_id: str, now: datetime | None = None) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        now = now or datetime.now(timezone.utc)
        snapshot = self.get_snapshot(incident_id)
        if not snapshot or snapshot.get("mode") != "special_event":
            return snapshot, None
        schedule = dict(snapshot.get("schedule") or {})
        changes: dict[str, Any] = {}
        action = ""
        scheduled_start = _parse_iso(schedule.get("scheduledStartAt"))
        scheduled_end = _parse_iso(schedule.get("scheduledEndAt"))
        if not schedule.get("actualEndAt") and scheduled_end and scheduled_end <= now:
            schedule["actualEndAt"] = scheduled_end.isoformat()
            changes = {"schedule": schedule, "lifecycleStatus": "ended"}
            action = "timer.ended_scheduled"
        elif not schedule.get("actualStartAt") and scheduled_start and scheduled_start <= now:
            schedule["actualStartAt"] = scheduled_start.isoformat()
            changes = {"schedule": schedule, "lifecycleStatus": "active"}
            action = "timer.started_scheduled"
        if not changes:
            return snapshot, None
        return self.patch_snapshot(
            incident_id, changes, action, client_id="scheduler",
            command_id=f"{action}-{schedule.get('actualEndAt') or schedule.get('actualStartAt')}",
        )

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
        initial_staging: dict[str, Any] | None = None,
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
                if canonical["mode"] == "special_event":
                    location = initial_staging or {
                        "label": "Primary Staging", "address": "", "lat": None, "lng": None
                    }
                    location_id = f"stg_{uuid4().hex}"
                    conn.execute(
                        """INSERT INTO staging_locations
                           (id, incident_id, name, address, lat, lng, notes, is_default, created_at, updated_at)
                           VALUES (?, ?, ?, ?, ?, ?, '', 1, ?, ?)""",
                        (location_id, canonical["id"], location.get("label") or "Primary Staging",
                         location.get("address") or "", location.get("lat"), location.get("lng"), now, now),
                    )
                    from ..domain.models import DEFAULT_UNITS
                    conn.executemany(
                        """INSERT INTO incident_units
                           (incident_id, unit_id, operational_status, staging_location_id,
                            previous_staging_location_id, current_run_id, manual_hold, status_updated_at)
                           VALUES (?, ?, 'staged', ?, NULL, NULL, 0, ?)""",
                        [(canonical["id"], unit_id, location_id, now) for unit_id in DEFAULT_UNITS],
                    )
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

    def append_event(
        self,
        incident_id: str,
        action: str,
        payload: dict[str, Any],
        *,
        client_id: str,
        command_id: str,
    ) -> dict[str, Any]:
        """Append an audited non-snapshot mutation and advance canonical revision."""
        now = datetime.now(timezone.utc).isoformat()
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                event = append_event_in_transaction(
                    conn, incident_id, action, payload, client_id=client_id, command_id=command_id
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return event


class RevisionConflict(Exception):
    def __init__(self, current_revision: int):
        self.current_revision = current_revision
        super().__init__(f"revision conflict; current revision is {current_revision}")


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
