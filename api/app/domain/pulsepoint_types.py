from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel

MEDICAL_CODES = {"CP", "CPR", "IFT", "ME", "MCI"}
FIRE_CODES = {"AF", "CHIM", "CF", "WSF", "WVEG", "CB", "ELF", "EF", "FIRE", "IF", "MF", "OF", "PF", "GF", "RF", "SF", "TF", "VEG", "VF", "WF", "WCF", "WRF"}
RESCUE_CODES = {"AR", "CR", "CSR", "ELR", "EER", "IR", "IA", "RES", "RR", "SC", "TR", "TNR", "USAR", "VS", "WR"}
VEHICLE_CODES = {"TC", "TCE", "TCP", "TCS", "TCT", "RTE"}
HAZMAT_CODES = {"GAS", "HC", "HMR", "HMI", "PE"}
ALARM_CODES = {"AED", "OA", "CMA", "FA", "MA", "SD", "TRBL", "WFA"}
MARINE_CODES = {"MF", "VS", "WR"}


class RunClassification(BaseModel):
    category: Literal["medical", "fire", "other"]
    subtype: Literal["medical", "fire", "rescue", "vehicle", "hazmat", "alarm", "service", "marine", "other"]
    source: Literal["pulsepoint_code", "label_fallback", "operator_override"]


def classify_run(code: str | None, label: str | None) -> RunClassification:
    value = (code or "").strip().upper()
    if value:
        if value in MEDICAL_CODES: return RunClassification(category="medical", subtype="medical", source="pulsepoint_code")
        if value in MARINE_CODES: return RunClassification(category="fire" if value == "MF" else "other", subtype="marine", source="pulsepoint_code")
        if value in FIRE_CODES: return RunClassification(category="fire", subtype="fire", source="pulsepoint_code")
        if value in RESCUE_CODES: return RunClassification(category="other", subtype="rescue", source="pulsepoint_code")
        if value in VEHICLE_CODES: return RunClassification(category="other", subtype="vehicle", source="pulsepoint_code")
        if value in HAZMAT_CODES: return RunClassification(category="other", subtype="hazmat", source="pulsepoint_code")
        if value in ALARM_CODES: return RunClassification(category="other", subtype="alarm", source="pulsepoint_code")
        return RunClassification(category="other", subtype="service" if value in {"PS", "LA", "PA", "STBY"} else "other", source="pulsepoint_code")
    text = re.sub(r"[^a-z0-9 ]", " ", (label or "").lower())
    if any(word in text for word in ("medical", "patient", "cpr", "cardiac")): category, subtype = "medical", "medical"
    elif any(word in text for word in ("fire", "smoke", "burning")): category, subtype = "fire", "fire"
    elif any(word in text for word in ("rescue", "trapped", "elevator")): category, subtype = "other", "rescue"
    elif any(word in text for word in ("collision", "vehicle", "traffic")): category, subtype = "other", "vehicle"
    elif any(word in text for word in ("hazmat", "gas leak", "hazard")): category, subtype = "other", "hazmat"
    elif "alarm" in text: category, subtype = "other", "alarm"
    elif any(word in text for word in ("vessel", "marine", "water rescue")): category, subtype = "other", "marine"
    else: category, subtype = "other", "other"
    return RunClassification(category=category, subtype=subtype, source="label_fallback")


def normalize_unit_id(value: str) -> str:
    normalized = re.sub(r"[^A-Z0-9]", "", (value or "").upper())
    aliases = {
        "ENGINE1": "E1", "LADDER1": "L1", "RESCUE44": "R44",
        "FIREBOAT6": "FB6", "CAPTAIN5": "Capt. 5",
    }
    return aliases.get(normalized, normalized)
