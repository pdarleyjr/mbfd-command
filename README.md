# MBFD Command

A touchscreen-first **incident command board** for the Miami Beach Fire Department.
Drag apparatus into assignment columns, drop the incident on a map, and review
**live AI-assisted radio transcription** — all on one dark, high-contrast screen that
works on tablets, phones, command laptops, and the 86″ wall display.

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
- **Editable columns.** Defaults are Command · Stagging · Fire Attack · Search · RIT ·
  Rehab · Vent. Rename them, add/delete/reorder them, and tag each with a location
  note (Alpha side, Roof, Division 2…). Deleting a column returns its units to the bank.
- **Incident map.** Google Maps + Places address autocomplete (biased to Miami Beach),
  a draggable incident marker, and a recenter button.
- **Live radio transcription.** Press *Start Listening*, allow the mic, and radio
  traffic is transcribed in near-real-time, with the speaking unit inferred
  (`E1: …`) or marked `inaudible`, plus a confidence indicator.
- **Incidents + export.** Multiple incident sessions persist on-device; export the
  board + transcript as CSV / JSON / printable PDF.

## Architecture

```
cmd.mbfdhub.com   ── Cloudflare Pages (React 19 + TS + Vite + dnd-kit + Google Maps)
      │                behind Cloudflare Access
      │  mic audio (WSS)
cmd-api.mbfdhub.com ── Cloudflare Tunnel → GMKtec FastAPI gateway (api/)
      ├─→ cmd-whisper   (faster-whisper / speaches, distil-small.en, CPU)
      ├─→ Ollama qwen3.6:35b   (mbfd-radio-parser → speaker/intent JSON)
      └─→ SQLite        (incident sessions, transcript, board snapshots)
```

The frontend works fully on its own (board + map + local persistence). The Python
gateway only powers live transcription; if it's offline the board still works.

- [`web/`](web/) — the React/Vite frontend (this is the Cloudflare Pages app).
- [`api/`](api/) — the FastAPI transcription gateway (runs on the GMKtec box).
- [`infra/`](infra/) — Docker Compose + Cloudflare deploy notes.
- [`docs/`](docs/) — findings report and design notes.

## Local development

```bash
# Frontend
cd web
cp .env.example .env.local      # add VITE_GOOGLE_MAPS_API_KEY when you have it
npm install
npm run dev                     # http://localhost:5180

# Backend (optional — only needed for live transcription)
cd ../api
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8200
```

Without a Google Maps key the map shows a clean "add a key" placeholder; everything
else works. Without the backend the transcription panel reports it's offline.

## Environment variables

| Var | Where | Purpose |
|---|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | frontend (public) | Maps JS + Places. Restrict by referrer. |
| `VITE_GOOGLE_MAPS_MAP_ID` | frontend (public) | Optional vector Map ID. |
| `VITE_CMD_API_URL` | frontend (public) | Base URL of the transcription gateway. |
| `CMD_WHISPER_URL` | backend | speaches/faster-whisper base URL. |
| `OLLAMA_URL` | backend | Ollama base URL (qwen3.6 parser). |
| `OLLAMA_MODEL` | backend | Parser model (default `qwen3.6:35b`). |

See [`web/.env.example`](web/.env.example) and [`api/.env.example`](api/.env.example).

## Status

**Live prototype** at https://cmd.mbfdhub.com (behind Cloudflare Access). Deployed on
the GMKtec via Cloudflare Tunnel; `cmd` + dedicated `cmd-whisper` containers running;
end-to-end mic → transcript → AI speaker-tagging verified on the box.

**One step remaining:** add the Google Maps API key — set `VITE_GOOGLE_MAPS_API_KEY`
and rebuild the image ([`infra/DEPLOY.md`](infra/DEPLOY.md) §2). Until then the map
shows an "add a key" placeholder and everything else works.

See [`docs/STATUS.md`](docs/STATUS.md) for the full testing checklist, known
limitations, and next steps, and [`docs/FINDINGS-fltf2-analysis.md`](docs/FINDINGS-fltf2-analysis.md)
for the prior-system analysis that informed the design.
