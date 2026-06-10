from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    app.state.http = httpx.AsyncClient()
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


@app.get("/api/incidents/{incident_id}/transcript")
async def get_transcript(incident_id: str) -> dict:
    return {"incident": incident_id, "entries": await db.get_transcript(incident_id)}


@app.delete("/api/incidents/{incident_id}/transcript")
async def clear_transcript(incident_id: str) -> dict:
    await db.clear_transcript(incident_id)
    return {"ok": True}


@app.put("/api/incidents/{incident_id}/board")
async def put_board(incident_id: str, board: dict = Body(...)) -> dict:
    import json

    await db.ensure_incident(incident_id, datetime.now(timezone.utc).isoformat())
    await db.save_board(incident_id, json.dumps(board), datetime.now(timezone.utc).isoformat())
    return {"ok": True}


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
