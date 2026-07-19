from __future__ import annotations

import logging
import json
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from time import monotonic

import httpx
from fastapi import Body, FastAPI, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .config import get_settings, require_single_process
from .pipeline import StreamSession
from .db.incidents import RevisionConflict
from .domain.commands import IncidentCommand
from .realtime.hub import IncidentHub
from .routers.incidents import router as incidents_router
from .routers.runs import router as runs_router
from .services.incident_service import IncidentService, UnsupportedCommand
from .services.transcript_service import TranscriptService
from .transcription.manager import InvalidLease, LeaseConflict, TranscriptionManager
from .transcription.metrics import transcription_metrics

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("cmd-api")


incident_hub = IncidentHub()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    app.state.http = httpx.AsyncClient()
    app.state.pulsepoint_cache = {"expires": 0.0, "data": None}
    app.state.incident_hub = incident_hub
    # Self-provision the STT model in the background so a fresh deploy is turnkey
    # without blocking startup on a multi-hundred-MB download.
    import asyncio

    from .stt import ensure_model_installed

    app.state.model_task = asyncio.create_task(ensure_model_installed(app.state.http))
    async def schedule_loop() -> None:
        while True:
            for incident_id in await IncidentService().list_special_ids():
                _, event = await IncidentService().reconcile(incident_id)
                if event:
                    await incident_hub.broadcast(incident_id, event)
            await asyncio.sleep(5)
    app.state.schedule_task = asyncio.create_task(schedule_loop())
    log.info("cmd-api ready")
    try:
        yield
    finally:
        app.state.schedule_task.cancel()
        await asyncio.gather(app.state.schedule_task, return_exceptions=True)
        await app.state.http.aclose()


app = FastAPI(title="MBFD Command API", version="0.1.0", lifespan=lifespan)

settings = get_settings()
require_single_process(settings.uvicorn_workers)
transcription_manager = TranscriptionManager(settings.transcription_lease_ttl_s)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(incidents_router)
app.include_router(runs_router)


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "service": "cmd-api", "model": settings.ollama_model}


@app.get("/api/pulsepoint/incidents")
async def pulsepoint_incidents():
    """Same-origin PulsePoint proxy for the command-board live incident card."""
    cache = app.state.pulsepoint_cache
    now = monotonic()
    if cache["data"] is not None and cache["expires"] > now:
        return JSONResponse(
            cache["data"],
            headers={"Cache-Control": f"private, max-age={settings.pulsepoint_cache_ttl_s}"},
        )

    try:
        response = await app.state.http.get(
            settings.pulsepoint_url,
            headers={"Accept": "application/json", "User-Agent": "MBFDCommand/0.1"},
            timeout=12.0,
        )
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise RuntimeError("PulsePoint proxy returned non-object JSON")
        data.setdefault("active", [])
        data.setdefault("recent", [])
        data.setdefault("fetchedAt", datetime.now(timezone.utc).isoformat())
        cache["data"] = data
        cache["expires"] = now + max(10, settings.pulsepoint_cache_ttl_s)
        return JSONResponse(
            data,
            headers={"Cache-Control": f"private, max-age={settings.pulsepoint_cache_ttl_s}"},
        )
    except Exception as exc:
        log.warning("PulsePoint fetch failed: %s", exc)
        if cache["data"] is not None:
            stale = {**cache["data"], "stale": True}
            return JSONResponse(stale, headers={"Cache-Control": "private, max-age=15"})
        return JSONResponse(
            {
                "error": "Incident feed unavailable",
                "active": [],
                "recent": [],
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
            },
            status_code=503,
            headers={"Cache-Control": "no-store"},
        )


def _transcription_state_message(incident_id: str) -> dict:
    state = transcription_manager.state(incident_id)
    return {
        "type": "transcription.state", "incidentId": incident_id,
        "state": {
            "incidentId": incident_id, "enabled": state.enabled,
            "captureClientId": state.capture_client_id, "captureLabel": state.capture_label,
            "leaseId": state.lease_id,
            "leaseExpiresAt": state.lease_expires_at.isoformat() if state.lease_expires_at else None,
            "startedAt": state.started_at.isoformat() if state.started_at else None,
            "lastAudioAt": state.last_audio_at.isoformat() if state.last_audio_at else None,
        },
    }


