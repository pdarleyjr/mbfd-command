from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

MessageType = Literal[
    "fire_attack",
    "search",
    "rescue",
    "water_supply",
    "command",
    "size_up",
    "par",
    "mayday",
    "medical",
    "staging",
    "ventilation",
    "rehab",
    "status",
    "unknown",
]

Priority = Literal["routine", "important", "urgent", "emergency"]

# Canonical MBFD unit tokens. The parser must never emit a speaker outside this set.
KNOWN_UNITS: set[str] = {
    "300",
    "Capt. 5",
    "E1",
    "E2",
    "E3",
    "E4",
    "L1",
    "L3",
    "FB6",
    "FB4",
    "Air Truck",
    "R1",
    "R11",
    "R2",
    "R22",
    "R3",
    "R4",
    "R44",
    "Detail Rescue",
    "Detail Unit",
    "Detail Gator",
    "100",
    "200",
    "400",
    "500",
    "Command",
    "Dispatch",
}


class ParsedMessage(BaseModel):
    speaker: str | None = None
    recipient: str | None = None
    display_prefix: str = "inaudible"
    raw_text: str = ""
    corrected_text: str = ""
    message_type: MessageType = "unknown"
    priority: Priority = "routine"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    flags: list[str] = Field(default_factory=list)
