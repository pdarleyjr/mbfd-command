from __future__ import annotations

import asyncio
from typing import Any
from uuid import uuid4

from ..config import get_settings
from ..db.special_events import SpecialEventRepository


class SpecialEventService:
    def __init__(self, path: str | None = None):
        self.repository = SpecialEventRepository(path or get_settings().db_path)

    async def state(self, incident_id: str) -> dict:
        return await asyncio.to_thread(self.repository.state, incident_id)

    async def get_run(self, incident_id: str, run_id: str) -> dict | None:
        return await asyncio.to_thread(self.repository.get_run, incident_id, run_id)

    async def add_location(self, incident_id: str, value: dict, client_id: str = "rest") -> tuple[dict, dict]:
        return await asyncio.to_thread(self.repository.add_location, incident_id, value, client_id, f"staging_{uuid4().hex}")

    async def create_run(self, incident_id: str, value: dict, client_id: str = "rest") -> tuple[dict, dict]:
        return await asyncio.to_thread(self.repository.create_manual_run, incident_id, value, client_id, f"run_{uuid4().hex}")

    async def assign_units(self, incident_id: str, run_id: str, units: list[str], client_id: str = "rest") -> tuple[dict, dict]:
        return await asyncio.to_thread(self.repository.assign_units, incident_id, run_id, units, client_id, f"assign_{uuid4().hex}")

    async def set_unit_staging(self, incident_id: str, unit_id: str, location_id: str, client_id: str = "rest") -> tuple[dict, dict]:
        return await asyncio.to_thread(self.repository.set_unit_staging, incident_id, unit_id, location_id, client_id, f"stagingunit_{uuid4().hex}")

    async def set_unit_hold(self, incident_id: str, unit_id: str, manual_hold: bool, client_id: str = "rest") -> tuple[dict, dict]:
        return await asyncio.to_thread(self.repository.set_unit_hold, incident_id, unit_id, manual_hold, client_id, f"hold_{uuid4().hex}")

    async def patch_run(self, incident_id: str, run_id: str, values: dict, client_id: str = "rest") -> tuple[dict, dict]:
        return await asyncio.to_thread(self.repository.patch_run, incident_id, run_id, values, client_id, f"runpatch_{uuid4().hex}")

    async def patch_assignment(self, incident_id: str, run_id: str, unit_id: str, values: dict, client_id: str = "rest") -> tuple[dict, dict]:
        return await asyncio.to_thread(self.repository.patch_assignment, incident_id, run_id, unit_id, values, client_id, f"unitpatch_{uuid4().hex}")

    async def clear_unit(self, incident_id: str, run_id: str, unit_id: str, values: dict, client_id: str = "rest") -> tuple[dict, dict]:
        return await asyncio.to_thread(self.repository.clear_unit, incident_id, run_id, unit_id, values, client_id, f"clear_{uuid4().hex}")

    async def clear_all_active(self, incident_id: str, client_id: str = "rest") -> dict | None:
        return await asyncio.to_thread(self.repository.clear_all_active, incident_id, client_id, f"clearall_{uuid4().hex}")

    async def add_custom_unit(self, incident_id: str, unit_id: str, staging_location_id: str | None = None, client_id: str = "rest") -> tuple[dict, dict]:
        return await asyncio.to_thread(self.repository.add_custom_unit, incident_id, unit_id, staging_location_id, client_id, f"custom_{uuid4().hex}")

    async def pulsepoint_candidates(self, unit_ids: list[str]) -> dict[str, list[str]]:
        return await asyncio.to_thread(self.repository.pulsepoint_candidates, unit_ids)

    async def assign_pulsepoint(self, incident_id: str, pulsepoint: dict, unit_ids: list[str], client_id: str = "pulsepoint-monitor") -> tuple[dict, dict]:
        return await asyncio.to_thread(self.repository.assign_pulsepoint, incident_id, pulsepoint, unit_ids, client_id, f"ppassign_{uuid4().hex}")

    async def active_pulsepoint_runs(self) -> list[dict]:
        return await asyncio.to_thread(self.repository.active_pulsepoint_runs)

    async def mark_pulsepoint_clearing(self, incident_id: str, external_id: str, clear_after: str) -> dict | None:
        return await asyncio.to_thread(self.repository.mark_pulsepoint_clearing, incident_id, external_id, clear_after, "pulsepoint-monitor", f"pppropose_{uuid4().hex}")

    async def reactivate_pulsepoint(self, incident_id: str, external_id: str) -> None:
        await asyncio.to_thread(self.repository.reactivate_pulsepoint, incident_id, external_id)

    async def clear_pulsepoint(self, incident_id: str, external_id: str, client_id: str = "pulsepoint-monitor") -> dict | None:
        return await asyncio.to_thread(self.repository.clear_pulsepoint, incident_id, external_id, client_id, f"ppclear_{uuid4().hex}")
