import importlib

from fastapi.testclient import TestClient


def load_app(tmp_path, monkeypatch):
    monkeypatch.setenv("CMD_DB_PATH", str(tmp_path / "cmd.sqlite"))
    monkeypatch.setenv("CMD_PULSEPOINT_MONITOR_ENABLED", "false")
    monkeypatch.setenv("CMD_STT_MODEL_PROVISION_ENABLED", "false")
    from app import config
    config.get_settings.cache_clear()
    return importlib.reload(importlib.import_module("app.main"))


def test_capture_lease_is_shared_and_any_viewer_can_stop(tmp_path, monkeypatch) -> None:
    main = load_app(tmp_path, monkeypatch)
    with TestClient(main.app) as client:
        incident = client.post('/api/incidents', json={'mode': 'scene', 'name': 'Audio'}).json()
        path = f"/ws/incidents/{incident['id']}/audio"
        with client.websocket_connect(f"{path}?client=a") as first:
            assert first.receive_json()['type'] == 'transcription.state'
            first.send_json({'action': 'transcription.acquire', 'payload': {'captureLabel': 'Command Tablet'}})
            acquired = first.receive_json()
            assert acquired['type'] == 'transcription.lease_acquired'
            assert acquired['payload']['leaseId'].startswith('lease_')
            assert first.receive_json()['state']['captureLabel'] == 'Command Tablet'

            with client.websocket_connect(f"{path}?client=b") as second:
                assert second.receive_json()['state']['captureClientId'] == 'a'
                second.send_json({'action': 'transcription.acquire', 'payload': {'captureLabel': 'Lobby'}})
                assert second.receive_json()['type'] == 'error'
                second.send_json({'action': 'transcription.stop', 'payload': {}})
                assert first.receive_json()['state']['enabled'] is False
                assert second.receive_json()['state']['enabled'] is False


def test_clear_transcript_creates_audited_revision(tmp_path, monkeypatch) -> None:
    main = load_app(tmp_path, monkeypatch)
    with TestClient(main.app) as client:
        incident = client.post('/api/incidents', json={'mode': 'scene', 'name': 'Clear'}).json()
        response = client.delete(f"/api/incidents/{incident['id']}/transcript")
        assert response.status_code == 200
        events = client.get(f"/api/incidents/{incident['id']}/events").json()['events']
        assert events[-1]['action'] == 'transcript.cleared'
        assert events[-1]['revision'] == 2
