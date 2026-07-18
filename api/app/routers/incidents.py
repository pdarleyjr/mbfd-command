from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..domain.models import IncidentCreateRequest
from ..services.incident_service import IncidentService

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.post("", status_code=201)
async def create_incident(request: IncidentCreateRequest) -> dict:
    return await IncidentService().create(request)


@router.get("/{incident_id}")
async def get_incident(incident_id: str) -> dict:
    snapshot = await IncidentService().get_snapshot(incident_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return snapshot


@router.get("/{incident_id}/events")
async def get_incident_events(
    incident_id: str,
    after_revision: int = Query(default=0, alias="afterRevision", ge=0),
) -> dict:
    service = IncidentService()
    if await service.get_snapshot(incident_id) is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"incidentId": incident_id, "events": await service.list_events(incident_id, after_revision)}
