from app.db.connection import initialize_database
from app.db.incidents import IncidentRepository
from app.db.special_events import SpecialEventRepository
from app.domain.models import create_incident_snapshot, IncidentCreateRequest
from app.services.pulsepoint_monitor import normalize_feed


def test_pulsepoint_assignment_is_atomic_and_unknown_units_stay_external(tmp_path) -> None:
    path = str(tmp_path / "pulsepoint.sqlite")
    initialize_database(path)
    incidents = IncidentRepository(path)
    snapshot = create_incident_snapshot(IncidentCreateRequest(mode="special_event", name="Detail"), "inc-event")
    incidents.create(snapshot, client_id="test", command_id="create")
    repo = SpecialEventRepository(path)
    pulsepoint = normalize_feed({"active": [{
        "id": "pp-1", "callTypeCode": "ME", "callType": "Medical Emergency",
        "units": [{"id": "Rescue 44"}, {"id": "County 9"}],
    }]})["active"][0]
    assert repo.pulsepoint_candidates(["R44", "COUNTY9"]) == {"inc-event": ["R44"]}
    run, event = repo.assign_pulsepoint("inc-event", pulsepoint, ["R44"], "monitor", "assign-once")
    assert event["action"] == "pulsepoint.assign_units"
    assert run["unitAssignments"][0]["assignmentSource"] == "pulsepoint"
    assert run["sourcePayload"]["units"][1]["normalizedId"] == "COUNTY9"
    assert not any(unit["unitId"] == "COUNTY9" for unit in repo.state("inc-event")["units"])


def test_auto_clear_respects_hold_transport_and_medical_disposition(tmp_path) -> None:
    path = str(tmp_path / "clear-safe.sqlite")
    initialize_database(path)
    incidents = IncidentRepository(path)
    snapshot = create_incident_snapshot(IncidentCreateRequest(mode="special_event", name="Detail"), "inc-event")
    incidents.create(snapshot, client_id="test", command_id="create")
    repo = SpecialEventRepository(path)
    pulsepoint = normalize_feed({"active": [{"id": "pp-1", "callTypeCode": "ME", "units": [{"id": "R44"}]}]})["active"][0]
    run, _ = repo.assign_pulsepoint("inc-event", pulsepoint, ["R44"], "monitor", "assign")
    repo.set_unit_hold("inc-event", "R44", True, "operator", "hold")
    repo.clear_pulsepoint("inc-event", "pp-1", "monitor", "clear-held")
    assert repo.get_run("inc-event", run["id"])["unitAssignments"][0]["clearedAt"] is None

    repo.set_unit_hold("inc-event", "R44", False, "operator", "unhold")
    repo.patch_assignment("inc-event", run["id"], "R44", {"disposition": "no_patient"}, "operator", "disposition")
    repo.clear_pulsepoint("inc-event", "pp-1", "monitor", "clear-final")
    assignment = repo.get_run("inc-event", run["id"])["unitAssignments"][0]
    assert assignment["clearedAt"] is not None
    assert assignment["disposition"] == "no_patient"
