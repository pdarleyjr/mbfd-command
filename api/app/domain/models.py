from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

IncidentMode = Literal["scene", "special_event"]
IncidentLifecycleStatus = Literal["draft", "scheduled", "active", "ended", "closed"]

DEFAULT_UNITS = [
    "300", "Capt. 5", "E1", "L1", "E2", "E3", "L3", "E4", "FB6", "FB4",
    "Air Truck", "R1", "R11", "R2", "R22", "R3", "R4", "R44", "Detail Rescue",
    "Detail Unit", "Detail Gator", "100", "200", "400", "500",
]
DEFAULT_COLUMNS = ["Command", "Stagging", "Fire Attack", "Search", "RIT", "Medical", "Rehab", "Vent"]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_scene_board() -> dict[str, Any]:
    return {
        "columns": [
            {"id": f"col_{uuid4().hex}", "title": title, "location": "", "unitIds": []}
            for title in DEFAULT_COLUMNS
        ],
        "bankUnitIds": list(DEFAULT_UNITS),
        "customUnits": [],
        "unitTimers": {},
    }


class GeoLocation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    label: str = Field(default="", max_length=120)
    address: str = Field(default="", max_length=500)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class IncidentMarkerModel(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class IncidentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: IncidentMode
    name: str = Field(min_length=1, max_length=160)
    address: str = Field(default="", max_length=500)
    marker: IncidentMarkerModel | None = None
    commandPost: GeoLocation | None = None
    scheduledStartAt: datetime | None = None
    scheduledEndAt: datetime | None = None
    startImmediately: bool = True
    initialStagingLocation: GeoLocation | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name cannot be blank")
        return value


class IncidentPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=160)
    address: str | None = Field(default=None, max_length=500)
    commandPost: GeoLocation | None = None


def normalize_incident_snapshot(
    value: dict[str, Any],
    *,
    revision: int | None = None,
) -> dict[str, Any]:
    now = utc_now_iso()
    created_at = str(value.get("createdAt") or now)
    closed_at = value.get("closedAt")
    timer = value.get("timer") or {"startedAt": None, "accumulatedMs": 0, "running": False}
    schedule = value.get("schedule") or {
        "scheduledStartAt": None,
        "scheduledEndAt": None,
        "actualStartAt": timer.get("startedAt") or created_at,
        "actualEndAt": closed_at,
    }
    mode = value.get("mode") if value.get("mode") in {"scene", "special_event"} else "scene"
    lifecycle = value.get("lifecycleStatus")
    if lifecycle not in {"draft", "scheduled", "active", "ended", "closed"}:
        lifecycle = "closed" if closed_at else "active"
    incident_id = str(value.get("id") or "").strip()
    if not incident_id or len(incident_id) > 160:
        raise ValueError("invalid incident id")
    name = str(value.get("name") or "Untitled incident").strip()[:160]
    address = str(value.get("address") or "")[:500]
    return {
        **value,
        "schemaVersion": 2,
        "id": incident_id,
        "mode": mode,
        "name": name,
        "address": address,
        "marker": value.get("marker"),
        "commandPost": value.get("commandPost"),
        "lifecycleStatus": lifecycle,
        "schedule": schedule,
        "createdAt": created_at,
        "updatedAt": str(value.get("updatedAt") or now),
        "closedAt": closed_at,
        "revision": max(0, revision if revision is not None else int(value.get("revision") or 0)),
        "timer": timer,
        "board": value.get("board") or {"columns": [], "bankUnitIds": []},
        "checklist": value.get("checklist") or [],
    }


def create_incident_snapshot(request: IncidentCreateRequest, incident_id: str) -> dict[str, Any]:
    now = utc_now_iso()
    start = now if request.startImmediately else None
    if request.scheduledStartAt and request.scheduledStartAt <= datetime.now(timezone.utc):
        start = request.scheduledStartAt.astimezone(timezone.utc).isoformat()
    scheduled_start = (
        request.scheduledStartAt.astimezone(timezone.utc).isoformat()
        if request.scheduledStartAt
        else None
    )
    scheduled_end = (
        request.scheduledEndAt.astimezone(timezone.utc).isoformat()
        if request.scheduledEndAt
        else None
    )
    lifecycle: IncidentLifecycleStatus = "active" if start else ("scheduled" if scheduled_start else "draft")
    return normalize_incident_snapshot(
        {
            "id": incident_id,
            "mode": request.mode,
            "name": request.name,
            "address": request.address,
            "marker": request.marker.model_dump() if request.marker else None,
            "commandPost": request.commandPost.model_dump(mode="json") if request.commandPost else None,
            "lifecycleStatus": lifecycle,
            "schedule": {
                "scheduledStartAt": scheduled_start,
                "scheduledEndAt": scheduled_end,
                "actualStartAt": start,
                "actualEndAt": None,
            },
            "createdAt": now,
            "updatedAt": now,
            "closedAt": None,
            "timer": {"startedAt": None, "accumulatedMs": 0, "running": False},
            "board": default_scene_board() if request.mode == "scene" else {
                "columns": [], "bankUnitIds": list(DEFAULT_UNITS), "customUnits": [], "unitTimers": {}
            },
            "checklist": [],
        },
        revision=1,
    )
