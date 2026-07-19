from __future__ import annotations

from datetime import datetime, timezone
import json
from uuid import uuid4

from .connection import db_connection


class ExportRepository:
    def __init__(self, path: str):
        self.path = path

    def report_rows(self, incident_id: str) -> dict | None:
        with db_connection(self.path) as conn:
            incident = conn.execute(
                "SELECT * FROM incidents_v2 WHERE id=? AND mode='special_event'", (incident_id,)
            ).fetchone()
            if not incident:
                return None
            runs = conn.execute(
                "SELECT * FROM runs WHERE incident_id=? ORDER BY received_at, id", (incident_id,)
            ).fetchall()
            assignments = conn.execute(
                """SELECT ru.* FROM run_units ru JOIN runs r ON r.id=ru.run_id
                   WHERE r.incident_id=? ORDER BY ru.assigned_at, ru.unit_id""", (incident_id,)
            ).fetchall()
            overrides = conn.execute(
                """SELECT event_type, payload_json, occurred_at FROM incident_events
                   WHERE incident_id=? AND actor_client_id='operator'
                     AND event_type IN ('run.updated','run.unit_updated','unit.manual_hold_changed','pulsepoint.auto_cleared')
                   ORDER BY revision""", (incident_id,)
            ).fetchall()
            return {
                "incident": dict(incident),
                "runs": [dict(row) for row in runs],
                "assignments": [dict(row) for row in assignments],
                "overrides": [dict(row) for row in overrides],
            }

    def record(self, incident_id: str, export_type: str, sha256: str, metadata: dict) -> dict:
        export_id = f"export_{uuid4().hex}"
        created_at = datetime.now(timezone.utc).isoformat()
        with db_connection(self.path) as conn:
            conn.execute(
                "INSERT INTO exports (id, incident_id, export_type, sha256, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (export_id, incident_id, export_type, sha256, json.dumps(metadata), created_at),
            )
        return {"id": export_id, "incident_id": incident_id, "export_type": export_type,
                "sha256": sha256, "metadata": metadata, "created_at": created_at}

    def list(self, incident_id: str) -> list[dict]:
        with db_connection(self.path) as conn:
            rows = conn.execute(
                "SELECT * FROM exports WHERE incident_id=? ORDER BY created_at DESC", (incident_id,)
            ).fetchall()
            return [{"id": row["id"], "incident_id": row["incident_id"],
                     "export_type": row["export_type"], "sha256": row["sha256"],
                     "metadata": json.loads(row["metadata_json"]), "created_at": row["created_at"]}
                    for row in rows]
