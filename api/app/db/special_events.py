from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Any
from uuid import uuid4

from .connection import db_connection
from .incidents import append_event_in_transaction


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _location(row: Any) -> dict:
    return {
        "id": row["id"], "name": row["name"], "address": row["address"],
        "lat": row["lat"], "lng": row["lng"], "notes": row["notes"],
        "isDefault": bool(row["is_default"]),
    }


def _unit(row: Any) -> dict:
    return {
        "unitId": row["unit_id"], "status": row["operational_status"],
        "stagingLocationId": row["staging_location_id"], "currentRunId": row["current_run_id"],
        "previousStagingLocationId": row["previous_staging_location_id"],
        "manualHold": bool(row["manual_hold"]), "statusUpdatedAt": row["status_updated_at"],
    }


def _assignment(row: Any) -> dict:
    return {
        "runId": row["run_id"], "unitId": row["unit_id"], "assignedAt": row["assigned_at"],
        "enrouteAt": row["enroute_at"], "onSceneAt": row["on_scene_at"],
        "transportAt": row["transport_at"], "clearedAt": row["cleared_at"],
        "disposition": row["disposition"], "transportDestination": row["transport_destination"],
        "patientCount": row["patient_count"], "notes": row["notes"],
        "assignmentSource": row["assignment_source"],
    }


def _run(conn: Any, row: Any) -> dict:
    assignments = conn.execute("SELECT * FROM run_units WHERE run_id=? ORDER BY assigned_at", (row["id"],)).fetchall()
    return {
        "id": row["id"], "incidentId": row["incident_id"], "source": row["source"],
        "sourceExternalId": row["source_external_id"],
        "sourcePayload": json.loads(row["source_payload_json"]) if row["source_payload_json"] else None,
        "incidentNumber": row["incident_number"], "callTypeCode": row["call_type_code"],
        "callTypeLabel": row["call_type_label"], "category": row["category"], "subtype": row["subtype"],
        "classificationOverridden": bool(row["classification_overridden"]),
        "address": row["address"], "lat": row["lat"], "lng": row["lng"],
        "receivedAt": row["received_at"], "activatedAt": row["activated_at"],
        "clearedAt": row["cleared_at"], "status": row["status"], "notes": row["notes"],
        "updatedAt": row["updated_at"],
        "unitAssignments": [_assignment(item) for item in assignments],
    }


