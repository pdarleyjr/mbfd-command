import asyncio
from datetime import datetime, timezone

import httpx

from app.config import Settings
from app.db.connection import db_connection, initialize_database
from app.db.incidents import IncidentRepository
from app.domain.models import GeoLocation, IncidentCreateRequest, create_incident_snapshot
from app.services.report_service import ReportService


def seeded_report(tmp_path) -> tuple[str, ReportService]:
    path = str(tmp_path / "report.sqlite")
    initialize_database(path)
    snapshot = create_incident_snapshot(IncidentCreateRequest(
        mode="special_event", name="Ocean Drive Detail", startImmediately=True,
        commandPost=GeoLocation(label="Command 1", address="100 Ocean Dr", lat=None, lng=None),
    ), "inc-report")
    IncidentRepository(path).create(snapshot, client_id="test", command_id="create")
    with db_connection(path) as conn:
        conn.execute("UPDATE incidents_v2 SET actual_start_at='2026-07-18T10:00:00+00:00', actual_end_at='2026-07-18T12:00:00+00:00', lifecycle_status='ended' WHERE id='inc-report'")
        conn.executemany(
            """INSERT INTO runs
               (id, incident_id, source, source_external_id, source_payload_json, incident_number,
                call_type_code, call_type_label, category, subtype, classification_overridden,
                address, lat, lng, received_at, activated_at, cleared_at, status, notes, created_at, updated_at)
               VALUES (?, 'inc-report', ?, NULL, NULL, ?, '', ?, ?, ?, 0, '', NULL, NULL, ?, ?, ?, 'cleared', '', ?, ?)""",
            [
                ("run-med", "manual", "MB-1", "Medical Emergency", "medical", "medical",
                 "2026-07-18T10:05:00+00:00", "2026-07-18T10:10:00+00:00", "2026-07-18T10:40:00+00:00",
                 "2026-07-18T10:05:00+00:00", "2026-07-18T10:40:00+00:00"),
                ("run-fire", "pulsepoint", "MB-2", "Fire Alarm", "fire", "alarm",
                 "2026-07-18T10:55:00+00:00", "2026-07-18T11:00:00+00:00", "2026-07-18T11:30:00+00:00",
                 "2026-07-18T10:55:00+00:00", "2026-07-18T11:30:00+00:00"),
            ],
        )
        conn.executemany(
            """INSERT INTO run_units
               (run_id, unit_id, assigned_at, cleared_at, disposition, transport_destination,
                patient_count, notes, assignment_source, previous_staging_location_id)
               VALUES (?, ?, ?, ?, ?, '', NULL, '', 'operator', NULL)""",
            [
                ("run-med", "R44", "2026-07-18T10:10:00+00:00", "2026-07-18T10:40:00+00:00", "transport"),
                ("run-med", "E1", "2026-07-18T10:20:00+00:00", "2026-07-18T10:40:00+00:00", "refusal"),
                ("run-fire", "E1", "2026-07-18T11:00:00+00:00", "2026-07-18T11:30:00+00:00", "not_applicable"),
            ],
        )
    settings = Settings(db_path=path, static_dir="", ollama_url="http://ollama.test", parse_timeout_s=1)
    return path, ReportService(path, settings)


def test_report_statistics_exactly_match_logged_times_and_outcomes(tmp_path) -> None:
    _, service = seeded_report(tmp_path)
    stats = asyncio.run(service.build_stats("inc-report", now=datetime(2026, 7, 18, 13, tzinfo=timezone.utc)))
    assert stats.total_duration_minutes == 120
    assert stats.total_runs == 2
    assert (stats.medical_runs, stats.fire_runs, stats.other_runs) == (1, 1, 0)
    assert (stats.manual_runs, stats.pulsepoint_runs) == (1, 1)
    assert stats.total_run_minutes == 60
    assert stats.total_unit_call_minutes == 80
    assert stats.average_run_minutes == 30
    assert stats.total_unit_assignments == 3
    assert (stats.transports, stats.refusals, stats.no_patient) == (1, 1, 0)
    assert next(unit for unit in stats.units if unit.unit_id == "E1").active_minutes == 50


def test_qwen_outage_uses_fallback_and_pdf_still_renders(tmp_path) -> None:
    _, service = seeded_report(tmp_path)
    stats = asyncio.run(service.build_stats("inc-report"))

    async def fail(_: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "offline"})

    async def narrative():
        async with httpx.AsyncClient(transport=httpx.MockTransport(fail)) as client:
            return await service.build_narrative(stats, client)

    fallback = asyncio.run(narrative())
    assert "recorded 2 run" in fallback.executive_summary
    assert any("unavailable" in note for note in stats.data_quality_notes)
    pdf = service.render_pdf(stats, fallback)
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 4_000