@app.websocket("/ws/incidents/{incident_id}/audio")
async def incident_audio_ws(ws: WebSocket, incident_id: str) -> None:
    await ws.accept()
    client_id = ws.query_params.get("client") or "unknown"
    lease_id = ws.query_params.get("lease") or ""
    session: StreamSession | None = None
    await transcription_manager.connect(incident_id, ws)
    await ws.send_json(_transcription_state_message(incident_id))
    if lease_id:
        try:
            await transcription_manager.heartbeat(incident_id, client_id, lease_id)
            session = StreamSession(
                incident_id,
                lambda payload: transcription_manager.broadcast(incident_id, payload),
                ws.app.state.http,
            )
        except InvalidLease:
            await ws.send_json({"type": "error", "message": "Capture lease is invalid or expired"})
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if (data := msg.get("bytes")) is not None:
                if session and lease_id:
                    try:
                        await transcription_manager.heartbeat(incident_id, client_id, lease_id, audio=True)
                        await session.add_audio(data)
                    except InvalidLease:
                        await ws.send_json({"type": "error", "message": "Capture lease expired"})
            elif (text := msg.get("text")) is not None:
                try:
                    control = json.loads(text)
                except json.JSONDecodeError:
                    continue
                action = control.get("action")
                if action in {"transcription.acquire", "transcription.takeover"}:
                    label = str((control.get("payload") or {}).get("captureLabel") or "Capture device")
                    try:
                        state = await transcription_manager.acquire(incident_id, client_id, label)
                        acquired = {
                            "type": "transcription.lease_acquired", "incidentId": incident_id,
                            "action": "transcription.lease_acquired",
                            "payload": {
                                "leaseId": state.lease_id, "captureClientId": state.capture_client_id,
                                "expiresAt": state.lease_expires_at.isoformat() if state.lease_expires_at else None,
                            },
                        }
                        await ws.send_json(acquired)
                        await transcription_manager.broadcast(incident_id, _transcription_state_message(incident_id))
                    except LeaseConflict as exc:
                        await ws.send_json({"type": "error", "message": f"Listening from {exc}"})
                elif action == "transcription.stop":
                    await transcription_manager.release(incident_id)
                    await transcription_manager.broadcast(incident_id, _transcription_state_message(incident_id))
                elif action == "transcription.heartbeat":
                    requested_lease = str((control.get("payload") or {}).get("leaseId") or lease_id)
                    try:
                        await transcription_manager.heartbeat(incident_id, client_id, requested_lease)
                    except InvalidLease:
                        await ws.send_json({"type": "error", "message": "Capture lease expired"})
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # pragma: no cover
        log.warning("ws error: %s", exc)
    finally:
        if session:
            await session.close()
        await transcription_manager.disconnect(incident_id, ws)


@app.get("/api/transcription/health")
async def transcription_health() -> dict:
    async def ready(url: str) -> bool:
        try:
            response = await app.state.http.get(url, timeout=2.5)
            return response.status_code < 500
        except Exception:
            return False

    stt_ready, parser_ready = await asyncio.gather(
        ready(f"{settings.whisper_url}/health"), ready(f"{settings.ollama_url}/api/tags")
    )
    stt_last, stt_median = transcription_metrics.summary(transcription_metrics.stt)
    parser_last, _ = transcription_metrics.summary(transcription_metrics.parser)
    active = next((state for state in transcription_manager._states.values() if state.enabled), None)
    return {
        "ok": stt_ready,
        "stt": {"ready": stt_ready, "model": settings.whisper_model, "lastLatencyMs": stt_last,
                "medianLatencyMs": stt_median, "queueDepth": transcription_metrics.final_queue_depth},
        "parser": {"ready": parser_ready, "model": settings.ollama_model,
                   "lastLatencyMs": parser_last, "queueDepth": transcription_metrics.enrichment_queue_depth},
        "audio": {"activeIncidentId": active.incident_id if active else None,
                  "captureClientId": active.capture_client_id if active else None},
    }


