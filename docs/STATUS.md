# MBFD Command — Deployment Status

**Prototype deployed 2026-06-10.**

| Item | Value |
|---|---|
| Repo | https://github.com/pdarleyjr/mbfd-command (private) |
| App URL | https://cmd.mbfdhub.com (behind Cloudflare Access — staff OTP) |
| Hosting | GMKtec homelab via Cloudflare Tunnel `mbfdhub-gmktec` |
| Containers | `cmd` (FastAPI + SPA, 127.0.0.1:8210) · `cmd-whisper` (speaches, dedicated) |
| LLM | Ollama `qwen3.6:35b` (warm, on host) |
| STT model | `Systran/faster-distil-whisper-small.en` (CPU/int8) |
| Access policy | `@miamibeachfl.gov` + admin emails (mirrors existing MBFD apps) |

## Testing checklist results

| Check | Result |
|---|---|
| Frontend typecheck (`tsc -b`) | ✅ clean |
| Frontend unit tests (board transforms) | ✅ 12/12 |
| Frontend production build | ✅ 363 KB JS / 115 KB gzip (no map bundle bloat) |
| Backend tests (parser sanitization) | ✅ 6/6 |
| Drag unit bank → column (real gesture) | ✅ E1 moved + persisted |
| Tablet landscape (1366×1024) | ✅ fits, no full-page scroll |
| Large display (1920×1080) | ✅ all 7 columns visible, scales cleanly |
| Mobile (390×844) | ✅ adapts, board scrolls internally, map collapsible |
| End-to-end on box: TTS → `cmd-whisper` STT → qwen parser | ✅ "Engine 1 to command, water on the fire" → `E1` / Command / fire_attack / 0.95 |
| Safe degradation on garbled audio | ✅ → `inaudible`, no invented unit |
| Public URL gated by CF Access | ✅ `/` and `/api/*` → 302 to Access login |
| `cmd-whisper` model auto-install on startup | ✅ verified ("already installed") |

## Known limitations

- **Google Maps key pending.** Until `VITE_GOOGLE_MAPS_API_KEY` is set and the
  image rebuilt, the map shows a clean "add a key" placeholder; everything else
  works. Rebuild step is in [`infra/DEPLOY.md`](../infra/DEPLOY.md) §2.
- **STT is CPU `distil-small.en`** (no GPU — CTranslate2 has no ROCm path). Fast
  and good for clear radio; accuracy drops on heavy noise/cross-talk. The model is
  swappable via `CMD_WHISPER_MODEL` (e.g. `…medium.en`) at a latency cost.
- **Mic source.** Transcription captures the browser device's microphone — point
  it at the radio speaker (or use a line-in). It is not a direct CAD/radio feed.
- **Board↔backend sync is one-way-ready.** Board state persists in the browser
  (localStorage) and the backend exposes board snapshot endpoints, but the
  frontend does not yet auto-push snapshots (transcripts ARE stored server-side).
- **Single-user-ish.** No real-time multi-device board sync yet (each device keeps
  its own board state). Fine for one command post; see next steps.
- **Prototype, not certified.** Decision-support only; see the in-app disclaimer.

## Recommended next improvements

1. **Multi-device live board sync** — push board snapshots over the existing
   `/api/incidents/{id}/board` endpoints (debounced) + a small broadcast channel so
   the command post, a tablet, and the wall display share one board in real time.
2. **PAR / accountability timer** — periodic PAR prompts keyed off the operation
   clock (the old FLTF2 board had this; high value on the fireground).
3. **Keyword alerting** — highlight/sound on `mayday`, `water on the fire`,
   `evacuate`, etc. (the parser already flags these).
4. **Better STT** — evaluate `medium.en`, or a GPU STT path if a CUDA box is added;
   add a custom MBFD phrase/unit biasing prompt to whisper.
5. **One-tap incident from CAD/dispatch address** — prefill the map + name.
6. **PDF export polish** — server-side PDF (the print stylesheet is the v1).
7. **Audit log** — persist board movements server-side (mirrors the old
   `movements`/`activities` tables) for after-action review.
