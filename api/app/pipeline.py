from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
import time
from typing import Awaitable, Callable

import httpx

from .config import get_settings
from .parser import parse_transmission
from .services.transcript_service import TranscriptService
from .stt import transcribe
from .transcription.metrics import transcription_metrics

log = logging.getLogger("cmd-api.pipeline")

try:
    import webrtcvad  # type: ignore
    _HAS_VAD = True
except Exception:  # pragma: no cover
    _HAS_VAD = False

FRAME_MS = 20

RADIO_PROMPT = """Miami Beach Fire Department radio traffic.
Known units: 300, Captain Five, Engine One, Ladder One, Engine Two, Engine Three,
Ladder Three, Engine Four, Fireboat Six, Fireboat Four, Air Truck, Rescue One,
Rescue Eleven, Rescue Two, Rescue Twenty-Two, Rescue Three, Rescue Four,
Rescue Forty-Four, Detail Rescue, Detail Unit, Detail Gator, 100, 200, 400, 500,
Command, Dispatch."""


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _frame_rms(frame: bytes) -> float:
    if not frame:
        return 0.0
    count = len(frame) // 2
    total = 0
    for offset in range(0, count * 2, 2):
        sample = int.from_bytes(frame[offset:offset + 2], "little", signed=True)
        total += sample * sample
    return (total / max(1, count)) ** 0.5


@dataclass(slots=True)
class AudioSegment:
    pcm: bytes
    sequence: int
    started_at: str
    ended_at: str