class SpecialEventRepository:
    def __init__(self, path: str):
        self.path = path

    def state(self, incident_id: str) -> dict:
        with db_connection(self.path) as conn:
            locations = conn.execute("SELECT * FROM staging_locations WHERE incident_id=? ORDER BY is_default DESC, name", (incident_id,)).fetchall()
            units = conn.execute("SELECT * FROM incident_units WHERE incident_id=? ORDER BY unit_id", (incident_id,)).fetchall()
            runs = conn.execute("SELECT * FROM runs WHERE incident_id=? ORDER BY received_at DESC", (incident_id,)).fetchall()
            return {
                "incidentId": incident_id,
                "stagingLocations": [_location(row) for row in locations],
                "units": [_unit(row) for row in units],
                "runs": [_run(conn, row) for row in runs],
            }

    def get_run(self, incident_id: str, run_id: str) -> dict | None:
        with db_connection(self.path) as conn:
            row = conn.execute("SELECT * FROM runs WHERE id=? AND incident_id=?", (run_id, incident_id)).fetchone()
            return _run(conn, row) if row else None

    def add_location(self, incident_id: str, value: dict, client_id: str, command_id: str) -> tuple[dict, dict]:
        now, location_id = _now(), f"stg_{uuid4().hex}"
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                if value.get("isDefault"):
                    conn.execute("UPDATE staging_locations SET is_default=0 WHERE incident_id=?", (incident_id,))
                conn.execute(
                    """INSERT INTO staging_locations
                       (id, incident_id, name, address, lat, lng, notes, is_default, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (location_id, incident_id, value["name"], value.get("address", ""), value.get("lat"),
                     value.get("lng"), value.get("notes", ""), int(value.get("isDefault", False)), now, now),
                )
                event = append_event_in_transaction(
                    conn, incident_id, "staging.created", {"stagingLocationId": location_id},
                    client_id=client_id, command_id=command_id,
                )
                row = conn.execute("SELECT * FROM staging_locations WHERE id=?", (location_id,)).fetchone()
                conn.commit()
            except Exception:
                conn.rollback(); raise
        return _location(row), event

    def create_manual_run(self, incident_id: str, value: dict, client_id: str, command_id: str) -> tuple[dict, dict]:
        now, run_id = _now(), f"run_{uuid4().hex}"
        received = value["receivedAt"]
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                mode = conn.execute("SELECT mode FROM incidents_v2 WHERE id=?", (incident_id,)).fetchone()
                if not mode or mode["mode"] != "special_event":
                    raise ValueError("special event not found")
                conn.execute(
                    """INSERT INTO runs
                       (id, incident_id, source, source_external_id, source_payload_json, incident_number,
                        call_type_code, call_type_label, category, subtype, classification_overridden,
                        address, lat, lng, received_at, activated_at, cleared_at, status, notes, created_at, updated_at)
                       VALUES (?, ?, 'manual', NULL, NULL, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)""",
                    (run_id, incident_id, value.get("incidentNumber", ""), value.get("callTypeCode", ""),
                     value["callTypeLabel"], value["category"], value["subtype"], value.get("address", ""),
                     value.get("lat"), value.get("lng"), received, now if value.get("unitIds") else None,
                     "active" if value.get("unitIds") else "pending", value.get("notes", ""), now, now),
                )
                self._assign_units(conn, incident_id, run_id, value.get("unitIds", []), "operator", now)
                event = append_event_in_transaction(
                    conn, incident_id, "run.created", {"runId": run_id, "unitIds": value.get("unitIds", [])},
                    client_id=client_id, command_id=command_id,
                )
                row = conn.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
                result = _run(conn, row)
                conn.commit()
            except Exception:
                conn.rollback(); raise
        return result, event

    def assign_units(self, incident_id: str, run_id: str, unit_ids: list[str], client_id: str, command_id: str, source: str = "operator") -> tuple[dict, dict]:
        now = _now()
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                self._assign_units(conn, incident_id, run_id, unit_ids, source, now)
                conn.execute("UPDATE runs SET status='active', activated_at=COALESCE(activated_at, ?), updated_at=? WHERE id=? AND incident_id=?", (now, now, run_id, incident_id))
                event = append_event_in_transaction(conn, incident_id, "run.units_assigned", {"runId": run_id, "unitIds": unit_ids}, client_id=client_id, command_id=command_id)
                row = conn.execute("SELECT * FROM runs WHERE id=? AND incident_id=?", (run_id, incident_id)).fetchone()
                if not row: raise KeyError(run_id)
                result = _run(conn, row); conn.commit()
            except Exception:
                conn.rollback(); raise
        return result, event

    def set_unit_staging(self, incident_id: str, unit_id: str, location_id: str, client_id: str, command_id: str) -> tuple[dict, dict]:
        now = _now()
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                if not conn.execute("SELECT 1 FROM staging_locations WHERE id=? AND incident_id=?", (location_id, incident_id)).fetchone():
                    raise ValueError("staging location not found")
                cursor = conn.execute(
                    """UPDATE incident_units SET staging_location_id=?, operational_status='staged', status_updated_at=?
                       WHERE incident_id=? AND unit_id=? AND current_run_id IS NULL""",
                    (location_id, now, incident_id, unit_id),
                )
                if cursor.rowcount != 1: raise ValueError("unit is assigned to an active run")
                event = append_event_in_transaction(conn, incident_id, "unit.staging_changed", {"unitId": unit_id, "stagingLocationId": location_id}, client_id=client_id, command_id=command_id)
                row = conn.execute("SELECT * FROM incident_units WHERE incident_id=? AND unit_id=?", (incident_id, unit_id)).fetchone(); result = _unit(row); conn.commit()
            except Exception:
                conn.rollback(); raise
        return result, event

    def set_unit_hold(self, incident_id: str, unit_id: str, manual_hold: bool, client_id: str, command_id: str) -> tuple[dict, dict]:
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                previous = conn.execute("SELECT manual_hold FROM incident_units WHERE incident_id=? AND unit_id=?", (incident_id, unit_id)).fetchone()
                if not previous: raise KeyError(unit_id)
                cursor = conn.execute("UPDATE incident_units SET manual_hold=? WHERE incident_id=? AND unit_id=?", (int(manual_hold), incident_id, unit_id))
                if cursor.rowcount != 1: raise KeyError(unit_id)
                event = append_event_in_transaction(conn, incident_id, "unit.manual_hold_changed", {"unitId": unit_id, "field": "manualHold", "previousValue": bool(previous["manual_hold"]), "newValue": manual_hold}, client_id=client_id, command_id=command_id)
                row = conn.execute("SELECT * FROM incident_units WHERE incident_id=? AND unit_id=?", (incident_id, unit_id)).fetchone()
                result = _unit(row)
                conn.commit()
            except Exception:
                conn.rollback(); raise
        return result, event

    def add_custom_unit(self, incident_id: str, unit_id: str, staging_location_id: str | None, client_id: str, command_id: str) -> tuple[dict, dict]:
        now = _now()
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                if not staging_location_id:
                    row = conn.execute("SELECT id FROM staging_locations WHERE incident_id=? ORDER BY is_default DESC, created_at LIMIT 1", (incident_id,)).fetchone()
                    staging_location_id = row["id"] if row else None
                conn.execute(
                    """INSERT INTO incident_units
                       (incident_id, unit_id, operational_status, staging_location_id, previous_staging_location_id,
                        current_run_id, manual_hold, status_updated_at) VALUES (?, ?, 'staged', ?, NULL, NULL, 0, ?)""",
                    (incident_id, unit_id, staging_location_id, now),
                )
                event = append_event_in_transaction(conn, incident_id, "unit.custom_added", {"unitId": unit_id, "stagingLocationId": staging_location_id}, client_id=client_id, command_id=command_id)
                row = conn.execute("SELECT * FROM incident_units WHERE incident_id=? AND unit_id=?", (incident_id, unit_id)).fetchone(); result = _unit(row); conn.commit()
            except Exception:
                conn.rollback(); raise
        return result, event

    def pulsepoint_candidates(self, normalized_unit_ids: list[str]) -> dict[str, list[str]]:
        if not normalized_unit_ids: return {}
        marks = ",".join("?" for _ in normalized_unit_ids)
        with db_connection(self.path) as conn:
            rows = conn.execute(
                f"""SELECT iu.incident_id, iu.unit_id FROM incident_units iu
                    JOIN incidents_v2 i ON i.id=iu.incident_id
                    WHERE iu.unit_id IN ({marks}) AND iu.operational_status='staged'
                      AND iu.current_run_id IS NULL AND iu.manual_hold=0
                      AND i.mode='special_event' AND i.lifecycle_status IN ('active','scheduled')""",
                tuple(normalized_unit_ids),
            ).fetchall()
        result: dict[str, list[str]] = {}
        for row in rows: result.setdefault(row["incident_id"], []).append(row["unit_id"])
        return result

    def assign_pulsepoint(self, incident_id: str, pulsepoint: dict, unit_ids: list[str], client_id: str, command_id: str) -> tuple[dict, dict]:
        now = _now(); external_id = pulsepoint["id"]
        classification = pulsepoint["classification"]
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                row = conn.execute("SELECT * FROM runs WHERE incident_id=? AND source='pulsepoint' AND source_external_id=?", (incident_id, external_id)).fetchone()
                if row:
                    run_id = row["id"]
                    conn.execute("UPDATE runs SET call_type_code=?, call_type_label=?, address=?, lat=?, lng=?, updated_at=?, status='active' WHERE id=?", (pulsepoint.get("callTypeCode", ""), pulsepoint.get("callType", ""), pulsepoint.get("address", ""), pulsepoint.get("lat"), pulsepoint.get("lng"), now, run_id))
                else:
                    run_id = f"run_{uuid4().hex}"
                    conn.execute(
                        """INSERT INTO runs
                           (id, incident_id, source, source_external_id, source_payload_json, incident_number,
                            call_type_code, call_type_label, category, subtype, classification_overridden,
                            address, lat, lng, received_at, activated_at, cleared_at, status, notes, created_at, updated_at)
                           VALUES (?, ?, 'pulsepoint', ?, ?, '', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL, 'active', '', ?, ?)""",
                        (run_id, incident_id, external_id, json.dumps(pulsepoint), pulsepoint.get("callTypeCode", ""),
                         pulsepoint.get("callType", ""), classification["category"], classification["subtype"],
                         pulsepoint.get("address", ""), pulsepoint.get("lat"), pulsepoint.get("lng"),
                         pulsepoint.get("receivedAt") or now, now, now, now),
                    )
                existing = {item["unit_id"] for item in conn.execute("SELECT unit_id FROM run_units WHERE run_id=?", (run_id,)).fetchall()}
                selected = [unit for unit in dict.fromkeys(unit_ids) if unit not in existing]
                self._assign_units(conn, incident_id, run_id, selected, "pulsepoint", now)
                event = append_event_in_transaction(conn, incident_id, "pulsepoint.assign_units", {"runId": run_id, "pulsepointIncidentId": external_id, "unitIds": selected}, client_id=client_id, command_id=command_id)
                row = conn.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone(); result = _run(conn, row); conn.commit()
            except Exception:
                conn.rollback(); raise
        return result, event

    def active_pulsepoint_runs(self) -> list[dict]:
        with db_connection(self.path) as conn:
            rows = conn.execute("SELECT id, incident_id, source_external_id, status FROM runs WHERE source='pulsepoint' AND status IN ('active','clearing')").fetchall()
            return [{"runId": row["id"], "incidentId": row["incident_id"], "externalId": row["source_external_id"], "status": row["status"]} for row in rows]

    def mark_pulsepoint_clearing(self, incident_id: str, external_id: str, clear_after: str, client_id: str, command_id: str) -> dict | None:
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                row = conn.execute("SELECT id, status FROM runs WHERE incident_id=? AND source='pulsepoint' AND source_external_id=?", (incident_id, external_id)).fetchone()
                if not row or row["status"] == "clearing": conn.rollback(); return None
                conn.execute("UPDATE runs SET status='clearing', updated_at=? WHERE id=?", (_now(), row["id"]))
                event = append_event_in_transaction(conn, incident_id, "pulsepoint.clear_proposed", {"runId": row["id"], "pulsepointIncidentId": external_id, "clearAfter": clear_after}, client_id=client_id, command_id=command_id)
                conn.commit()
            except Exception:
                conn.rollback(); raise
        return event

    def reactivate_pulsepoint(self, incident_id: str, external_id: str) -> None:
        with db_connection(self.path) as conn:
            conn.execute("UPDATE runs SET status='active', updated_at=? WHERE incident_id=? AND source='pulsepoint' AND source_external_id=? AND status='clearing'", (_now(), incident_id, external_id))

    def clear_pulsepoint(self, incident_id: str, external_id: str, client_id: str, command_id: str) -> dict | None:
        now = _now()
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                run = conn.execute("SELECT * FROM runs WHERE incident_id=? AND source='pulsepoint' AND source_external_id=?", (incident_id, external_id)).fetchone()
                if not run: conn.rollback(); return None
                assignments = conn.execute(
                    """SELECT ru.*, iu.manual_hold, iu.operational_status, iu.previous_staging_location_id AS unit_previous
                       FROM run_units ru JOIN incident_units iu ON iu.incident_id=? AND iu.unit_id=ru.unit_id
                       WHERE ru.run_id=? AND ru.cleared_at IS NULL""", (incident_id, run["id"])
                ).fetchall()
                cleared: list[str] = []
                for item in assignments:
                    if item["manual_hold"] or item["operational_status"] == "transporting" or item["transport_at"]:
                        continue
                    if run["category"] == "medical" and not item["disposition"]:
                        continue
                    disposition = item["disposition"] or "not_applicable"
                    location = item["previous_staging_location_id"] or item["unit_previous"]
                    conn.execute("UPDATE run_units SET cleared_at=?, disposition=? WHERE run_id=? AND unit_id=?", (now, disposition, run["id"], item["unit_id"]))
                    conn.execute("UPDATE incident_units SET operational_status='staged', staging_location_id=?, previous_staging_location_id=NULL, current_run_id=NULL, status_updated_at=? WHERE incident_id=? AND unit_id=?", (location, now, incident_id, item["unit_id"]))
                    cleared.append(item["unit_id"])
                remaining = conn.execute("SELECT COUNT(*) AS value FROM run_units WHERE run_id=? AND cleared_at IS NULL", (run["id"],)).fetchone()["value"]
                conn.execute("UPDATE runs SET status=?, cleared_at=?, updated_at=? WHERE id=?", ("cleared" if remaining == 0 else "active", now if remaining == 0 else None, now, run["id"]))
                event = append_event_in_transaction(conn, incident_id, "pulsepoint.auto_cleared", {"runId": run["id"], "pulsepointIncidentId": external_id, "clearedUnitIds": cleared, "retainedUnitCount": remaining}, client_id=client_id, command_id=command_id)
                conn.commit()
            except Exception:
                conn.rollback(); raise
        return event

    @staticmethod
    def _assign_units(conn: Any, incident_id: str, run_id: str, unit_ids: list[str], source: str, now: str) -> None:
        for unit_id in dict.fromkeys(unit_ids):
            unit = conn.execute("SELECT * FROM incident_units WHERE incident_id=? AND unit_id=?", (incident_id, unit_id)).fetchone()
            if not unit or unit["current_run_id"] or unit["operational_status"] not in {"staged", "available", "unassigned"} or unit["manual_hold"]:
                raise ValueError(f"unit {unit_id} is not available")
            conn.execute(
                """INSERT INTO run_units
                   (run_id, unit_id, assigned_at, disposition, transport_destination, notes, assignment_source,
                    previous_staging_location_id)
                   VALUES (?, ?, ?, NULL, '', '', ?, ?)""",
                (run_id, unit_id, now, source, unit["staging_location_id"]),
            )
            conn.execute(
                """UPDATE incident_units SET operational_status='responding', previous_staging_location_id=staging_location_id,
                   staging_location_id=NULL, current_run_id=?, status_updated_at=? WHERE incident_id=? AND unit_id=?""",
                (run_id, now, incident_id, unit_id),
            )

    def patch_run(self, incident_id: str, run_id: str, values: dict, client_id: str, command_id: str) -> tuple[dict, dict]:
        allowed = {"incidentNumber": "incident_number", "callTypeLabel": "call_type_label", "category": "category", "subtype": "subtype", "address": "address", "notes": "notes", "status": "status"}
        updates = [(allowed[key], value) for key, value in values.items() if key in allowed and value is not None]
        if not updates: raise ValueError("no changes")
        if any(column in {"category", "subtype"} for column, _ in updates):
            updates.append(("classification_overridden", 1))
        now = _now()
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                previous = conn.execute("SELECT * FROM runs WHERE id=? AND incident_id=?", (run_id, incident_id)).fetchone()
                if not previous: raise KeyError(run_id)
                sql = ", ".join(f"{column}=?" for column, _ in updates)
                cursor = conn.execute(f"UPDATE runs SET {sql}, updated_at=? WHERE id=? AND incident_id=?", (*[value for _, value in updates], now, run_id, incident_id))
                if cursor.rowcount != 1: raise KeyError(run_id)
                changes = [{"field": key, "previousValue": previous[allowed[key]], "newValue": value} for key, value in values.items() if key in allowed and value is not None]
                event = append_event_in_transaction(conn, incident_id, "run.updated", {"runId": run_id, "changes": changes}, client_id=client_id, command_id=command_id)
                row = conn.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone(); result = _run(conn, row); conn.commit()
            except Exception:
                conn.rollback(); raise
        return result, event

    def patch_assignment(self, incident_id: str, run_id: str, unit_id: str, values: dict, client_id: str, command_id: str) -> tuple[dict, dict]:
        allowed = {"enrouteAt": "enroute_at", "onSceneAt": "on_scene_at", "transportAt": "transport_at", "disposition": "disposition", "transportDestination": "transport_destination", "patientCount": "patient_count", "notes": "notes"}
        updates = [(allowed[key], value) for key, value in values.items() if key in allowed and value is not None]
        now = _now()
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                previous = conn.execute("SELECT * FROM run_units WHERE run_id=? AND unit_id=?", (run_id, unit_id)).fetchone()
                if not previous: raise KeyError(unit_id)
                previous_unit = conn.execute("SELECT operational_status FROM incident_units WHERE incident_id=? AND unit_id=?", (incident_id, unit_id)).fetchone()
                if updates:
                    sql = ", ".join(f"{column}=?" for column, _ in updates)
                    cursor = conn.execute(f"UPDATE run_units SET {sql} WHERE run_id=? AND unit_id=?", (*[value for _, value in updates], run_id, unit_id))
                    if cursor.rowcount != 1: raise KeyError(unit_id)
                status = values.get("status")
                if status:
                    conn.execute("UPDATE incident_units SET operational_status=?, status_updated_at=? WHERE incident_id=? AND unit_id=? AND current_run_id=?", (status, now, incident_id, unit_id, run_id))
                conn.execute("UPDATE runs SET updated_at=? WHERE id=?", (now, run_id))
                changes = [{"field": key, "previousValue": previous[allowed[key]], "newValue": value} for key, value in values.items() if key in allowed and value is not None]
                if values.get("status"):
                    changes.append({"field": "status", "previousValue": previous_unit["operational_status"] if previous_unit else None, "newValue": values["status"]})
                event = append_event_in_transaction(conn, incident_id, "run.unit_updated", {"runId": run_id, "unitId": unit_id, "changes": changes}, client_id=client_id, command_id=command_id)
                row = conn.execute("SELECT * FROM run_units WHERE run_id=? AND unit_id=?", (run_id, unit_id)).fetchone(); result = _assignment(row); conn.commit()
            except Exception:
                conn.rollback(); raise
        return result, event

    def clear_unit(self, incident_id: str, run_id: str, unit_id: str, value: dict, client_id: str, command_id: str) -> tuple[dict, dict]:
        now = _now()
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                run = conn.execute("SELECT * FROM runs WHERE id=? AND incident_id=?", (run_id, incident_id)).fetchone()
                assignment = conn.execute("SELECT * FROM run_units WHERE run_id=? AND unit_id=?", (run_id, unit_id)).fetchone()
                if not run or not assignment: raise KeyError(unit_id)
                disposition = value.get("disposition") or assignment["disposition"]
                if run["category"] == "medical" and not disposition:
                    raise DispositionRequired()
                if run["category"] != "medical" and not disposition:
                    disposition = "not_applicable"
                unit = conn.execute("SELECT * FROM incident_units WHERE incident_id=? AND unit_id=?", (incident_id, unit_id)).fetchone()
                return_location = value.get("returnStagingLocationId") or unit["previous_staging_location_id"]
                if return_location and not conn.execute("SELECT 1 FROM staging_locations WHERE id=? AND incident_id=?", (return_location, incident_id)).fetchone():
                    raise ValueError("invalid return staging location")
                conn.execute(
                    """UPDATE run_units SET cleared_at=?, disposition=?, transport_destination=?, patient_count=?,
                       notes=CASE WHEN ?='' THEN notes ELSE ? END WHERE run_id=? AND unit_id=?""",
                    (now, disposition, value.get("transportDestination", ""), value.get("patientCount"),
                     value.get("notes", ""), value.get("notes", ""), run_id, unit_id),
                )
                conn.execute(
                    """UPDATE incident_units SET operational_status='staged', staging_location_id=?, current_run_id=NULL,
                       previous_staging_location_id=NULL, status_updated_at=? WHERE incident_id=? AND unit_id=?""",
                    (return_location, now, incident_id, unit_id),
                )
                remaining = conn.execute("SELECT COUNT(*) AS value FROM run_units WHERE run_id=? AND cleared_at IS NULL", (run_id,)).fetchone()["value"]
                if remaining == 0:
                    conn.execute("UPDATE runs SET status='cleared', cleared_at=?, updated_at=? WHERE id=?", (now, now, run_id))
                event = append_event_in_transaction(conn, incident_id, "run.unit_cleared", {"runId": run_id, "unitId": unit_id, "returnStagingLocationId": return_location, "disposition": disposition}, client_id=client_id, command_id=command_id)
                row = conn.execute("SELECT * FROM run_units WHERE run_id=? AND unit_id=?", (run_id, unit_id)).fetchone(); result = _assignment(row); conn.commit()
            except Exception:
                conn.rollback(); raise
        return result, event

    def clear_all_active(self, incident_id: str, client_id: str, command_id: str) -> dict | None:
        now = _now()
        with db_connection(self.path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                rows = conn.execute(
                    """SELECT ru.*, r.category FROM run_units ru JOIN runs r ON r.id=ru.run_id
                       WHERE r.incident_id=? AND ru.cleared_at IS NULL""", (incident_id,)
                ).fetchall()
                if not rows:
                    conn.rollback(); return None
                if any(row["category"] == "medical" and not row["disposition"] for row in rows):
                    raise DispositionRequired("Record medical dispositions before clearing all active runs")
                default = conn.execute(
                    "SELECT id FROM staging_locations WHERE incident_id=? ORDER BY is_default DESC, created_at LIMIT 1",
                    (incident_id,),
                ).fetchone()
                for row in rows:
                    disposition = row["disposition"] or "not_applicable"
                    location = row["previous_staging_location_id"] or (default["id"] if default else None)
                    conn.execute("UPDATE run_units SET cleared_at=?, disposition=? WHERE run_id=? AND unit_id=?", (now, disposition, row["run_id"], row["unit_id"]))
                    conn.execute(
                        """UPDATE incident_units SET operational_status='staged', staging_location_id=?,
                           previous_staging_location_id=NULL, current_run_id=NULL, status_updated_at=?
                           WHERE incident_id=? AND unit_id=?""",
                        (location, now, incident_id, row["unit_id"]),
                    )
                conn.execute("UPDATE runs SET status='cleared', cleared_at=?, updated_at=? WHERE incident_id=? AND status IN ('pending','active','clearing')", (now, now, incident_id))
                event = append_event_in_transaction(
                    conn, incident_id, "runs.cleared_for_event_end", {"unitCount": len(rows)},
                    client_id=client_id, command_id=command_id,
                )
                conn.commit()
            except Exception:
                conn.rollback(); raise
        return event


class DispositionRequired(Exception):
    pass
