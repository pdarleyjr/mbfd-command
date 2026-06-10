from __future__ import annotations

import json
import logging
from pathlib import Path

import httpx

from .config import get_settings
from .schemas import KNOWN_UNITS, ParsedMessage

log = logging.getLogger("cmd-api.parser")

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "mbfd_radio_parser.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")


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

    s = get_settings()
    payload = {
        "model": s.ollama_model,
        "stream": False,
        "think": False,  # qwen3.6 is a thinking model; disable to get JSON directly
        "format": "json",
        "options": {"temperature": 0.1, "num_predict": 400},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
    }
    try:
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
