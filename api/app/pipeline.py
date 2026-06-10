from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Awaitable, Callable

import httpx

from . import db
from .config import get_settings
from .parser import parse_transmission
from .stt import transcribe

log = logging.getLogger("cmd-api.pipeline")

try:  # webrtcvad gives far better endpointing; fall back to an energy gate if absent.
    import webrtcvad  # type: ignore

    _HAS_VAD = True
except Exception:  # pragma: no cover - depends on platform wheels
    _HAS_VAD = False

FRAME_MS = 20  # VAD operates on 20 ms frames


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rms_voiced(frame: bytes) -> bool:
    """Energy-based fallback VAD: True if the 16-bit frame is above a noise floor."""
    if not frame:
        return False
    total = 0
    for i in range(0, len(frame) - 1, 2):
        s = int.from_bytes(frame[i : i + 2], "little", signed=True)
        total += s * s
    rms = (total / (len(frame) / 2)) ** 0.5
    return rms > 500  # ~ -36 dBFS


class StreamSession:
    """One live transcription session: PCM frames in, partial/final events out."""

    def __init__(self, incident_id: str, send: Callable[[dict], Awaitable[None]], client: httpx.AsyncClient):
        self.incident_id = incident_id
        self.send = send
        self.client = client
        self.s = get_settings()
        self.frame_bytes = int(self.s.sample_rate * FRAME_MS / 1000) * 2
        self.vad = webrtcvad.Vad(2) if _HAS_VAD else None

        self._carry = bytearray()  # leftover bytes not yet a full VAD frame
        self._segment = bytearray()  # current speech segment
        self._has_speech = False
        self._silence_ms = 0
        self._seg_ms = 0
        self._last_partial = 0.0
        self._partial_task: asyncio.Task | None = None
        self._final_tasks: set[asyncio.Task] = set()

    def _voiced(self, frame: bytes) -> bool:
        if self.vad is not None:
            try:
                return self.vad.is_speech(frame, self.s.sample_rate)
            except Exception:
                return _rms_voiced(frame)
        return _rms_voiced(frame)

    async def add_audio(self, data: bytes) -> None:
        self._carry.extend(data)
        loop = asyncio.get_event_loop()

        while len(self._carry) >= self.frame_bytes:
            frame = bytes(self._carry[: self.frame_bytes])
            del self._carry[: self.frame_bytes]
            voiced = self._voiced(frame)

            if voiced:
                self._segment.extend(frame)
                self._has_speech = True
                self._silence_ms = 0
                self._seg_ms += FRAME_MS
            elif self._has_speech:
                self._segment.extend(frame)  # keep a little trailing silence
                self._silence_ms += FRAME_MS
                self._seg_ms += FRAME_MS

            # Endpoint: enough trailing silence, or the segment got too long.
            if self._has_speech and (
                self._silence_ms >= self.s.endpoint_silence_ms
                or self._seg_ms >= self.s.max_segment_s * 1000
            ):
                self._finalize_segment()
                continue

            # Interim partial, throttled and single-flight.
            now = loop.time()
            if (
                self._has_speech
                and now - self._last_partial >= self.s.partial_interval_s
                and (self._partial_task is None or self._partial_task.done())
            ):
                self._last_partial = now
                self._partial_task = asyncio.create_task(self._emit_partial(bytes(self._segment)))

    def _finalize_segment(self) -> None:
        if self._seg_ms < self.s.min_segment_ms:
            self._reset_segment()
            return
        pcm = bytes(self._segment)
        self._reset_segment()
        task = asyncio.create_task(self._process_final(pcm))
        self._final_tasks.add(task)
        task.add_done_callback(self._final_tasks.discard)

    def _reset_segment(self) -> None:
        self._segment = bytearray()
        self._has_speech = False
        self._silence_ms = 0
        self._seg_ms = 0

    async def _emit_partial(self, pcm: bytes) -> None:
        text = await transcribe(pcm, self.client)
        if text:
            await self.send({"type": "partial", "text": text})

    async def _process_final(self, pcm: bytes) -> None:
        text = await transcribe(pcm, self.client)
        if not text:
            return
        await self.send({"type": "partial", "text": text})  # promote the partial line
        parsed = await parse_transmission(text, self.client)
        at = _now_iso()
        try:
            await db.add_transcript(self.incident_id, parsed, at)
        except Exception as exc:  # storage must never break the live feed
            log.warning("transcript store failed: %s", exc)
        await self.send({"type": "final", "at": at, "parsed": parsed.model_dump()})

    async def close(self) -> None:
        # Finalize any in-progress speech, then drain outstanding work.
        if self._has_speech and self._seg_ms >= self.s.min_segment_ms:
            self._finalize_segment()
        pending = [t for t in self._final_tasks if not t.done()]
        if self._partial_task and not self._partial_task.done():
            pending.append(self._partial_task)
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
