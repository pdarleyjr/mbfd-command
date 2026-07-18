from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class IncidentCommand(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    type: str = Field(pattern="^command$")
    command_id: str = Field(alias="commandId", min_length=1, max_length=160)
    incident_id: str = Field(alias="incidentId", min_length=1, max_length=160)
    base_revision: int = Field(alias="baseRevision", ge=0)
    action: str = Field(min_length=1, max_length=120)
    payload: dict[str, Any]


class ReplaceSnapshotPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    snapshot: dict[str, Any]
