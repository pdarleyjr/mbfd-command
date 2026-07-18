from app.db.incidents import IncidentRepository
from app.db.connection import initialize_database
from app.db.transcripts import TranscriptRepository
from app.domain.models import normalize_incident_snapshot
from app.schemas import ParsedMessage


def _incident(incident_id: str) -> dict:
    return normalize_incident_snapshot({
        "id": incident_id,
        "name": "Radio test",
        "createdAt": "2026-07-18T12:00:00Z",
        "updatedAt": "2026-07-18T12:00:00Z",
        "board": {"columns": [], "bankUnitIds": []},
    })


def test_raw_transcript_is_immediately_visible_then_enriched(tmp_path) -> None:
    path = str(tmp_path / "transcript.sqlite")
    initialize_database(path)
    IncidentRepository(path).create(_incident("inc_radio"), client_id="test", command_id="create")
    repo = TranscriptRepository(path)

    raw = repo.add_raw(
        "inc_radio", sequence=1, text="Engine one to command mayday",
        audio_started_at="2026-07-18T12:01:00Z", audio_ended_at="2026-07-18T12:01:02Z",
        stt_latency_ms=320,
    )
    assert raw["rawText"] == "Engine one to command mayday"
    assert raw["flags"] == ["pending_enrichment"]

    parsed = ParsedMessage(
        speaker="E1", recipient="Command", display_prefix="E1",
        raw_text=raw["rawText"], corrected_text=raw["rawText"],
        message_type="mayday", priority="emergency", confidence=0.9, flags=["mayday"],
    )
    enriched = repo.enrich(raw["id"], parsed)
    assert enriched["id"] == raw["id"]
    assert enriched["speaker"] == "E1"
    assert repo.list_for_incident("inc_radio") == [enriched]


def test_clear_is_incident_scoped(tmp_path) -> None:
    path = str(tmp_path / "clear.sqlite")
    initialize_database(path)
    incidents = IncidentRepository(path)
    for incident_id in ("inc_a", "inc_b"):
        incidents.create(_incident(incident_id), client_id="test", command_id=f"create-{incident_id}")
    repo = TranscriptRepository(path)
    repo.add_raw("inc_a", 1, "A", None, None, 10)
    repo.add_raw("inc_b", 1, "B", None, None, 10)
    repo.clear("inc_a")
    assert repo.list_for_incident("inc_a") == []
    assert len(repo.list_for_incident("inc_b")) == 1
