from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

RunCategory = Literal["medical", "fire", "other"]
RunSubtype = Literal["medical", "fire", "rescue", "vehicle", "hazmat", "alarm", "service", "marine", "other"]
MedicalDisposition = Literal["transport", "refusal", "no_patient", "assist_only", "not_applicable"]
OperationalStatus = Literal["unassigned", "staged", "responding", "on_scene", "transporting", "available", "out_of_service"]


class StagingLocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address: str = Field(default="", max_length=500)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    notes: str = Field(default="", max_length=2000)
    isDefault: bool = False


class ManualRunCreate(BaseModel):
    callTypeLabel: str = Field(min_length=1, max_length=160)
    category: RunCategory
    subtype: RunSubtype
    callTypeCode: str = Field(default="", max_length=30)
    incidentNumber: str = Field(default="", max_length=80)
    address: str = Field(default="", max_length=500)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    receivedAt: datetime
    notes: str = Field(default="", max_length=4000)
    unitIds: list[str] = Field(default_factory=list, max_length=40)
    noUnitAssigned: bool = False

    @model_validator(mode="after")
    def require_unit_choice(self):
        self.unitIds = list(dict.fromkeys(unit.strip() for unit in self.unitIds if unit.strip()))
        if not self.unitIds and not self.noUnitAssigned:
            raise ValueError("select at least one unit or explicitly choose no unit")
        return self


class RunPatch(BaseModel):
    incidentNumber: str | None = Field(default=None, max_length=80)
    callTypeLabel: str | None = Field(default=None, min_length=1, max_length=160)
    category: RunCategory | None = None
    subtype: RunSubtype | None = None
    address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=4000)
    status: Literal["pending", "active", "clearing", "cleared", "cancelled"] | None = None


class AssignRunUnits(BaseModel):
    unitIds: list[str] = Field(min_length=1, max_length=40)


class UnitStagingPatch(BaseModel):
    stagingLocationId: str


class UnitHoldPatch(BaseModel):
    manualHold: bool


class CustomUnitCreate(BaseModel):
    unitId: str = Field(min_length=1, max_length=40)
    stagingLocationId: str | None = None


class PulsePointAssignRequest(BaseModel):
    unitIds: list[str] = Field(min_length=1, max_length=40)


class RunUnitPatch(BaseModel):
    status: OperationalStatus | None = None
    enrouteAt: datetime | None = None
    onSceneAt: datetime | None = None
    transportAt: datetime | None = None
    disposition: MedicalDisposition | None = None
    transportDestination: str | None = Field(default=None, max_length=300)
    patientCount: int | None = Field(default=None, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=4000)


class ClearRunUnit(BaseModel):
    returnStagingLocationId: str | None = None
    disposition: MedicalDisposition | None = None
    transportDestination: str = Field(default="", max_length=300)
    patientCount: int | None = Field(default=None, ge=0, le=100)
    notes: str = Field(default="", max_length=4000)


class SchedulePatch(BaseModel):
    scheduledStartAt: datetime | None = None
    scheduledEndAt: datetime | None = None


class TimerStartRequest(BaseModel):
    startAt: datetime | None = None


class TimerEndRequest(BaseModel):
    endAt: datetime | None = None
    clearActiveRuns: bool = False
