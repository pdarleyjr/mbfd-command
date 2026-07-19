from __future__ import annotations

import asyncio
from typing import Any
from uuid import uuid4

from ..config import get_settings
from ..db.incidents import IncidentRepository, RevisionConflict
from ..domain.commands import IncidentCommand, ReplaceSnapshotPayload
from ..domain.models import IncidentCreateRequest, create_incident_snapshot


class IncidentService:
    def __init__(self, path: str | None = None):
        self.repository = IncidentRepository(path or get_settings().db_path)

    async def get_snapshot(self, incident_id: str) -> dict[str, Any] | None:
        snapshot, _ = await asyncio.to_thread(self.repository.reconcile_schedule, incident_id)
        return snapshot

    async def reconcile(self, incident_id: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        return await asyncio.to_thread(self.repository.reconcile_schedule, incident_id)

    async def list_special_ids(self) -> list[str]:
        return await asyncio.to_thread(self.repository.list_special_ids)

    async def patch_snapshot(self, incident_id: str, changes: dict[str, Any], action: str, client_id: str = "rest") -> tuple[dict, dict]:
        return await asyncio.to_thread(
            self.repository.patch_snapshot, incident_id, changes, action,
            client_id=client_id, command_id=f"{action}_{uuid4().hex}",
        )

    async def list_events(self, incident_id: str, after_revision: int = 0) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self.repository.list_events, incident_id, after_revision)

    async def create(self, request: IncidentCreateRequest, client_id: str = "rest") -> dict[str, Any]:
        incident_id = f"inc_{uuid4().hex}"
        snapshot = create_incident_snapshot(request, incident_id)
        event = await asyncio.to_thread(
            self.repository.create,
            snapshot,
            client_id=client_id,
            command_id=f"create_{uuid4().hex}",
            initial_staging=(request.initialStagingLocation.model_dump() if request.initialStagingLocation else None),
        )
        return event["payload"]["snapshot"]

    async def apply_command(
        self,
        incident_id: str,
        client_id: str,
        command: IncidentCommand,
    ) -> tuple[dict[str, Any], bool]:
        if command.action != "incident.replace_snapshot":
            raise UnsupportedCommand(command.action)
        payload = ReplaceSnapshotPayload.model_validate(command.payload)
        return await asyncio.to_thread(
            self.repository.replace_snapshot,
            incident_id,
            payload.snapshot,
            base_revision=command.base_revision,
            client_id=client_id,
            command_id=command.command_id,
        )

    async def append_event(
        self, incident_id: str, action: str, payload: dict[str, Any],
        *, client_id: str, command_id: str,
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            self.repository.append_event, incident_id, action, payload,
            client_id=client_id, command_id=command_id,
        )


class UnsupportedCommand(Exception):
    pass


__all__ = ["IncidentService", "RevisionConflict", "UnsupportedCommand"]
