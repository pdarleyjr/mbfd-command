from __future__ import annotations

import logging
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from time import monotonic

import httpx
from fastapi import Body, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .config import get_settings
from .pipeline import StreamSession

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("cmd-api")


class IncidentSyncHub:
    """In-memory WebSocket fan-out for the current live command board."""

    def __init__(self) -> None:
        self._channels: dict[str, set[WebSocket]] = {}

    def connect(self, channel: str, ws: WebSocket) -> None:
        self._channels.setdefault(channel, set()).add(ws)

    def disconnect(self, channel: str, ws: WebSocket) -> None:
        peers = self._channels.get(channel)
        if not peers:
            return
        peers.discard(ws)
        if not peers:
            self._channels.pop(channel, None)

    async def broadcast(self, channel: str, payload: dict, skip: WebSocket | None = None) -> None:
        peers = list(self._channels.get(channel, set()))
        stale: list[WebSocket] = []
        for peer in peers:
            if peer is skip:
                continue
            try:
                await peer.send_json(payload)
            except Exception:
                stale.append(peer)
        for peer in stale:
            self.disconnect(channel, peer)


incident_sync = IncidentSyncHub()


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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.websocket("/ws/incident")
async def incident_ws(ws: WebSocket) -> None:
    """Broadcast full incident snapshots so open command boards stay in sync."""
    await ws.accept()
    channel = ws.query_params.get("channel", "active") or "active"
    client_id = ws.query_params.get("client", "unknown") or "unknown"
    incident_sync.connect(channel, ws)
    snapshot = await db.get_incident_snapshot(channel)
    await ws.send_json(
        {
            "type": "ready",
            "channel": channel,
            "clientId": "server",
            "snapshot": snapshot,
        }
    )

    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") != "incident.update":
                continue
            incident = msg.get("incident")
            if not isinstance(incident, dict):
                continue
            incident_id = str(incident.get("id") or channel)
            now = datetime.now(timezone.utc).isoformat()
            await db.ensure_incident(incident_id, now)
            await db.save_incident_snapshot(channel, incident_id, json.dumps(incident), now)
            payload = {
                "type": "incident.snapshot",
                "channel": channel,
                "clientId": msg.get("clientId") or client_id,
                "incident": incident,
                "updatedAt": now,
            }
            await incident_sync.broadcast(channel, payload, skip=ws)
            await ws.send_json({"type": "incident.ack", "updatedAt": now})
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # pragma: no cover
        log.warning("incident sync ws error: %s", exc)
    finally:
        incident_sync.disconnect(channel, ws)


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
