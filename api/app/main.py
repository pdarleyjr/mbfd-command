from __future__ import annotations

import logging
import json
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
from .services.incident_service import IncidentService, UnsupportedCommand

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("cmd-api")


incident_hub = IncidentHub()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    app.state.http = httpx.AsyncClient()
    app.state.pulsepoint_cache = {"expires": 0.0, "data": None}
    # Self-provision the STT model in the background so a fresh deploy is turnkey
    # without blocking startup on a multi-hundred-MB download.
    import asyncio

    from .stt import ensure_model_installed

    app.state.model_task = asyncio.create_task(ensure_model_installed(app.state.http))
    log.info("cmd-api ready")
    try:
        yield
    finally:
        await app.state.http.aclose()


app = FastAPI(title="MBFD Command API", version="0.1.0", lifespan=lifespan)

settings = get_settings()
require_single_process(settings.uvicorn_workers)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(incidents_router)


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


@app.websocket("/ws/transcribe")
async def transcribe_ws(ws: WebSocket) -> None:
    await ws.accept()
    incident_id = ws.query_params.get("incident", "default")
    await db.ensure_incident(incident_id, datetime.now(timezone.utc).isoformat())

    async def send(obj: dict) -> None:
        await ws.send_json(obj)

    session = StreamSession(incident_id, send, ws.app.state.http)
    await send({"type": "ready"})
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if (data := msg.get("bytes")) is not None:
                await session.add_audio(data)
            elif (text := msg.get("text")) is not None:
                # Reserved for control messages (e.g. keepalive pings); ignored for now.
                log.debug("ws control: %s", text)
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # pragma: no cover
        log.warning("ws error: %s", exc)
    finally:
        await session.close()


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
    return {"incident": incident_id, "entries": await db.get_transcript(incident_id)}


@app.delete("/api/incidents/{incident_id}/transcript")
async def clear_transcript(incident_id: str) -> dict:
    await db.clear_transcript(incident_id)
    return {"ok": True}


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
