from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from ..db.special_events import DispositionRequired
from ..domain.special_events import AssignRunUnits, ClearRunUnit, ManualRunCreate, RunPatch, RunUnitPatch, StagingLocationCreate, UnitHoldPatch, UnitStagingPatch
from ..services.special_event_service import SpecialEventService
from ..domain.responses import EventStateResponse, IncidentUnitResponse, RunListResponse, RunResponse, RunUnitResponse, StagingLocationResponse

router = APIRouter(prefix="/api/incidents/{incident_id}", tags=["special-events"])


async def _broadcast(request: Request, incident_id: str, event: dict) -> None:
    await request.app.state.incident_hub.broadcast(incident_id, event)


@router.get("/event-state", response_model=EventStateResponse)
async def event_state(incident_id: str) -> dict:
    return await SpecialEventService().state(incident_id)


@router.post("/staging-locations", status_code=201, response_model=StagingLocationResponse)
async def create_staging_location(incident_id: str, body: StagingLocationCreate, request: Request) -> dict:
    location, event = await SpecialEventService().add_location(incident_id, body.model_dump())
    await _broadcast(request, incident_id, event)
    return location


@router.get("/runs", response_model=RunListResponse)
async def list_runs(incident_id: str) -> dict:
    state = await SpecialEventService().state(incident_id)
    return {"incidentId": incident_id, "runs": state["runs"]}


@router.post("/runs", status_code=201, response_model=RunResponse)
async def create_run(incident_id: str, body: ManualRunCreate, request: Request) -> dict:
    try:
        run, event = await SpecialEventService().create_run(incident_id, body.model_dump(mode="json"))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await _broadcast(request, incident_id, event)
    return run


@router.get("/runs/{run_id}", response_model=RunResponse)
async def get_run(incident_id: str, run_id: str) -> dict:
    run = await SpecialEventService().get_run(incident_id, run_id)
    if not run: raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.patch("/runs/{run_id}", response_model=RunResponse)
async def patch_run(incident_id: str, run_id: str, body: RunPatch, request: Request) -> dict:
    try:
        run, event = await SpecialEventService().patch_run(incident_id, run_id, body.model_dump(exclude_unset=True, mode="json"))
    except KeyError as exc: raise HTTPException(status_code=404, detail="Run not found") from exc
    except ValueError as exc: raise HTTPException(status_code=422, detail=str(exc)) from exc
    await _broadcast(request, incident_id, event); return run


@router.post("/runs/{run_id}/units", response_model=RunResponse)
async def assign_units(incident_id: str, run_id: str, body: AssignRunUnits, request: Request) -> dict:
    try:
        run, event = await SpecialEventService().assign_units(incident_id, run_id, body.unitIds)
    except (KeyError, ValueError) as exc: raise HTTPException(status_code=409, detail=str(exc)) from exc
    await _broadcast(request, incident_id, event); return run


@router.patch("/units/{unit_id}/staging", response_model=IncidentUnitResponse)
async def set_unit_staging(incident_id: str, unit_id: str, body: UnitStagingPatch, request: Request) -> dict:
    try:
        unit, event = await SpecialEventService().set_unit_staging(incident_id, unit_id, body.stagingLocationId)
    except ValueError as exc: raise HTTPException(status_code=409, detail=str(exc)) from exc
    await _broadcast(request, incident_id, event); return unit


@router.patch("/units/{unit_id}/hold", response_model=IncidentUnitResponse)
async def set_unit_hold(incident_id: str, unit_id: str, body: UnitHoldPatch, request: Request) -> dict:
    try:
        unit, event = await SpecialEventService().set_unit_hold(incident_id, unit_id, body.manualHold)
    except KeyError as exc: raise HTTPException(status_code=404, detail="Unit not found") from exc
    await _broadcast(request, incident_id, event); return unit


@router.patch("/runs/{run_id}/units/{unit_id}", response_model=RunUnitResponse)
async def patch_run_unit(incident_id: str, run_id: str, unit_id: str, body: RunUnitPatch, request: Request) -> dict:
    try:
        assignment, event = await SpecialEventService().patch_assignment(incident_id, run_id, unit_id, body.model_dump(exclude_unset=True, mode="json"))
    except KeyError as exc: raise HTTPException(status_code=404, detail="Assignment not found") from exc
    await _broadcast(request, incident_id, event); return assignment


@router.post("/runs/{run_id}/units/{unit_id}/clear", response_model=RunUnitResponse)
async def clear_run_unit(incident_id: str, run_id: str, unit_id: str, body: ClearRunUnit, request: Request) -> dict:
    try:
        assignment, event = await SpecialEventService().clear_unit(incident_id, run_id, unit_id, body.model_dump(mode="json"))
    except DispositionRequired as exc: raise HTTPException(status_code=409, detail="Medical disposition is required") from exc
    except KeyError as exc: raise HTTPException(status_code=404, detail="Assignment not found") from exc
    except ValueError as exc: raise HTTPException(status_code=422, detail=str(exc)) from exc
    await _broadcast(request, incident_id, event); return assignment
