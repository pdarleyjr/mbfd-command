import importlib

from fastapi.testclient import TestClient


def load_app(tmp_path, monkeypatch):
    monkeypatch.setenv("CMD_DB_PATH", str(tmp_path / "cmd.sqlite"))
    monkeypatch.setenv("CMD_REALTIME_V2", "true")
    monkeypatch.setenv("CMD_PULSEPOINT_MONITOR_ENABLED", "false")
    monkeypatch.setenv("CMD_STT_MODEL_PROVISION_ENABLED", "false")
    from app import config

    config.get_settings.cache_clear()
    return importlib.reload(importlib.import_module("app.main"))


def test_incident_scoped_websocket_revisions_idempotency_and_reconnect(tmp_path, monkeypatch):
    main = load_app(tmp_path, monkeypatch)

    with TestClient(main.app) as client:
        created = client.post("/api/incidents", json={"mode": "scene", "name": "Test Incident"})
        assert created.status_code == 201
        incident = created.json()
        assert incident["schemaVersion"] == 2
        assert incident["revision"] == 1

        with client.websocket_connect(f"/ws/incidents/{incident['id']}?client=a&lastRevision=0") as a:
            with client.websocket_connect(
                f"/ws/incidents/{incident['id']}?client=b&lastRevision=0"
            ) as b:
                assert a.receive_json()["type"] == "snapshot"
                assert b.receive_json()["type"] == "snapshot"

                updated = {**incident, "name": "Renamed by A"}
                command = {
                    "type": "command",
                    "commandId": "cmd-once",
                    "incidentId": incident["id"],
                    "baseRevision": 1,
                    "action": "incident.replace_snapshot",
                    "payload": {"snapshot": updated},
                }
                a.send_json(command)
                event_a = a.receive_json()
                event_b = b.receive_json()
                assert event_a["type"] == event_b["type"] == "event"
                assert event_a["revision"] == event_b["revision"] == 2
                assert event_a["payload"]["snapshot"]["name"] == "Renamed by A"

                a.send_json(command)
                duplicate = a.receive_json()
                assert duplicate["eventId"] == event_a["eventId"]
                assert duplicate["revision"] == 2

                a.send_json({**command, "commandId": "cmd-stale"})
                rejected = a.receive_json()
                assert rejected == {
                    "type": "command.rejected",
                    "commandId": "cmd-stale",
                    "incidentId": incident["id"],
                    "reason": "revision_conflict",
                    "currentRevision": 2,
                }

        with client.websocket_connect(
            f"/ws/incidents/{incident['id']}?client=reconnected&lastRevision=0"
        ) as reconnected:
            snapshot = reconnected.receive_json()
            assert snapshot["type"] == "snapshot"
            assert snapshot["revision"] == 2
            assert snapshot["snapshot"]["name"] == "Renamed by A"

        audit = client.get(f"/api/incidents/{incident['id']}/events")
        assert audit.status_code == 200
        assert [event["revision"] for event in audit.json()["events"]] == [1, 2]


def test_incident_mismatch_is_rejected(tmp_path, monkeypatch):
    main = load_app(tmp_path, monkeypatch)
    with TestClient(main.app) as client:
        incident = client.post("/api/incidents", json={"mode": "scene", "name": "A"}).json()
        with client.websocket_connect(f"/ws/incidents/{incident['id']}?client=a") as ws:
            ws.receive_json()
            ws.send_json(
                {
                    "type": "command",
                    "commandId": "cmd-wrong",
                    "incidentId": "inc-other",
                    "baseRevision": 1,
                    "action": "incident.replace_snapshot",
                    "payload": {"snapshot": incident},
                }
            )
            assert ws.receive_json()["reason"] == "incident_mismatch"
