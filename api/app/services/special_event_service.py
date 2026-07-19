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
