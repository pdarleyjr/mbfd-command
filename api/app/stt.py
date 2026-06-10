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


async def transcribe(pcm: bytes, client: httpx.AsyncClient) -> str:
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
