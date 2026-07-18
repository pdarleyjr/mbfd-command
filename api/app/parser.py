from __future__ import annotations

import json
import logging
import re
from pathlib import Path

import httpx

from .config import get_settings
from .schemas import KNOWN_UNITS, ParsedMessage

log = logging.getLogger("cmd-api.parser")
_qwen_semaphore = __import__("asyncio").Semaphore(1)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "mbfd_radio_parser.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")

UNIT_ALIASES = {
    "engine one": "E1", "engine 1": "E1", "e one": "E1", "e1": "E1",
    "engine two": "E2", "engine 2": "E2", "e2": "E2",
    "engine three": "E3", "engine 3": "E3", "e3": "E3",
    "engine four": "E4", "engine 4": "E4", "e4": "E4",
    "ladder one": "L1", "ladder 1": "L1", "l1": "L1",
    "ladder three": "L3", "ladder 3": "L3", "l3": "L3",
    "rescue forty four": "R44", "rescue 44": "R44", "r44": "R44",
    "captain five": "Capt. 5", "captain 5": "Capt. 5", "capt. 5": "Capt. 5",
    "fireboat six": "FB6", "fireboat 6": "FB6", "fb6": "FB6",
    "fireboat four": "FB4", "fireboat 4": "FB4", "fb4": "FB4",
    "command": "Command", "dispatch": "Dispatch",
}
for _unit in KNOWN_UNITS:
    UNIT_ALIASES.setdefault(_unit.lower(), _unit)

PATTERNS = [
    re.compile(r"^(?P<speaker>.+?)\s+to\s+(?P<recipient>.+?)[,:]?\s+(?P<body>.+)$", re.I),
    re.compile(r"^(?P<recipient>.+?)\s+from\s+(?P<speaker>.+?)[,:]?\s+(?P<body>.+)$", re.I),
]


def _unit(value: str | None) -> str | None:
    if not value:
        return None
    return UNIT_ALIASES.get(re.sub(r"\s+", " ", value.strip().lower()).rstrip(".,:"))


def parse_deterministic(text: str) -> ParsedMessage:
    """Extract safety-critical radio fields without inference or invented units."""
    clean = re.sub(r"\s+", " ", (text or "").strip())
    speaker = recipient = None
    for pattern in PATTERNS:
        match = pattern.match(clean)
        if match:
            speaker = _unit(match.group("speaker"))
            recipient = _unit(match.group("recipient"))
            break

    lower = clean.lower()
    message_type = "unknown"
    priority = "routine"
    flags: list[str] = []
    if "mayday" in lower:
        message_type, priority, flags = "mayday", "emergency", ["mayday"]
    elif "emergency traffic" in lower or "evacuat" in lower:
        message_type, priority, flags = "command", "emergency", ["emergency_traffic"]
    elif re.search(r"\bpar\b|personnel accountability", lower):
        message_type, priority, flags = "par", "important", ["par"]
    elif "water on" in lower and "fire" in lower:
        message_type, flags = "fire_attack", ["water_on_fire"]
    elif "staging" in lower or "stage at" in lower:
        message_type = "staging"
    elif any(token in lower for token in ("patient", "medical", "transport", "hospital")):
        message_type = "medical"
    elif speaker == "Command" or recipient == "Command" or "command" in lower:
        message_type = "command"

    if speaker is None:
        flags.append("unknown_speaker")
    return ParsedMessage(
        speaker=speaker,
        recipient=recipient,
        display_prefix=speaker or "inaudible",
        raw_text=clean,
        corrected_text=clean,
        message_type=message_type,
        priority=priority,
        confidence=0.9 if speaker and message_type != "unknown" else 0.45,
        flags=flags,
    )


def needs_qwen_enrichment(message: ParsedMessage) -> bool:
    return message.speaker is None or message.recipient is None or message.message_type == "unknown"


def _fallback(text: str, *, reason: str) -> ParsedMessage:
    """Deterministic, safe result when the LLM is unavailable or returns junk."""
    return ParsedMessage(
        speaker=None,
        recipient=None,
        display_prefix="inaudible",
        raw_text=text,
        corrected_text=text,
        message_type="unknown",
        priority="routine",
        confidence=0.0,
        flags=["unknown_speaker", reason],
    )


def _sanitize(data: dict, text: str) -> ParsedMessage:
    """Coerce raw model output into a validated, non-inventing ParsedMessage."""
    try:
        msg = ParsedMessage.model_validate(
            {
                "speaker": data.get("speaker"),
                "recipient": data.get("recipient"),
                "display_prefix": data.get("display_prefix") or "inaudible",
                "raw_text": text,  # never trust the model to echo the input
                "corrected_text": (data.get("corrected_text") or text).strip() or text,
                "message_type": data.get("message_type") or "unknown",
                "priority": data.get("priority") or "routine",
                "confidence": data.get("confidence", 0.0),
                "flags": data.get("flags") or [],
            }
        )
    except Exception:  # invalid enum / types -> safe fallback
        return _fallback(text, reason="parse_invalid")

    # Hard guard: never surface a unit outside the known roster (no invention).
    if msg.speaker not in KNOWN_UNITS:
        msg.speaker = None
    if msg.recipient not in KNOWN_UNITS:
        msg.recipient = None

    if msg.speaker is None:
        msg.display_prefix = "inaudible"
        if "unknown_speaker" not in msg.flags:
            msg.flags = [*msg.flags, "unknown_speaker"]
    else:
        msg.display_prefix = msg.speaker

    # Normalize obvious emergencies.
    if "mayday" in [f.lower() for f in msg.flags] or msg.message_type == "mayday":
        msg.message_type = "mayday"
        msg.priority = "emergency"

    msg.flags = msg.flags[:6]
    return msg


async def parse_transmission(text: str, client: httpx.AsyncClient) -> ParsedMessage:
    """Run one finalized ASR chunk through qwen3.6 and return structured fields."""
    text = (text or "").strip()
    if not text:
        return _fallback("", reason="empty")

    deterministic = parse_deterministic(text)
    if not needs_qwen_enrichment(deterministic):
        return deterministic

    s = get_settings()
    payload = {
        "model": s.ollama_model,
        "stream": False,
        "think": False,  # qwen3.6 is a thinking model; disable to get JSON directly
        "format": ParsedMessage.model_json_schema(),
        "options": {"temperature": 0, "num_predict": 220},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
    }
    try:
        async with _qwen_semaphore:
            resp = await client.post(
                f"{s.ollama_url}/api/chat", json=payload, timeout=s.parse_timeout_s
            )
        resp.raise_for_status()
        content = resp.json().get("message", {}).get("content", "")
        data = json.loads(content)
        if not isinstance(data, dict):
            return _fallback(text, reason="parse_invalid")
        return _sanitize(data, text)
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, ValueError) as exc:
        log.warning("radio parse failed: %s", exc)
        return _fallback(text, reason="llm_unavailable")
