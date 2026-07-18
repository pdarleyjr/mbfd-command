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
| Google Maps key baked into production SPA | ✅ verified in `mbfd-cmd:latest` bundle |

## Known limitations

- **Google Maps local referrer restriction.** Production has the Maps key baked into
  the SPA. Local browser testing at `http://127.0.0.1:5180` requires that referrer
  to be allowed in Google Cloud; otherwise Google returns `RefererNotAllowedMapError`.
- **STT is CPU `distil-small.en`** (no GPU — CTranslate2 has no ROCm path). Fast
  and good for clear radio; accuracy drops on heavy noise/cross-talk. The model is
  swappable via `CMD_WHISPER_MODEL` (e.g. `…medium.en`) at a latency cost.
- **Mic source.** Transcription captures the browser device's microphone — point
  it at the radio speaker (or use a line-in). It is not a direct CAD/radio feed.
- **Board synchronization is present but V1.** The frontend currently pushes
  full incident snapshots over `/ws/incident`; the backend persists and fans
  them out to peers. V1 still uses a single `active` channel and last-writer-wins
  snapshots, so incident-scoped revisions and command acknowledgements remain
  required before concurrent multi-incident use.
- **Prototype, not certified.** Decision-support only; see the in-app disclaimer.

## Recommended next improvements

1. **Harden multi-device live board sync** — replace the V1 global channel with
   incident-scoped URLs, revisions, idempotent commands, and append-only audit.
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