@app.websocket("/ws/incidents/{incident_id}")
async def incident_ws(ws: WebSocket, incident_id: str) -> None:
    await ws.accept()
    client_id = ws.query_params.get("client") or "unknown"
    try:
        last_revision = max(0, int(ws.query_params.get("lastRevision") or 0))
    except ValueError:
        last_revision = 0
    await incident_hub.connect(incident_id, ws)
    service = IncidentService()
    snapshot = await service.get_snapshot(incident_id)
    await ws.send_json(
        {
            "type": "snapshot",
            "incidentId": incident_id,
            "revision": int(snapshot.get("revision", 0)) if snapshot else 0,
            "snapshot": snapshot,
        }
    )

    try:
        while True:
            raw = await ws.receive_json()
            try:
                command = IncidentCommand.model_validate(raw)
            except ValidationError:
                await ws.send_json(
                    {
                        "type": "command.rejected",
                        "commandId": str(raw.get("commandId") or "unknown"),
                        "incidentId": incident_id,
                        "reason": "invalid_command",
                        "currentRevision": int((await service.get_snapshot(incident_id) or {}).get("revision", 0)),
                    }
                )
                continue
            if command.incident_id != incident_id:
                await ws.send_json(
                    {
                        "type": "command.rejected",
                        "commandId": command.command_id,
                        "incidentId": incident_id,
                        "reason": "incident_mismatch",
                        "currentRevision": int((await service.get_snapshot(incident_id) or {}).get("revision", 0)),
                    }
                )
                continue
            try:
                event, duplicate = await service.apply_command(incident_id, client_id, command)
            except RevisionConflict as exc:
                await ws.send_json(
                    {
                        "type": "command.rejected",
                        "commandId": command.command_id,
                        "incidentId": incident_id,
                        "reason": "revision_conflict",
                        "currentRevision": exc.current_revision,
                    }
                )
                continue
            except UnsupportedCommand:
                await ws.send_json(
                    {
                        "type": "command.rejected",
                        "commandId": command.command_id,
                        "incidentId": incident_id,
                        "reason": "unsupported_action",
                        "currentRevision": int((await service.get_snapshot(incident_id) or {}).get("revision", 0)),
                    }
                )
                continue
            if duplicate:
                await incident_hub.send_one(ws, event)
            else:
                await incident_hub.broadcast(incident_id, event)
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # pragma: no cover
        log.warning("incident sync ws error: %s", exc)
    finally:
        await incident_hub.disconnect(incident_id, ws)


@app.get("/api/incidents/{incident_id}/transcript")
async def get_transcript(incident_id: str) -> dict:
    return {"incidentId": incident_id, "entries": await TranscriptService().list_for_incident(incident_id)}


@app.delete("/api/incidents/{incident_id}/transcript")
async def clear_transcript(incident_id: str) -> dict:
    deleted = await TranscriptService().clear(incident_id)
    try:
        event = await IncidentService().append_event(
            incident_id, "transcript.cleared", {"deletedCount": deleted},
            client_id="rest", command_id=f"clear-transcript-{__import__('uuid').uuid4().hex}",
        )
        await incident_hub.broadcast(incident_id, event)
    except KeyError:
        return JSONResponse({"detail": "Incident not found"}, status_code=404)
    await transcription_manager.broadcast(
        incident_id, {"type": "transcript.cleared", "incidentId": incident_id}
    )
    return {"ok": True, "deletedCount": deleted}


@app.put("/api/incidents/{incident_id}/board")
async def put_board(incident_id: str, board: dict = Body(...)) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    await db.ensure_incident(incident_id, now)
    await db.save_board(incident_id, json.dumps(board), now)
    return {"ok": True, "updatedAt": now}


@app.get("/api/incidents/{incident_id}/board")
async def get_board(incident_id: str):
    snap = await db.get_board(incident_id)
    if snap is None:
        return JSONResponse({"board": None}, status_code=200)
    return snap


# Single-origin deploy: serve the built SPA at "/" when STATIC_DIR is set.
# Mounted last so it never shadows the API or WebSocket routes above.
_static = settings.static_path
if _static is not None:
    app.mount("/", StaticFiles(directory=str(_static), html=True), name="spa")
    log.info("serving SPA from %s", _static)
