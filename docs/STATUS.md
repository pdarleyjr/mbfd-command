# MBFD Command V2 — Deployment Status

**Implementation candidate prepared 2026-07-18. Production validation is recorded only after the GMKtec release is deployed and checked.**

| Item | Value |
|---|---|
| Repo | https://github.com/pdarleyjr/mbfd-command (private) |
| App URL | https://cmd.mbfdhub.com (Cloudflare Access) |
| Hosting | GMKtec via Cloudflare Tunnel `mbfdhub-gmktec` |
| Runtime | `cmd` at `127.0.0.1:8210`; dedicated `cmd-whisper` on `mbfd-ai` |
| Local AI | Ollama `qwen3.6:35b`, kept resident on the host |
| STT | Speaches + `Systran/faster-distil-whisper-small.en` (CPU/int8) |
| Canonical store | SQLite WAL with short-lived connections, migrations, revisions, runs, transcripts, audit events, PulsePoint snapshots, and export history |

## V2 implementation

- Responsive, touchscreen-first scene shell with minimum 44 px action targets,
  mobile drawers, tablet layouts, keyboard operation, and Advanced Marker map pins.
- Explicit `scene` and `special_event` modes; the app never silently selects the
  first incident and the special-event wizard collects schedule and staging data.
- Incident-scoped realtime snapshots/events with revisions, command idempotency,
  conflict rejection, reconnect reconciliation, and one-process runtime guard.
- One shared audio capture lease per incident; raw-final-first persistence/fan-out,
  bounded STT/enrichment queues, deterministic parsing before Qwen, AudioWorklet
  resampling, input profiles, diagnostics, and safe Qwen failure behavior.
- Normalized special-event staging, units, runs, assignments, dispositions, absolute
  timers, safe return-to-staging, touch drag/drop, Runs search/detail, and audit data.
- Version-controlled PulsePoint Worker plus one server monitor, persisted normalized
  feeds, deterministic code classification, exact staged-unit matching, ambiguity
  shielding, explicit unknown-resource creation, stale-feed protection, and guarded
  clearance grace/override behavior.
- Deterministic server reporting with separate run-duration and unit-call totals,
  per-unit activity, dispositions, source/subtype splits, Qwen narrative-only schema,
  fallback narrative, ReportLab PDF, SHA-256 header, and export history.

## Verification completed on the candidate

| Check | Result |
|---|---|
| Backend unit/integration tests | 37 passing |
| Frontend component/store tests | 37 passing |
| Frontend production build | Passing; about 468 kB JS / 141 kB gzip |
| Playwright desktop, iPad Pro 11, Pixel 7 | 6 passing against the production build |
| Exact report totals | Fixed-time DB fixture verifies event, run, assignment, unit, and disposition totals |
| Qwen report outage | PDF still renders with deterministic fallback |
| PulsePoint outage/stale protection | Recorded fixtures verify no automatic clearance from failed/stale data |
| Unknown PulsePoint unit | Remains external until an operator deliberately adds it |
| Realtime incident isolation | Separate-client WebSocket integration tests pass |

## Operational boundaries

- The realtime hub is process-local. `CMD_UVICORN_WORKERS` must remain `1` until a
  shared broker is introduced.
- PulsePoint is advisory. `CMD_PULSEPOINT_AUTOMATION=false` preserves server ingestion
  and display while disabling automated assignment/reconciliation.
- The transcription benchmark harness is present, but no approved representative
  radio recordings were supplied. No WER, unit-designator accuracy, latency, CPU, or
  memory result has been invented; run the harness with approved fixtures before
  changing the pinned production STT model.
- Browser and software tests do not prove the physical radio cable, tablet microphone,
  room acoustics, touchscreen hardware, or wall display. Those require on-site checks.
- AI transcript and narrative remain administrative decision support. Operators must
  verify critical traffic against radio, CAD, dispatch logs, and command procedures.
- Raw audio is not persisted by default; all inference remains local on the GMKtec.

## Production acceptance gate

After deployment, record the deployed Git SHA from `/api/system/version`, container
health, SQLite integrity/backup evidence, internal and Access-gated reachability,
scene/special-event UI smoke, incident isolation, STT readiness, PulsePoint feed state,
PDF download/hash/history, and any remaining physical checks. Green repository tests
alone are not production completion.
