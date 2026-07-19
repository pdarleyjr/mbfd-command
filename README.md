# MBFD Command

A touchscreen-first **scene command and special-event operations board** for the
Miami Beach Fire Department. It combines incident-scoped command assignments,
staging and run tracking, a live PulsePoint advisory feed, shared local AI radio
transcription, mapping, audit history, and deterministic event reporting in one
dark, high-contrast interface for tablets, phones, command laptops, and wall displays.

> **Decision-support prototype.** The AI transcript may contain errors. Verify all
> critical radio traffic by radio and dispatch. This tool does not replace official
> radio monitoring, CAD, dispatch logs, or incident command procedures, and it never
> makes operational decisions.

Deployed (behind Cloudflare Access) at **https://cmd.mbfdhub.com**.

---

## What it does

- **Unit bank → command columns.** Every MBFD apparatus (engines, ladders, rescues,
  fireboats, command/staff, special/detail) is a large, color-coded, draggable card.
  Drag by touch, mouse, or stylus between a collapsible bank and the assignment
  columns. Nothing can silently disappear — there's a one-tap **Recover units**.
- **Editable columns.** Defaults are Command · Staging · Fire Attack · Search · RIT ·
  Rehab · Vent. Rename them, add/delete/reorder them, and tag each with a location
  note (Alpha side, Roof, Division 2…). Deleting a column returns its units to the bank.
- **Incident map.** Google Maps + Places address autocomplete (biased to Miami Beach),
  a draggable incident marker, and a recenter button.
- **Live radio transcription.** Press *Start Listening*, allow the mic, and radio
  traffic is transcribed in near-real-time, with the speaking unit inferred
  (`E1: …`) or marked `inaudible`, plus a confidence indicator.
- **Special Events Detail.** Track per-unit staging locations, manual and PulsePoint
  runs, response milestones, transports, refusals, no-patient outcomes, and safe
  return to prior staging. Server-owned timers survive refreshes and restarts.
- **Canonical multi-device state.** Incident-scoped WebSockets use authoritative
  revisions, idempotent commands, conflict rejection, reconnect snapshots, and an
  append-only audit log. One incident cannot activate or overwrite another.
- **Shared local transcription.** One capture lease per incident feeds every viewer.
  Raw STT finals are persisted and broadcast before bounded, asynchronous Qwen
  enrichment. An AudioWorklet performs 16 kHz resampling off the UI thread.
- **PulsePoint advisory automation.** One server monitor persists normalized feed
  snapshots. Deterministic call-code mapping and exact staged-unit matching can
  create assignments; stale/failed feeds never clear units, and unknown resources
  require deliberate roster creation.
- **Event PDF.** The server calculates all authoritative totals from SQLite and
  renders a ReportLab PDF with an export hash/history. Qwen writes narrative only;
  the PDF still generates with deterministic fallback text when Qwen is unavailable.

## Architecture

```
cmd.mbfdhub.com ── Cloudflare Tunnel + Access → GMKtec cmd container
      │                                      ├─ React/Vite SPA (served from FastAPI)
      │  mic audio (WSS, same-origin)        ├─ REST API + WebSocket gateway
      ▼                                      ├─ cmd-whisper (faster-whisper / speaches)
                                      ├─ Ollama qwen3.6:35b (speaker/intent JSON)
                                      └─ SQLite (revisions, runs, transcripts, audit, exports)
```

The SPA, REST API, and mic WebSocket are single-origin behind one Cloudflare Access
application. The frontend still degrades gracefully if the transcription pipeline is offline.

- [`web/`](web/) — the React/Vite frontend bundled into the `cmd` image.
- [`api/`](api/) — the FastAPI transcription gateway (runs on the GMKtec box).
- [`infra/`](infra/) — Docker Compose + Cloudflare deploy notes.
- [`docs/`](docs/) — findings report and design notes.

## Local development

```bash
# Frontend
cd web
cp .env.example .env.local      # local key lives here; do not commit it
npm install
npm run dev                     # http://localhost:5180

# Backend (optional — only needed for live transcription)
cd ../api
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8200
```

Without a Google Maps key the map shows a clean "add a key" placeholder; everything
else works. Local map testing also requires the key to allow localhost referrers.
Without the backend the transcription panel reports it's offline.

## Environment variables

| Var | Where | Purpose |
|---|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | frontend (public) | Maps JS + Places. Restrict by referrer. |
| `VITE_GOOGLE_MAPS_MAP_ID` | frontend (public) | Optional vector Map ID. |
| `VITE_CMD_API_URL` | frontend (public) | Base URL of the transcription gateway. |
| `CMD_WHISPER_URL` | backend | speaches/faster-whisper base URL. |
| `CMD_OLLAMA_URL` | backend | Local Ollama base URL (radio enrichment and report narrative). |
| `CMD_OLLAMA_MODEL` | backend | Pinned model (default `qwen3.6:35b`). |
| `CMD_UVICORN_WORKERS` | backend | Must remain `1` while realtime fan-out is in-memory. |
| `CMD_PULSEPOINT_AUTOMATION` | backend | Enables tested assignment/reconciliation automation; ingestion remains available when false. |
| `CMD_EVENT_PDF_EXPORT` | backend | Enables deterministic server-side special-event PDF export. |

See [`web/.env.example`](web/.env.example) and [`api/.env.example`](api/.env.example).

## Status

The production target is https://cmd.mbfdhub.com behind Cloudflare Access on the
GMKtec. Release identity is exposed at `/api/system/version`; deployment is not
considered complete until the live container SHA, health, UI, incident isolation,
transcription readiness, special-event state, PulsePoint behavior, and PDF fallback
are validated against the deployed runtime.

See [`docs/STATUS.md`](docs/STATUS.md) for the full testing checklist, known
limitations, and next steps, and [`docs/FINDINGS-fltf2-analysis.md`](docs/FINDINGS-fltf2-analysis.md)
for the prior-system analysis that informed the design.
