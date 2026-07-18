from __future__ import annotations

import io
import logging
import struct

import httpx

from .config import get_settings

log = logging.getLogger("cmd-api.stt")


def pcm16_to_wav(pcm: bytes, sample_rate: int) -> bytes:
    """Wrap raw little-endian mono PCM16 in a minimal WAV container."""
    num_channels = 1
    bits = 16
    byte_rate = sample_rate * num_channels * bits // 8
    block_align = num_channels * bits // 8
    data_len = len(pcm)
    header = b"RIFF" + struct.pack("<I", 36 + data_len) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", 16, 1, num_channels, sample_rate, byte_rate, block_align, bits)
    header += b"data" + struct.pack("<I", data_len)
    return header + pcm


async def ensure_model_installed(client: httpx.AsyncClient) -> None:
    """Best-effort: make sure the configured whisper model is downloaded.

    speaches requires models to be installed via POST /v1/models/{id} before
    transcription works; this makes a fresh deploy self-provisioning.
    """
    s = get_settings()
    try:
        listed = await client.get(f"{s.whisper_url}/v1/models", timeout=15.0)
        listed.raise_for_status()
        have = {m.get("id") for m in listed.json().get("data", [])}
        if s.whisper_model in have:
            log.info("whisper model %s already installed", s.whisper_model)
            return
        log.info("downloading whisper model %s …", s.whisper_model)
        resp = await client.post(f"{s.whisper_url}/v1/models/{s.whisper_model}", timeout=900.0)
        if resp.status_code < 400:
            log.info("whisper model %s installed", s.whisper_model)
        else:
            log.warning("whisper model install returned %s: %s", resp.status_code, resp.text[:200])
    except httpx.HTTPError as exc:
        log.warning("could not ensure whisper model (will retry on demand): %s", exc)


async def transcribe(pcm: bytes, client: httpx.AsyncClient, prompt: str = "") -> str:
    """Transcribe a PCM16 buffer via the speaches/faster-whisper endpoint."""
    if not pcm:
        return ""
    s = get_settings()
    wav = pcm16_to_wav(pcm, s.sample_rate)
    files = {"file": ("audio.wav", io.BytesIO(wav), "audio/wav")}
    data = {
        "model": s.whisper_model,
        "language": s.whisper_language,
        "response_format": "json",
        "temperature": "0",
    }
    if prompt:
        data["prompt"] = prompt
    try:
        resp = await client.post(
            f"{s.whisper_url}/v1/audio/transcriptions",
            files=files,
            data=data,
            timeout=30.0,
        )
        resp.raise_for_status()
        body = resp.json()
        return (body.get("text") or "").strip()
    except httpx.HTTPError as exc:
        log.warning("stt request failed: %s", exc)
        return ""
