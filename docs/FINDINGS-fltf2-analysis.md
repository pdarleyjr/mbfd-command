# Findings — Prior System Analysis (FLTF2 Task Force Portal)

> Read-only analysis performed before building MBFD Command. The old project was
> **not modified**. Source: `D:\GitHub_Repos\Claude\FLTF2_TF_PORTAL`.

## What was found

The closest prior system to "USAR / incident tablet command board with drag-and-drop
units" is the **`RescueMissionBoard`** feature inside the **FLTF2 Task Force Portal** —
a **Laravel 11 + Filament 5 + Livewire 4 + Alpine.js** server-driven monolith
(production domain `tfportalapp.com`, entirely separate from the MBFD ecosystem).

Sibling projects in the same folder were considered and ruled out:

| Project | What it is | Match? |
|---|---|---|
| `FLTF2_TF_PORTAL` | Laravel/Filament/Livewire portal containing `RescueMissionBoard` | **Yes — closest match** |
| `tf-field-app` | React Native / Expo forms + chat + announcements field app | No (not a command board) |
| `tf-core-api` | Laravel API backend | No (data layer only) |
| `fltf2portal` | Empty workspace stub (`.claude`/`.wrangler` only) | No |

## How the old board works

- **Data model** (`rescue_mission_*` tables): `boards → tasks (columns) → squad_assignments (cards, `current_task_id`) → movements (audit trail) → activities (event log)`. Card placement is a FK to a task; reordering uses `sort_order`. An operation timer (accumulated + live) and **PAR (Personnel Accountability Report)** interval are tracked server-side. Soft-delete via `archived_at`. Idempotent moves via `client_mutation_id`.
- **Drag & drop**: ⚠️ The old board **does not implement true drag-and-drop**. Cards are moved with a `<select>` dropdown (`mission-move-select` → `moveViaSelect()`), a deliberate compromise because native HTML5 DnD is poor on touch.
- **Radio + AI**: client-side **WebAudio + voice-activity detection** streams audio segments to a **Cloudflare Workers AI** transcription worker; results are POSTed to `RadioNoteController` and stored as immutable `activities` with `transcript` + `confidence` + `category`, then broadcast over **Reverb/Echo** private channels (45 s polling fallback). AI SITREP generation uses Llama 3.3-70B with strict JSON output, low temperature (0.1–0.15), a fallback model, and async jobs.
- **Theme**: dark "Tactical Sentinel" palette (`#071327` base, `#AFC9EA` HUD blue, `#f97316` accent), 44 px+ touch targets, glass nav, optimistic UI with rollback.

## What MBFD Command reuses (conceptually)

- The board **data shape** — columns + cards + an append-only activity/movement log — simplified to columns + cards + a transcript log.
- The **radio pipeline pattern** — mic → VAD/chunking → transcribe → confidence metadata → append-only log → speaker tagging.
- The **AI discipline** — strict JSON, "never invent units", low temperature, graceful fallback (carried into the `mbfd-radio-parser` prompt).
- The **dark, touch-first, high-contrast** command aesthetic and PAR-style operation clock.

## What MBFD Command deliberately avoids

- **The faked drag-and-drop.** We use **dnd-kit** for true touch/mouse/stylus drag — the single biggest UX upgrade over the old board.
- **The Laravel/Livewire/Filament monolith.** MBFD Command is a **standalone client-first React/Vite SPA** plus a thin Python gateway, with **no coupling** to the Hub. This sidesteps the entire class of issues recorded in the old project's `AI_ERROR_LOG.md` (Livewire reserved method names, Tailwind unavailable in Filament hooks, duplicate DOM ids breaking diffing, stale queue-worker code) and its `AI_PROJECT_AUDIT_FINDINGS.md` (a non-green test suite in production).
- **A 1,650-line monolithic board view.** We keep many small, focused files.
- **Cloud AI for transcription.** We use the **local** GMKtec stack (existing faster-whisper STT + warm `qwen3.6:35b`), so no command/radio data leaves the homelab.
