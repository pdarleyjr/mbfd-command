"""Unit tests for the radio-parser sanitization (pure, no network)."""

from app.parser import _sanitize
from app.schemas import KNOWN_UNITS


def test_known_speaker_sets_display_prefix():
    msg = _sanitize(
        {
            "speaker": "E1",
            "recipient": "Command",
            "display_prefix": "E1 to Command",
            "corrected_text": "E1 to Command, water on the fire.",
            "message_type": "fire_attack",
            "priority": "routine",
            "confidence": 0.9,
            "flags": ["water_on_fire"],
        },
        "E1 to command, water on the fire.",
    )
    assert msg.speaker == "E1"
    assert msg.display_prefix == "E1"  # forced to the short token
    assert msg.recipient == "Command"
    assert msg.raw_text == "E1 to command, water on the fire."
    assert msg.message_type == "fire_attack"


def test_unknown_speaker_becomes_inaudible():
    msg = _sanitize(
        {"speaker": "Truck 99", "display_prefix": "Truck 99", "confidence": 0.8},
        "truck ninety nine on scene",
    )
    assert msg.speaker is None  # not a known unit -> never invented
    assert msg.display_prefix == "inaudible"
    assert "unknown_speaker" in msg.flags


def test_invented_recipient_is_dropped():
    msg = _sanitize({"speaker": "E2", "recipient": "Engine 47"}, "E2 to engine 47")
    assert msg.speaker == "E2"
    assert msg.recipient is None


def test_mayday_forces_emergency():
    msg = _sanitize(
        {"speaker": "E3", "message_type": "status", "flags": ["mayday"]},
        "Mayday mayday mayday, firefighter down",
    )
    assert msg.message_type == "mayday"
    assert msg.priority == "emergency"


def test_invalid_enum_falls_back_safely():
    msg = _sanitize({"speaker": "E1", "message_type": "banana"}, "garbled audio")
    assert msg.display_prefix == "inaudible"
    assert msg.message_type == "unknown"


def test_known_units_contains_expected():
    for u in ("E1", "L3", "R44", "Capt. 5", "Air Truck", "Command"):
        assert u in KNOWN_UNITS
