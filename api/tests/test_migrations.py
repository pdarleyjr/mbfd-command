import json
import sqlite3


def test_legacy_snapshot_migrates_to_scene_without_data_loss(tmp_path):
    path = tmp_path / "legacy.sqlite"
    incident = {
        "id": "inc-legacy",
        "name": "Legacy Scene",
        "address": "100 Ocean Drive",
        "marker": {"lat": 25.77, "lng": -80.13},
        "createdAt": "2026-06-10T12:00:00Z",
        "updatedAt": "2026-06-10T12:05:00Z",
        "closedAt": None,
        "timer": {"startedAt": "2026-06-10T12:00:00Z", "accumulatedMs": 0, "running": True},
        "board": {"columns": [], "bankUnitIds": []},
    }
    with sqlite3.connect(path) as conn:
        conn.execute(
            "CREATE TABLE incident_snapshots (channel TEXT PRIMARY KEY, incident_id TEXT NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        conn.execute(
            "INSERT INTO incident_snapshots VALUES (?, ?, ?, ?)",
            ("active", incident["id"], json.dumps(incident), incident["updatedAt"]),
        )

    from app.db.migrations import run_migrations
    from app.db.incidents import IncidentRepository

    run_migrations(str(path))
    migrated = IncidentRepository(str(path)).get_snapshot("inc-legacy")
    assert migrated is not None
    assert migrated["schemaVersion"] == 2
    assert migrated["mode"] == "scene"
    assert migrated["name"] == "Legacy Scene"
    assert migrated["board"] == incident["board"]
    assert migrated["schedule"]["actualStartAt"] == "2026-06-10T12:00:00Z"
    assert migrated["revision"] == 0


def test_short_lived_connections_enable_foreign_keys_and_busy_timeout(tmp_path):
    from app.db.connection import db_connection

    path = str(tmp_path / "settings.sqlite")
    with db_connection(path) as conn:
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 5000
