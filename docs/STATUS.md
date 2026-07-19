# MBFD Command V2 — Deployment Status

**Production release completed and accepted on 2026-07-19.**

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

## Verification completed

| Check | Result |
|---|---|
| Backend unit/integration tests | 39 passing |
| Frontend component/store tests | 37 passing |
| Frontend production build | Passing; about 468 kB JS / 141 kB gzip |
| Playwright desktop, iPad Pro 11, Pixel 7 | 6 passing against the deployed build through the GMKtec tunnel |
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

## Production acceptance record

| Check | Production result |
|---|---|
| Application release | `/api/system/version` reports `85f851f60b6c7da8d36f896749d7988e2e19ee5e` |
| Application image | `sha256:4728ffc4fdf826781c5914a550f018ad0560196606321717f8249afcc0c20bed` |
| PulsePoint Worker | Deployed version `84ec9b22-5478-458e-b358-f7882ac613f9` |
| Container health | `cmd` running with zero restarts; `cmd-whisper` healthy with zero restarts |
| AI readiness | STT model installed/ready; host Qwen parser ready |
| Public boundary | Unauthenticated `/` and `/api/health` both return Cloudflare Access `302` redirects |
| Database preservation | `PRAGMA quick_check=ok`; migrations 1 and 2; 22 legacy incidents, 170 legacy transcript rows, and 1 legacy incident snapshot preserved |
| Backups | Pre-migration and just-in-time SQLite backups stored under `/opt/mbfd/backups`; both hash to `f1dc1d681dba7c4694c1f747d3e67d5af8487e8496288d32125db6b24632171b` |
| Realtime | Two live scenes proved incident isolation, revision 2 delivery, and reconnect recovery; unknown sockets close without server exceptions |
| Special event | Live custom unit assignment, medical run, `no_patient` disposition, and return to prior staging passed |
| PDF | Live 2,433,512-byte PDF passed media-type, content, response SHA, and export-history checks; Qwen narrative did not use fallback |
| PulsePoint | Live feed was non-stale with 1 active and 10 recent incidents at observation time |
| Cleanup | All generated acceptance and E2E fixture records were name/ID verified, deleted, and followed by `quick_check=ok`; one migrated V2 snapshot remains |
| Post-release logs | No `ERROR`, traceback, critical, or assertion entries after the final disconnect-cleanup release and repeated UI suite |

The remaining checks are physical: approved representative radio recordings for the
benchmark harness, real radio/audio-interface capture, and hands-on use on the actual
tablets/touchscreens and any wall display. These cannot be proven by browser automation
or runtime telemetry.
