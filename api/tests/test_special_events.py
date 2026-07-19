import importlib
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient


def load_app(tmp_path, monkeypatch):
    monkeypatch.setenv("CMD_DB_PATH", str(tmp_path / "cmd.sqlite"))
    from app import config
    config.get_settings.cache_clear()
    return importlib.reload(importlib.import_module("app.main"))


def test_special_event_creation_initializes_staging_and_units(tmp_path, monkeypatch) -> None:
    main = load_app(tmp_path, monkeypatch)
    with TestClient(main.app) as client:
        created = client.post('/api/incidents', json={
            'mode': 'special_event', 'name': 'FIFA', 'startImmediately': False,
            'scheduledStartAt': '2099-07-18T22:00:00Z',
            'initialStagingLocation': {'label': 'North Staging', 'address': '100 Collins', 'lat': 25.79, 'lng': -80.13},
        })
        assert created.status_code == 201
        incident = created.json()
        assert incident['lifecycleStatus'] == 'scheduled'
        state = client.get(f"/api/incidents/{incident['id']}/event-state").json()
        assert state['stagingLocations'][0]['name'] == 'North Staging'
        assert len(state['units']) >= 20
        assert all(unit['status'] == 'staged' for unit in state['units'])


def test_manual_run_assignment_and_clear_return_to_prior_staging(tmp_path, monkeypatch) -> None:
    main = load_app(tmp_path, monkeypatch)
    with TestClient(main.app) as client:
        incident = client.post('/api/incidents', json={
            'mode': 'special_event', 'name': 'Detail', 'startImmediately': True,
        }).json()
        state = client.get(f"/api/incidents/{incident['id']}/event-state").json()
        staging_id = state['stagingLocations'][0]['id']
        created = client.post(f"/api/incidents/{incident['id']}/runs", json={
            'callTypeLabel': 'Medical Emergency', 'category': 'medical', 'subtype': 'medical',
            'address': '1000 Collins Avenue', 'receivedAt': '2026-07-18T12:00:00Z',
            'unitIds': ['R44'], 'noUnitAssigned': False,
        })
        assert created.status_code == 201
        run = created.json()
        assert run['unitAssignments'][0]['unitId'] == 'R44'
        active_state = client.get(f"/api/incidents/{incident['id']}/event-state").json()
        r44 = next(unit for unit in active_state['units'] if unit['unitId'] == 'R44')
        assert r44['status'] == 'responding'
        assert r44['previousStagingLocationId'] == staging_id

        cleared = client.post(
            f"/api/incidents/{incident['id']}/runs/{run['id']}/units/R44/clear",
            json={'returnStagingLocationId': staging_id, 'disposition': 'no_patient'},
        )
        assert cleared.status_code == 200
        final_state = client.get(f"/api/incidents/{incident['id']}/event-state").json()
        r44 = next(unit for unit in final_state['units'] if unit['unitId'] == 'R44')
        assert r44['status'] == 'staged'
        assert r44['currentRunId'] is None


def test_medical_clear_requires_disposition(tmp_path, monkeypatch) -> None:
    main = load_app(tmp_path, monkeypatch)
    with TestClient(main.app) as client:
        incident = client.post('/api/incidents', json={'mode': 'special_event', 'name': 'Detail'}).json()
        run = client.post(f"/api/incidents/{incident['id']}/runs", json={
            'callTypeLabel': 'Medical', 'category': 'medical', 'subtype': 'medical',
            'receivedAt': '2026-07-18T12:00:00Z', 'unitIds': ['R44'], 'noUnitAssigned': False,
        }).json()
        response = client.post(f"/api/incidents/{incident['id']}/runs/{run['id']}/units/R44/clear", json={})
        assert response.status_code == 409


def test_absolute_timer_supports_past_future_and_overdue_end(tmp_path, monkeypatch) -> None:
    main = load_app(tmp_path, monkeypatch)
    with TestClient(main.app) as client:
        incident = client.post('/api/incidents', json={'mode': 'special_event', 'name': 'Timer'}).json()
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        started = client.post(f"/api/incidents/{incident['id']}/timer/start", json={'startAt': past.isoformat()}).json()
        assert started['lifecycleStatus'] == 'active'
        assert started['schedule']['actualStartAt'].startswith(past.date().isoformat())

        future = datetime.now(timezone.utc) + timedelta(hours=1)
        scheduled = client.post(f"/api/incidents/{incident['id']}/timer/start", json={'startAt': future.isoformat()}).json()
        assert scheduled['lifecycleStatus'] == 'scheduled'
        assert scheduled['schedule']['actualStartAt'] is None

        overdue_end = datetime.now(timezone.utc) - timedelta(minutes=1)
        response = client.patch(f"/api/incidents/{incident['id']}/schedule", json={
            'scheduledStartAt': (overdue_end - timedelta(hours=1)).isoformat(),
            'scheduledEndAt': overdue_end.isoformat(),
        })
        assert response.status_code == 200
        assert response.json()['lifecycleStatus'] == 'ended'
        assert response.json()['schedule']['actualEndAt'] is not None
