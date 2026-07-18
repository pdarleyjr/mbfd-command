from __future__ import annotations

from datetime import datetime, timezone
import json
import sqlite3

from ..domain.models import normalize_incident_snapshot
from .connection import db_connection


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {str(row[1]) for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def _create_legacy_tables(conn: sqlite3.Connection) -> None:
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


def _migration_v2(conn: sqlite3.Connection) -> None:
    if _table_exists(conn, "incident_snapshots") and "channel" in _columns(conn, "incident_snapshots"):
        if not _table_exists(conn, "legacy_incident_snapshots"):
            conn.execute("ALTER TABLE incident_snapshots RENAME TO legacy_incident_snapshots")

    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS incidents_v2 (
            id TEXT PRIMARY KEY,
            mode TEXT NOT NULL CHECK (mode IN ('scene', 'special_event')),
            name TEXT NOT NULL,
            lifecycle_status TEXT NOT NULL,
            address TEXT NOT NULL DEFAULT '',
            lat REAL,
            lng REAL,
            command_post_json TEXT,
            scheduled_start_at TEXT,
            scheduled_end_at TEXT,
            actual_start_at TEXT,
            actual_end_at TEXT,
            revision INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            closed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS incident_snapshots (
            incident_id TEXT PRIMARY KEY,
            revision INTEGER NOT NULL,
            snapshot_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (incident_id) REFERENCES incidents_v2(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS staging_locations (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            name TEXT NOT NULL,
            address TEXT NOT NULL DEFAULT '',
            lat REAL,
            lng REAL,
            notes TEXT NOT NULL DEFAULT '',
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (incident_id) REFERENCES incidents_v2(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS incident_units (
            incident_id TEXT NOT NULL,
            unit_id TEXT NOT NULL,
            operational_status TEXT NOT NULL,
            staging_location_id TEXT,
            previous_staging_location_id TEXT,
            current_run_id TEXT,
            manual_hold INTEGER NOT NULL DEFAULT 0,
            status_updated_at TEXT NOT NULL,
            PRIMARY KEY (incident_id, unit_id),
            FOREIGN KEY (incident_id) REFERENCES incidents_v2(id) ON DELETE CASCADE,
            FOREIGN KEY (staging_location_id) REFERENCES staging_locations(id)
        );
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('pulsepoint', 'manual')),
            source_external_id TEXT,
            source_payload_json TEXT,
            incident_number TEXT NOT NULL DEFAULT '',
            call_type_code TEXT NOT NULL DEFAULT '',
            call_type_label TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL,
            subtype TEXT NOT NULL,
            classification_overridden INTEGER NOT NULL DEFAULT 0,
            address TEXT NOT NULL DEFAULT '',
            lat REAL,
            lng REAL,
            received_at TEXT NOT NULL,
            activated_at TEXT,
            cleared_at TEXT,
            status TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (incident_id) REFERENCES incidents_v2(id) ON DELETE CASCADE,
            UNIQUE (incident_id, source, source_external_id)
        );
        CREATE TABLE IF NOT EXISTS run_units (
            run_id TEXT NOT NULL,
            unit_id TEXT NOT NULL,
            assigned_at TEXT NOT NULL,
            enroute_at TEXT,
            on_scene_at TEXT,
            transport_at TEXT,
            cleared_at TEXT,
            disposition TEXT,
            transport_destination TEXT NOT NULL DEFAULT '',
            patient_count INTEGER,
            notes TEXT NOT NULL DEFAULT '',
            assignment_source TEXT NOT NULL,
            previous_staging_location_id TEXT,
            PRIMARY KEY (run_id, unit_id),
            FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS incident_events (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            actor_client_id TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            idempotency_key TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            FOREIGN KEY (incident_id) REFERENCES incidents_v2(id) ON DELETE CASCADE,
            UNIQUE (incident_id, revision),
            UNIQUE (incident_id, idempotency_key)
        );
        CREATE TABLE IF NOT EXISTS transcripts_v2 (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            sequence INTEGER NOT NULL,
            state TEXT NOT NULL,
            raw_text TEXT NOT NULL,
            corrected_text TEXT NOT NULL DEFAULT '',
            parsed_json TEXT,
            audio_started_at TEXT,
            audio_ended_at TEXT,
            stt_latency_ms INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (incident_id) REFERENCES incidents_v2(id) ON DELETE CASCADE,
            UNIQUE (incident_id, sequence)
        );
        CREATE TABLE IF NOT EXISTS pulsepoint_snapshots (
            id TEXT PRIMARY KEY,
            incident_id TEXT,
            fetched_at TEXT NOT NULL,
            stale INTEGER NOT NULL DEFAULT 0,
            payload_json TEXT NOT NULL,
            FOREIGN KEY (incident_id) REFERENCES incidents_v2(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS exports (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            export_type TEXT NOT NULL,
            sha256 TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            FOREIGN KEY (incident_id) REFERENCES incidents_v2(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_runs_incident_status
            ON runs (incident_id, status, received_at);
        CREATE INDEX IF NOT EXISTS idx_run_units_unit
            ON run_units (unit_id, cleared_at);
        CREATE INDEX IF NOT EXISTS idx_incident_events_revision
            ON incident_events (incident_id, revision);
        CREATE INDEX IF NOT EXISTS idx_transcripts_v2_incident_sequence
            ON transcripts_v2 (incident_id, sequence);
        """
    )

    if _table_exists(conn, "legacy_incident_snapshots"):
        rows = conn.execute(
            "SELECT incident_id, json, updated_at FROM legacy_incident_snapshots"
        ).fetchall()
        for row in rows:
            if conn.execute("SELECT 1 FROM incidents_v2 WHERE id=?", (row["incident_id"],)).fetchone():
                continue
            try:
                snapshot = normalize_incident_snapshot(json.loads(row["json"]), revision=0)
            except (ValueError, TypeError, json.JSONDecodeError):
                continue
            _insert_snapshot(conn, snapshot)


def _insert_snapshot(conn: sqlite3.Connection, snapshot: dict) -> None:
    marker = snapshot.get("marker") or {}
    schedule = snapshot["schedule"]
    conn.execute(
        """INSERT INTO incidents_v2
           (id, mode, name, lifecycle_status, address, lat, lng, command_post_json,
            scheduled_start_at, scheduled_end_at, actual_start_at, actual_end_at,
            revision, created_at, updated_at, closed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             mode=excluded.mode, name=excluded.name,
             lifecycle_status=excluded.lifecycle_status, address=excluded.address,
             lat=excluded.lat, lng=excluded.lng,
             command_post_json=excluded.command_post_json,
             scheduled_start_at=excluded.scheduled_start_at,
             scheduled_end_at=excluded.scheduled_end_at,
             actual_start_at=excluded.actual_start_at,
             actual_end_at=excluded.actual_end_at,
             revision=excluded.revision, updated_at=excluded.updated_at,
             closed_at=excluded.closed_at""",
        (
            snapshot["id"], snapshot["mode"], snapshot["name"], snapshot["lifecycleStatus"],
            snapshot["address"], marker.get("lat"), marker.get("lng"),
            json.dumps(snapshot.get("commandPost")) if snapshot.get("commandPost") else None,
            schedule.get("scheduledStartAt"), schedule.get("scheduledEndAt"),
            schedule.get("actualStartAt"), schedule.get("actualEndAt"), snapshot["revision"],
            snapshot["createdAt"], snapshot["updatedAt"], snapshot.get("closedAt"),
        ),
    )
    conn.execute(
        """INSERT INTO incident_snapshots
           (incident_id, revision, snapshot_json, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(incident_id) DO UPDATE SET
             revision=excluded.revision,
             snapshot_json=excluded.snapshot_json,
             updated_at=excluded.updated_at""",
        (snapshot["id"], snapshot["revision"], json.dumps(snapshot), snapshot["updatedAt"]),
    )


def run_migrations(path: str) -> None:
    with db_connection(path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
            )
            applied = {
                int(row[0]) for row in conn.execute("SELECT version FROM schema_migrations").fetchall()
            }
            if 1 not in applied:
                _create_legacy_tables(conn)
                conn.execute(
                    "INSERT INTO schema_migrations VALUES (?, ?)",
                    (1, datetime.now(timezone.utc).isoformat()),
                )
            if 2 not in applied:
                _migration_v2(conn)
                conn.execute(
                    "INSERT INTO schema_migrations VALUES (?, ?)",
                    (2, datetime.now(timezone.utc).isoformat()),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
