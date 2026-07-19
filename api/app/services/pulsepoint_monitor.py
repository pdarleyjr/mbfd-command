from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import random
from typing import Any, Awaitable, Callable

import httpx

from ..config import Settings, get_settings
from ..db.pulsepoint import PulsePointRepository
from ..domain.pulsepoint_types import classify_run, normalize_unit_id
from .special_event_service import SpecialEventService
from .incident_service import IncidentService


def normalize_feed(value: Any) -> dict[str, Any]:
    source = value if isinstance(value, dict) else {}
    def incidents(key: str) -> list[dict]:
        rows = source.get(key) if isinstance(source.get(key), list) else []
        normalized: list[dict] = []
        for raw in rows:
            if not isinstance(raw, dict): continue
            code, label = str(raw.get("callTypeCode") or ""), str(raw.get("callType") or "")
            units = []
            for unit in raw.get("units") if isinstance(raw.get("units"), list) else []:
                if not isinstance(unit, dict): continue
                original = str(unit.get("id") or "")
                units.append({
                    "id": original, "normalizedId": normalize_unit_id(original),
                    "status": unit.get("status"), "clearedAt": unit.get("clearedAt"),
                })
            normalized.append({
                "id": str(raw.get("id") or ""), "callTypeCode": code, "callType": label,
                "address": str(raw.get("address") or ""), "receivedAt": str(raw.get("receivedAt") or ""),
                "closedAt": raw.get("closedAt"), "lat": raw.get("lat"), "lng": raw.get("lng"),
                "units": units, "classification": classify_run(code or None, label).model_dump(),
            })
        return [row for row in normalized if row["id"]]
    return {
        "active": incidents("active"), "recent": incidents("recent"),
        "fetchedAt": str(source.get("fetchedAt") or datetime.now(timezone.utc).isoformat()),
        "agency": str(source.get("agency") or "X1012"),
        "stale": bool(source.get("stale", False)),
    }


class PulsePointMonitor:
    def __init__(
        self,
        client: httpx.AsyncClient,
        broadcast: Callable[[str, dict], Awaitable[None]],
        settings: Settings | None = None,
    ):
        self.client = client
        self.broadcast = broadcast
        self.settings = settings or get_settings()
        self.repository = PulsePointRepository(self.settings.db_path)
        self.events = SpecialEventService(self.settings.db_path)
        self.latest: dict[str, Any] | None = self.repository.latest_feed()
        self._misses: dict[tuple[str, str], int] = {}
        self._proposals: dict[tuple[str, str], datetime] = {}
        self._stopped = False

    async def poll_once(self) -> dict[str, Any] | None:
        try:
            response = await self.client.get(
                self.settings.pulsepoint_url,
                headers={"Accept": "application/json", "User-Agent": "MBFDCommand/2"},
                timeout=12.0,
            )
            response.raise_for_status()
            feed = normalize_feed(response.json())
        except Exception:
            if self.latest:
                self.latest = {**self.latest, "stale": True}
            return self.latest
        self.latest = feed
        await asyncio.to_thread(self.repository.save_feed, feed)
        if feed["stale"]:
            return feed
        await self._reconcile(feed)
        return feed

    async def _reconcile(self, feed: dict[str, Any]) -> None:
        active_by_id = {row["id"]: row for row in feed["active"]}
        recent_ids = {row["id"] for row in feed["recent"]}
        for pulsepoint in active_by_id.values():
            normalized_ids = [unit["normalizedId"] for unit in pulsepoint["units"] if unit["normalizedId"]]
            candidates = await self.events.pulsepoint_candidates(normalized_ids)
            occurrence: dict[str, int] = {}
            for unit_ids in candidates.values():
                for unit_id in unit_ids: occurrence[unit_id] = occurrence.get(unit_id, 0) + 1
            for incident_id, unit_ids in candidates.items():
                safe_units = [unit_id for unit_id in unit_ids if occurrence[unit_id] == 1]
                if safe_units:
                    _, event = await self.events.assign_pulsepoint(incident_id, pulsepoint, safe_units)
                    await self.broadcast(incident_id, event)

        now = datetime.now(timezone.utc)
        for run in await self.events.active_pulsepoint_runs():
            key = (run["incidentId"], run["externalId"])
            if run["externalId"] in active_by_id:
                self._misses.pop(key, None); self._proposals.pop(key, None)
                if run["status"] == "clearing": await self.events.reactivate_pulsepoint(*key)
                continue
            self._misses[key] = self._misses.get(key, 0) + 1
            confirmed = run["externalId"] in recent_ids or self._misses[key] >= self.settings.pulsepoint_required_misses
            if not confirmed: continue
            if key not in self._proposals:
                due = now + timedelta(seconds=self.settings.pulsepoint_clear_grace_s)
                self._proposals[key] = due
                event = await self.events.mark_pulsepoint_clearing(*key, due.isoformat())
                if event: await self.broadcast(run["incidentId"], event)
            elif self._proposals[key] <= now:
                event = await self.events.clear_pulsepoint(*key)
                if event: await self.broadcast(run["incidentId"], event)
                self._proposals.pop(key, None); self._misses.pop(key, None)

    async def run(self) -> None:
        while not self._stopped:
            await self.poll_once()
            has_active = bool(await IncidentService(self.settings.db_path).list_special_ids())
            interval = self.settings.pulsepoint_active_poll_s if has_active else self.settings.pulsepoint_idle_poll_s
            await asyncio.sleep(max(5, interval * random.uniform(0.9, 1.1)))

    def stop(self) -> None:
        self._stopped = True
