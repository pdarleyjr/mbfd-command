import asyncio
import importlib

from fastapi.testclient import TestClient


def test_incident_sync_websocket_broadcasts_and_persists(tmp_path, monkeypatch):
    monkeypatch.setenv("CMD_DB_PATH", str(tmp_path / "cmd.sqlite"))

    from app import config, db

    config.get_settings.cache_clear()
    if db._conn is not None:
        db._conn.close()
        db._conn = None

    main = importlib.reload(importlib.import_module("app.main"))

    incident = {
        "id": "inc-test",
        "name": "Test Incident",
        "address": "100 Ocean Dr",
        "marker": {"lat": 25.77, "lng": -80.13},
        "createdAt": "2026-06-11T15:00:00Z",
        "updatedAt": "2026-06-11T15:00:00Z",
        "closedAt": None,
        "timer": {"startedAt": None, "accumulatedMs": 0, "running": False},
        "board": {"columns": [], "bankUnitIds": [], "customUnits": [], "unitTimers": {}},
    }

    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/incident?channel=test&client=a") as a:
            with client.websocket_connect("/ws/incident?channel=test&client=b") as b:
                assert a.receive_json()["type"] == "ready"
                assert b.receive_json()["type"] == "ready"

                a.send_json({"type": "incident.update", "clientId": "a", "incident": incident})

                assert a.receive_json()["type"] == "incident.ack"
                pushed = b.receive_json()
                assert pushed["type"] == "incident.snapshot"
                assert pushed["clientId"] == "a"
                assert pushed["incident"]["name"] == "Test Incident"

    snapshot = asyncio.run(db.get_incident_snapshot("test"))
    assert snapshot is not None
    assert snapshot["incidentId"] == "inc-test"
    assert snapshot["incident"]["address"] == "100 Ocean Dr"
    if db._conn is not None:
        db._conn.close()
        db._conn = None
