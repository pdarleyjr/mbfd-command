from __future__ import annotations

import asyncio
import hashlib
import re

from fastapi import APIRouter, HTTPException, Request, Response

from ..config import get_settings
from ..domain.reports import ExportRecord
from ..services.incident_service import IncidentService
from ..services.report_service import ReportService

router = APIRouter(prefix="/api/incidents/{incident_id}/exports", tags=["exports"])


def safe_filename(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-").lower()
    return (slug or "event")[:70]


@router.post("/event-summary.pdf", response_class=Response)
async def create_event_summary(incident_id: str, request: Request) -> Response:
    if not get_settings().event_pdf_export:
        raise HTTPException(status_code=404, detail="Event PDF export is disabled")
    snapshot, event = await IncidentService().reconcile(incident_id)
    if event:
        await request.app.state.incident_hub.broadcast(incident_id, event)
    if not snapshot or snapshot.get("mode") != "special_event":
        raise HTTPException(status_code=404, detail="Special event not found")
    service = ReportService()
    stats = await service.build_stats(incident_id)
    narrative = await service.build_narrative(stats, request.app.state.http)
    pdf_bytes = await asyncio.to_thread(service.render_pdf, stats, narrative)
    digest = hashlib.sha256(pdf_bytes).hexdigest()
    await asyncio.to_thread(
        service.repository.record, incident_id, "event_summary_pdf", digest,
        {"eventName": stats.event_name, "totalRuns": stats.total_runs,
         "deterministicStats": True, "narrativeFallback": any("unavailable" in note.lower() for note in narrative.data_quality_notes)},
    )
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename(stats.event_name)}-summary.pdf"',
            "X-Content-SHA256": digest,
        },
    )


@router.get("", response_model=list[ExportRecord])
async def list_exports(incident_id: str) -> list[dict]:
    return await asyncio.to_thread(ReportService().repository.list, incident_id)
