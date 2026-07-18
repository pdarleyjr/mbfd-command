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

    # ── PulsePoint / live incident feed ──
    pulsepoint_url: str = "https://pulsepoint-proxy.pdarleyjr.workers.dev/incidents"
    pulsepoint_cache_ttl_s: int = 60

    # ── Streaming segmentation tuning ──
    sample_rate: int = 16000
    partial_interval_s: float = 1.2  # how often to emit interim transcripts
    endpoint_silence_ms: int = 700  # trailing silence that finalizes a segment
    max_segment_s: float = 15.0  # force-finalize a segment after this long
    min_segment_ms: int = 400  # ignore blips shorter than this

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
