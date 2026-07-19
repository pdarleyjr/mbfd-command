from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def require_single_process(worker_count: int) -> None:
    if worker_count != 1:
        raise RuntimeError(
            "CMD_UVICORN_WORKERS must remain 1 while the incident WebSocket hub is in-memory"
        )


class Settings(BaseSettings):
    """Runtime configuration for the cmd-api transcription gateway."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="CMD_", extra="ignore")

    # ── Speech-to-text (speaches / faster-whisper, OpenAI-compatible) ──
    whisper_url: str = "http://whisper-stt:8000"
    whisper_model: str = "Systran/faster-distil-whisper-small.en"
    whisper_language: str = "en"
    stt_backend: str = "speaches"
    stt_model_provision_enabled: bool = True

    # ── LLM radio parser (Ollama) ──
    ollama_url: str = "http://host.docker.internal:11434"
    ollama_model: str = "qwen3.6:35b"
    parse_timeout_s: float = 25.0

    # ── Storage ──
    db_path: str = "data/mbfd_command.sqlite"

    # ── HTTP / CORS ──
    # Comma-separated allowed origins for the REST API (CORS). The single-origin
    # production deploy is same-origin, so CORS mainly matters for local dev.
    allowed_origins: str = "http://localhost:5180,http://127.0.0.1:5180"

    # Optional: directory of the built SPA to serve at "/" (single-origin deploy).
    static_dir: str = ""
    uvicorn_workers: int = 1
    realtime_v2: bool = True

    # ── PulsePoint / live incident feed ──
    pulsepoint_url: str = "https://pulsepoint-proxy.pdarleyjr.workers.dev/incidents"
    pulsepoint_cache_ttl_s: int = 15
    pulsepoint_active_poll_s: int = 15
    pulsepoint_idle_poll_s: int = 45
    pulsepoint_clear_grace_s: int = 90
    pulsepoint_required_misses: int = 2
    pulsepoint_monitor_enabled: bool = True

    # ── Streaming segmentation tuning ──
    sample_rate: int = 16000
    transcript_partials_enabled: bool = False
    partial_interval_s: float = 2.5
    endpoint_silence_ms: int = 450
    max_segment_s: float = 8.0
    min_segment_ms: int = 250
    audio_pre_roll_ms: int = 200
    vad_mode: int = 2
    final_queue_size: int = 4
    enrichment_queue_size: int = 8
    transcription_lease_ttl_s: int = 10

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def static_path(self) -> Path | None:
        if not self.static_dir:
            return None
        p = Path(self.static_dir)
        return p if p.is_dir() else None


@lru_cache
def get_settings() -> Settings:
    return Settings()
