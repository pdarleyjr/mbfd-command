from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class UnitSummary(BaseModel):
    unit_id: str
    runs: int
    active_minutes: float
    transports: int
    refusals: int


class RunSummary(BaseModel):
    run_id: str
    incident_number: str
    received_at: datetime
    cleared_at: datetime | None
    category: str
    subtype: str
    call_type: str
    address: str
    source: str
    units: list[str]
    duration_minutes: float
    dispositions: list[str]


class EventReportStats(BaseModel):
    incident_id: str
    event_name: str
    command_post: str
    started_at: datetime | None
    ended_at: datetime | None
    total_duration_minutes: float
    participating_units: list[str]
    total_runs: int
    medical_runs: int
    fire_runs: int
    other_runs: int
    rescue_runs: int
    vehicle_runs: int
    hazmat_runs: int
    pulsepoint_runs: int
    manual_runs: int
    total_unit_assignments: int
    transports: int
    refusals: int
    no_patient: int
    total_run_minutes: float
    total_unit_call_minutes: float
    average_run_minutes: float
    longest_run_minutes: float
    longest_run_id: str | None
    manual_overrides: list[str]
    units: list[UnitSummary]
    runs: list[RunSummary]
    data_quality_notes: list[str]


class EventNarrative(BaseModel):
    executive_summary: str = Field(max_length=1800)
    operational_overview: str = Field(max_length=1800)
    notable_activity: list[str] = Field(default_factory=list, max_length=12)
    data_quality_notes: list[str] = Field(default_factory=list, max_length=12)


class ExportRecord(BaseModel):
    id: str
    incident_id: str
    export_type: str
    sha256: str
    metadata: dict
    created_at: datetime
