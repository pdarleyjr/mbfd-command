# Deploying MBFD Command (GMKtec + Cloudflare)

The React SPA, REST API, WebSockets, PulsePoint reconciliation, report metrics, and
PDF renderer are served from the single `cmd` container at
`https://cmd.mbfdhub.com`. Cloudflare Access gates the complete origin. A dedicated
`cmd-whisper` container provides STT; the pinned, warm `qwen3.6:35b` on the host is
used only for constrained radio enrichment and administrative report narrative.

```text
Browser ── HTTPS/WSS ──► Cloudflare Access/Tunnel ──► 127.0.0.1:8210
                                                       │
                                                       ├─ cmd (FastAPI + SPA)
                                                       ├─ cmd-whisper:8000
                                                       ├─ host Ollama:11434
                                                       └─ cmd-data SQLite volume
```

## 1. Preflight

Production lives at `/opt/mbfd/cmd`. Preserve unexpected or dirty state and stop if
the runtime topology differs from this document.

```bash
cd /opt/mbfd/cmd
git status --short
docker compose -f infra/compose.cmd.yaml ps
docker inspect --format='{{json .State.Health}}' cmd-whisper
docker exec cmd python -c "import sqlite3; c=sqlite3.connect('/app/data/mbfd_command.sqlite'); print(c.execute('PRAGMA quick_check').fetchone()[0])"
df -h /opt /var/lib/docker
curl -fsS http://127.0.0.1:8210/api/system/version
```

Do not rotate API keys, Worker secrets, tokens, or Cloudflare credentials during a
normal application release.

## 2. Recoverable backup and rollback gate

Create and hash a SQLite hot backup before the new image runs migrations:

```bash
backup="/opt/mbfd/backups/cmd-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
sudo install -d -o mbfd -g mbfd /opt/mbfd/backups
docker exec cmd python -c "import sqlite3; src=sqlite3.connect('/app/data/mbfd_command.sqlite'); dst=sqlite3.connect('/app/data/predeploy.sqlite'); src.backup(dst); dst.close(); src.close()"
docker cp cmd:/app/data/predeploy.sqlite "$backup"
sha256sum "$backup"
```

Tag the current image before replacement. Retain that tag and the matching DB backup
until acceptance passes. A rollback restores the prior image and whole matching
SQLite backup; never copy selected tables between schema versions.

## 3. Update and build an identifiable image

The referrer-restricted Maps key remains outside Git. The release SHA is baked into
the image and exposed at `/api/system/version`.

```bash
cd /opt/mbfd/cmd
git pull --ff-only
export VITE_GOOGLE_MAPS_API_KEY="<existing key>"
docker tag mbfd-cmd:latest "mbfd-cmd:rollback-$(date -u +%Y%m%dT%H%M%SZ)"
docker build -f api/Dockerfile -t mbfd-cmd:latest \
  --build-arg RELEASE_SHA="$(git rev-parse HEAD)" \
  --build-arg VITE_GOOGLE_MAPS_API_KEY="$VITE_GOOGLE_MAPS_API_KEY" .
```

## 4. Start and verify the containers

```bash
docker compose -f infra/compose.cmd.yaml up -d
docker compose -f infra/compose.cmd.yaml ps
docker inspect --format='{{json .State.Health}}' cmd-whisper
docker logs cmd --tail 100
curl -fsS http://127.0.0.1:8210/api/health
curl -fsS http://127.0.0.1:8210/api/system/version
curl -fsS http://127.0.0.1:8210/api/transcription/health
docker exec cmd python -c "import sqlite3; c=sqlite3.connect('/app/data/mbfd_command.sqlite'); print(c.execute('PRAGMA quick_check').fetchone()[0])"
```

Keep `CMD_UVICORN_WORKERS=1` until realtime fan-out moves to a shared broker.

## 5. Deploy the version-controlled PulsePoint Worker

The Worker source is in `infra/pulsepoint-worker`. A normal deploy preserves existing
Worker secrets.

```bash
cd /opt/mbfd/cmd/infra/pulsepoint-worker
npm ci
npx wrangler deploy
```

The FastAPI monitor owns polling and reconciliation; browser refresh intervals never
decide assignments or clearance. `CMD_PULSEPOINT_AUTOMATION=false` retains read-only
ingestion for a rollback-safe automation disable.

## 6. Cloudflare routing and Access

The remote-managed tunnel `mbfdhub-gmktec` routes `cmd.mbfdhub.com` to
`http://localhost:8210`. One self-hosted Access application at path `*` must cover the
SPA, `/api/*`, and `/ws/*`. Do not create a second unauthenticated API hostname.

## 7. Runtime acceptance

1. Confirm `/api/system/version` matches the deployed Git SHA.
2. Confirm the public hostname redirects an unauthenticated request to Access, then
   test the authenticated UI with touch-sized controls at desktop, tablet, and phone
   dimensions.
3. Create two distinct validation incidents. Mutate/reconnect one and verify its
   revisions/events never enter the other or change the other client's selection.
4. Create a special event, assign a manual run, record its medical disposition,
   clear the unit, refresh, and verify it returned to its previous staging location.
5. Confirm the server-owned PulsePoint feed displays. Exercise automation only with
   controlled staged-unit data; a failed or stale feed must never clear a unit.
6. Export an Event PDF. Verify `application/pdf`, `X-Content-SHA256`, and the matching
   `/api/incidents/{id}/exports` history entry. The isolated test suite must also prove
   PDF fallback when Ollama is unavailable.
7. Start one audio capture and verify raw-final-first transcript fan-out to every
   viewer of that incident without appearing in a different incident.
8. Record which physical tablet, radio/audio interface, and wall-display checks were
   performed. Software acknowledgements do not prove physical audio or display output.

## Safety notes

- Only `127.0.0.1:8210` is published; public reachability is through the Access-gated
  tunnel.
- No command data, raw audio, transcripts, or reports are sent to external AI.
- Raw audio is not persisted by default.
- The `cmd-data` volume contains canonical operational records; include it in the
  existing encrypted backup program.
- Qwen does not dispatch/clear units or calculate report statistics. Operators must
  review AI transcript and narrative as decision support.
