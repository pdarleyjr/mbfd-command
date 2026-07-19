from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class IncidentSnapshotResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    schemaVersion: int
    id: str
    mode: str
    name: str
    address: str
    marker: dict[str, Any] | None
    commandPost: dict[str, Any] | None
    lifecycleStatus: str
    schedule: dict[str, Any]
    createdAt: str
    updatedAt: str
    closedAt: str | None
    revision: int
    board: dict[str, Any]


class StagingLocationResponse(BaseModel):
    id: str; name: str; address: str
    lat: float | None; lng: float | None
    notes: str = ""; isDefault: bool


class IncidentUnitResponse(BaseModel):
    unitId: str; status: str
    stagingLocationId: str | None; currentRunId: str | None
    previousStagingLocationId: str | None; manualHold: bool; statusUpdatedAt: str


class RunUnitResponse(BaseModel):
    runId: str; unitId: str; assignedAt: str
    enrouteAt: str | None; onSceneAt: str | None; transportAt: str | None; clearedAt: str | None
    disposition: str | None; transportDestination: str; patientCount: int | None
    notes: str; assignmentSource: str


class RunResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str; incidentId: str; source: str; sourceExternalId: str | None
    sourcePayload: dict[str, Any] | None; incidentNumber: str; callTypeCode: str; callTypeLabel: str
    category: str; subtype: str; classificationOverridden: bool; address: str
    lat: float | None; lng: float | None; receivedAt: str; activatedAt: str | None; clearedAt: str | None
    status: str; notes: str; updatedAt: str; unitAssignments: list[RunUnitResponse]


class EventStateResponse(BaseModel):
    incidentId: str
    stagingLocations: list[StagingLocationResponse]
    units: list[IncidentUnitResponse]
    runs: list[RunResponse]


class RunListResponse(BaseModel):
    incidentId: str
    runs: list[RunResponse]
