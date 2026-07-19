from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request

from ..domain.models import IncidentCreateRequest, IncidentPatchRequest
from ..domain.special_events import SchedulePatch, TimerEndRequest, TimerStartRequest
from ..domain.responses import IncidentSnapshotResponse
from ..services.incident_service import IncidentService

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.post("", status_code=201, response_model=IncidentSnapshotResponse)
async def create_incident(request: IncidentCreateRequest) -> dict:
    return await IncidentService().create(request)


@router.get("/{incident_id}", response_model=IncidentSnapshotResponse)
async def get_incident(incident_id: str) -> dict:
    snapshot = await IncidentService().get_snapshot(incident_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return snapshot


@router.patch("/{incident_id}", response_model=IncidentSnapshotResponse)
async def patch_incident(incident_id: str, body: IncidentPatchRequest, request: Request) -> dict:
    values = body.model_dump(exclude_unset=True)
    changes: dict = {}
    if "name" in values: changes["name"] = values["name"].strip()
    if "address" in values: changes["address"] = values["address"]
    if "commandPost" in values:
        command_post = values["commandPost"]
        changes["commandPost"] = command_post.model_dump() if command_post else None
    try:
        snapshot, event = await IncidentService().patch_snapshot(incident_id, changes, "incident.updated")
    except KeyError as exc: raise HTTPException(status_code=404, detail="Incident not found") from exc
    await request.app.state.incident_hub.broadcast(incident_id, event)
    return snapshot


@router.post("/{incident_id}/timer/start", response_model=IncidentSnapshotResponse)
async def start_timer(incident_id: str, body: TimerStartRequest, request: Request) -> dict:
    snapshot = await IncidentService().get_snapshot(incident_id)
    if not snapshot: raise HTTPException(status_code=404, detail="Incident not found")
    now = datetime.now(timezone.utc)
    start = body.startAt.astimezone(timezone.utc) if body.startAt else now
    schedule = dict(snapshot["schedule"])
    if start > now:
        schedule.update({"scheduledStartAt": start.isoformat(), "actualStartAt": None})
        lifecycle = "scheduled"
    else:
        schedule["actualStartAt"] = start.isoformat()
        lifecycle = "active"
    updated, event = await IncidentService().patch_snapshot(
        incident_id, {"schedule": schedule, "lifecycleStatus": lifecycle}, "timer.started"
    )
    await request.app.state.incident_hub.broadcast(incident_id, event); return updated


@router.post("/{incident_id}/timer/end", response_model=IncidentSnapshotResponse)
async def end_timer(incident_id: str, body: TimerEndRequest, request: Request) -> dict:
    snapshot = await IncidentService().get_snapshot(incident_id)
    if not snapshot: raise HTTPException(status_code=404, detail="Incident not found")
    if body.clearActiveRuns:
        from ..services.special_event_service import SpecialEventService
        try:
            event = await SpecialEventService().clear_all_active(incident_id)
            if event: await request.app.state.incident_hub.broadcast(incident_id, event)
        except Exception as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    end = (body.endAt.astimezone(timezone.utc) if body.endAt else datetime.now(timezone.utc)).isoformat()
    schedule = {**snapshot["schedule"], "actualEndAt": end}
    updated, event = await IncidentService().patch_snapshot(
        incident_id, {"schedule": schedule, "lifecycleStatus": "ended"}, "timer.ended"
    )
    await request.app.state.incident_hub.broadcast(incident_id, event); return updated


@router.patch("/{incident_id}/schedule", response_model=IncidentSnapshotResponse)
async def patch_schedule(incident_id: str, body: SchedulePatch, request: Request) -> dict:
    snapshot = await IncidentService().get_snapshot(incident_id)
    if not snapshot: raise HTTPException(status_code=404, detail="Incident not found")
    values = body.model_dump(exclude_unset=True, mode="json")
    schedule = {**snapshot["schedule"], **values}
    if schedule.get("scheduledStartAt") and schedule.get("scheduledEndAt"):
        if datetime.fromisoformat(schedule["scheduledEndAt"]) <= datetime.fromisoformat(schedule["scheduledStartAt"]):
            raise HTTPException(status_code=422, detail="Scheduled end must be after scheduled start")
    lifecycle = snapshot["lifecycleStatus"]
    if schedule.get("scheduledStartAt") and not schedule.get("actualStartAt"):
        lifecycle = "scheduled"
    updated, event = await IncidentService().patch_snapshot(
        incident_id, {"schedule": schedule, "lifecycleStatus": lifecycle}, "schedule.updated"
    )
    await request.app.state.incident_hub.broadcast(incident_id, event)
    reconciled, transition = await IncidentService().reconcile(incident_id)
    if transition: await request.app.state.incident_hub.broadcast(incident_id, transition)
    return reconciled or updated


@router.get("/{incident_id}/events")
async def get_incident_events(
    incident_id: str,
    after_revision: int = Query(default=0, alias="afterRevision", ge=0),
) -> dict:
    service = IncidentService()
    if await service.get_snapshot(incident_id) is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"incidentId": incident_id, "events": await service.list_events(incident_id, after_revision)}