class StreamSession:
    """Bounded endpointing/STT/enrichment pipeline for one incident capture lease."""

    def __init__(
        self,
        incident_id: str,
        broadcast: Callable[[dict], Awaitable[None]],
        client: httpx.AsyncClient,
    ):
        self.incident_id = incident_id
        self.broadcast = broadcast
        self.client = client
        self.settings = get_settings()
        self.transcripts = TranscriptService()
        self.frame_bytes = int(self.settings.sample_rate * FRAME_MS / 1000) * 2
        self.vad = webrtcvad.Vad(self.settings.vad_mode) if _HAS_VAD else None
        self._carry = bytearray()
        self._segment = bytearray()
        self._pre_roll: deque[bytes] = deque(maxlen=max(1, self.settings.audio_pre_roll_ms // FRAME_MS))
        self._has_speech = False
        self._silence_ms = 0
        self._segment_ms = 0
        self._started_at: str | None = None
        self._noise_floor = 250.0
        self._last_partial_at = 0.0
        self._partial_generation = 0
        self._partial_task: asyncio.Task | None = None
        self._next_sequence: int | None = None
        self._final_queue: asyncio.Queue[AudioSegment | None] = asyncio.Queue(maxsize=self.settings.final_queue_size)
        self._enrichment_queue: asyncio.Queue[dict | None] = asyncio.Queue(maxsize=self.settings.enrichment_queue_size)
        self._final_worker = asyncio.create_task(self._run_final_worker())
        self._enrichment_worker = asyncio.create_task(self._run_enrichment_worker())

    def _voiced(self, frame: bytes) -> bool:
        rms = _frame_rms(frame)
        if not self._has_speech:
            self._noise_floor = self._noise_floor * 0.98 + min(rms, self._noise_floor * 2) * 0.02
        if self.vad is not None:
            try:
                return self.vad.is_speech(frame, self.settings.sample_rate) and rms > max(180, self._noise_floor * 1.35)
            except Exception:
                pass
        return rms > max(500, self._noise_floor * 2.2)

    async def add_audio(self, data: bytes) -> None:
        self._carry.extend(data)
        loop = asyncio.get_running_loop()
        while len(self._carry) >= self.frame_bytes:
            frame = bytes(self._carry[:self.frame_bytes])
            del self._carry[:self.frame_bytes]
            voiced = self._voiced(frame)
            if not self._has_speech:
                self._pre_roll.append(frame)
            if voiced:
                if not self._has_speech:
                    self._segment.extend(b"".join(self._pre_roll))
                    self._segment_ms = len(self._pre_roll) * FRAME_MS
                    self._started_at = _iso()
                    self._pre_roll.clear()
                self._segment.extend(frame)
                self._has_speech = True
                self._silence_ms = 0
                self._segment_ms += FRAME_MS
            elif self._has_speech:
                self._segment.extend(frame)
                self._silence_ms += FRAME_MS
                self._segment_ms += FRAME_MS

            if self._has_speech and (
                self._silence_ms >= self.settings.endpoint_silence_ms
                or self._segment_ms >= self.settings.max_segment_s * 1000
            ):
                await self._finalize_segment()
                continue

            now = loop.time()
            if (
                self.settings.transcript_partials_enabled
                and self._segment_ms >= 2500
                and self._final_queue.empty()
                and now - self._last_partial_at >= self.settings.partial_interval_s
                and (self._partial_task is None or self._partial_task.done())
            ):
                self._last_partial_at = now
                generation = self._partial_generation
                self._partial_task = asyncio.create_task(self._emit_partial(bytes(self._segment), generation))

    async def _finalize_segment(self) -> None:
        if self._segment_ms < self.settings.min_segment_ms:
            self._reset_segment()
            return
        if self._next_sequence is None:
            self._next_sequence = await self.transcripts.next_sequence(self.incident_id)
        segment = AudioSegment(
            pcm=bytes(self._segment), sequence=self._next_sequence,
            started_at=self._started_at or _iso(), ended_at=_iso(),
        )
        self._next_sequence += 1
        self._partial_generation += 1
        self._reset_segment()
        await self._final_queue.put(segment)
        transcription_metrics.final_queue_depth = self._final_queue.qsize()

    def _reset_segment(self) -> None:
        self._segment = bytearray()
        self._has_speech = False
        self._silence_ms = 0
        self._segment_ms = 0
        self._started_at = None

    async def _emit_partial(self, pcm: bytes, generation: int) -> None:
        text = await transcribe(pcm, self.client, prompt=RADIO_PROMPT)
        if text and generation == self._partial_generation and self._final_queue.empty():
            await self.broadcast({"type": "transcript.partial", "incidentId": self.incident_id, "text": text})

    async def _run_final_worker(self) -> None:
        while True:
            segment = await self._final_queue.get()
            try:
                if segment is None:
                    return
                started = time.perf_counter()
                text = await transcribe(segment.pcm, self.client, prompt=RADIO_PROMPT)
                latency = round((time.perf_counter() - started) * 1000)
                transcription_metrics.record_stt(latency)
                if not text:
                    continue
                record = await self.transcripts.add_raw(
                    self.incident_id, segment.sequence, text,
                    audio_started_at=segment.started_at, audio_ended_at=segment.ended_at,
                    stt_latency_ms=latency,
                )
                await self.broadcast({"type": "transcript.final", "incidentId": self.incident_id, "entry": record})
                await self._enrichment_queue.put(record)
            except Exception as exc:
                log.exception("final transcription failed: %s", exc)
            finally:
                self._final_queue.task_done()
                transcription_metrics.final_queue_depth = self._final_queue.qsize()

    async def _run_enrichment_worker(self) -> None:
        while True:
            record = await self._enrichment_queue.get()
            try:
                if record is None:
                    return
                started = time.perf_counter()
                parsed = await parse_transmission(record["rawText"], self.client)
                transcription_metrics.record_parser(round((time.perf_counter() - started) * 1000))
                entry = await self.transcripts.enrich(record["id"], parsed)
                await self.broadcast({
                    "type": "transcript.enriched", "incidentId": self.incident_id,
                    "entryId": record["id"], "parsed": parsed.model_dump(), "entry": entry,
                })
            except Exception as exc:
                log.exception("transcript enrichment failed: %s", exc)
            finally:
                self._enrichment_queue.task_done()
                transcription_metrics.enrichment_queue_depth = self._enrichment_queue.qsize()

    async def close(self) -> None:
        if self._has_speech and self._segment_ms >= self.settings.min_segment_ms:
            await self._finalize_segment()
        if self._partial_task and not self._partial_task.done():
            self._partial_task.cancel()
        await self._final_queue.join()
        await self._enrichment_queue.join()
        await self._final_queue.put(None)
        await self._enrichment_queue.put(None)
        await asyncio.gather(self._final_worker, self._enrichment_worker, return_exceptions=True)
