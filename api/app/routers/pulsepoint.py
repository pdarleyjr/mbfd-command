from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from ..domain.responses import IncidentUnitResponse, RunResponse
from ..domain.special_events import CustomUnitCreate, PulsePointAssignRequest
from ..services.special_event_service import SpecialEventService

router = APIRouter(prefix="/api/incidents/{incident_id}", tags=["pulsepoint"])


def _find(request: Request, external_id: str) -> dict | None:
    feed = request.app.state.pulsepoint_monitor.latest or {}
    return next((item for item in [*(feed.get("active") or []), *(feed.get("recent") or [])] if item.get("id") == external_id), None)


@router.get("/pulsepoint")
async def incident_pulsepoint(incident_id: str, request: Request) -> dict:
    return {"incidentId": incident_id, "feed": request.app.state.pulsepoint_monitor.latest}


@router.post("/pulsepoint/{external_id}/assign", response_model=RunResponse)
async def assign_pulsepoint_units(incident_id: str, external_id: str, body: PulsePointAssignRequest, request: Request) -> dict:
    pulsepoint = _find(request, external_id)
    if not pulsepoint: raise HTTPException(status_code=404, detail="PulsePoint incident not found in the latest server feed")
    try:
        run, event = await SpecialEventService().assign_pulsepoint(incident_id, pulsepoint, body.unitIds, client_id="operator")
    except ValueError as exc: raise HTTPException(status_code=409, detail=str(exc)) from exc
    await request.app.state.incident_hub.broadcast(incident_id, event)
    return run


@router.post("/units/custom", status_code=201, response_model=IncidentUnitResponse)
async def add_custom_unit(incident_id: str, body: CustomUnitCreate, request: Request) -> dict:
    try:
        unit, event = await SpecialEventService().add_custom_unit(incident_id, body.unitId.strip(), body.stagingLocationId, client_id="operator")
    except Exception as exc: raise HTTPException(status_code=409, detail="Unit already exists or staging location is invalid") from exc
    await request.app.state.incident_hub.broadcast(incident_id, event)
    return unit


@router.post("/pulsepoint/{external_id}/clear-now")
async def clear_pulsepoint_now(incident_id: str, external_id: str, request: Request) -> dict:
    event = await SpecialEventService().clear_pulsepoint(incident_id, external_id, client_id="operator")
    if not event: raise HTTPException(status_code=404, detail="PulsePoint run not found")
    await request.app.state.incident_hub.broadcast(incident_id, event)
    return {"ok": True, "event": event}


@router.post("/pulsepoint/{external_id}/keep-active")
async def keep_pulsepoint_active(incident_id: str, external_id: str, request: Request) -> dict:
    run = next((item for item in (await SpecialEventService().state(incident_id))["runs"] if item["sourceExternalId"] == external_id), None)
    if not run: raise HTTPException(status_code=404, detail="PulsePoint run not found")
    held = []
    for assignment in run["unitAssignments"]:
        if not assignment["clearedAt"]:
            _, event = await SpecialEventService().set_unit_hold(incident_id, assignment["unitId"], True, client_id="operator")
            await request.app.state.incident_hub.broadcast(incident_id, event)
            held.append(assignment["unitId"])
    return {"ok": True, "heldUnitIds": held}
