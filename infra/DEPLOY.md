# Deploying MBFD Command (GMKtec + Cloudflare)

Single-origin design: the SPA, REST API, and mic WebSocket are all served from
**one** container (`cmd`) at `https://cmd.mbfdhub.com`, behind **one** Cloudflare
Access application. A dedicated `cmd-whisper` container provides STT; the warm
`qwen3.6:35b` on the host provides speaker tagging.

```
Browser ── HTTPS/WSS ──► cmd.mbfdhub.com
                          │ (Cloudflare Access: email OTP)
                          ▼
                 Cloudflare Tunnel (mbfdhub-gmktec)
                          │  → http://localhost:8210
                          ▼
                    [cmd container]  ── http://cmd-whisper:8000  (STT)
                                     └─ http://host.docker.internal:11434 (Ollama qwen3.6)
                                     └─ /app/data/*.sqlite (transcript + board)
```

## Prerequisites on the box

- Docker (already present). No Node needed — the SPA builds inside the image.
- The `mbfd-ai` docker network (already present; `cmd-whisper`/`cmd` join it).
- Warm `qwen3.6:35b` in Ollama (already pinned).

## 1. Get the code on the box

```bash
ssh gmktec
sudo install -d -o mbfd -g mbfd /opt/mbfd/cmd
git clone https://github.com/pdarleyjr/mbfd-command.git /opt/mbfd/cmd
cd /opt/mbfd/cmd
```

## 2. Build the image (pass the Google Maps key as a build arg)

The Maps key is baked into the SPA bundle at build time (it's referrer-restricted
and the app is behind Access, so this is safe). Rebuild whenever the key changes.

```bash
# Maps key lives only here at build time — not committed.
VITE_GOOGLE_MAPS_API_KEY="<paste key>" \
docker build -f api/Dockerfile -t mbfd-cmd:latest \
  --build-arg VITE_GOOGLE_MAPS_API_KEY="$VITE_GOOGLE_MAPS_API_KEY" .
```

(Without the key the build still works; the map shows the "add a key" placeholder.)

## 3. Start the containers

```bash
docker compose -f infra/compose.cmd.yaml up -d
docker logs cmd --tail 20          # expect "cmd-api ready" + "serving SPA from /app/static"
curl -s http://127.0.0.1:8210/api/health   # {"ok":true,...}
```

The first STT call warms `cmd-whisper` (a few seconds); subsequent calls are fast.

## 4. Cloudflare Tunnel route

The production tunnel `mbfdhub-gmktec` is **remote-managed** (config in the CF
dashboard, not on disk). Add an ingress rule:

- Hostname: `cmd.mbfdhub.com`
- Service: `http://localhost:8210`

via the dashboard (Zero Trust → Networks → Tunnels → mbfdhub-gmktec → Public
hostnames → Add), or the API. This also creates the proxied DNS CNAME.

## 5. Cloudflare Access (gate the whole origin)

Create a **self-hosted** Access application:

- Application domain: `cmd.mbfdhub.com` (path `*` — covers UI, `/api/*`, `/ws/*`).
- Policy: allow emails ending `@miamibeachfl.gov` plus the admin addresses
  (same identities used elsewhere in the ecosystem; team `darl.cloudflareaccess.com`,
  email OTP).
- Because everything is same-origin, the single Access cookie authorizes the page,
  the API, and the mic WebSocket — no CORS or cross-subdomain dance.

## 6. Verify end-to-end

1. Open `https://cmd.mbfdhub.com`, authenticate via OTP.
2. The board, unit bank, columns, and (with a key) the map render.
3. Press **Start Listening**, allow the mic; speak a radio-style line
   ("Engine 1 to Command, water on the fire"). A partial appears, then a parsed
   final line (`E1: …`).

## Updating

```bash
cd /opt/mbfd/cmd && git pull
VITE_GOOGLE_MAPS_API_KEY="<key>" docker build -f api/Dockerfile -t mbfd-cmd:latest \
  --build-arg VITE_GOOGLE_MAPS_API_KEY="$VITE_GOOGLE_MAPS_API_KEY" .
docker compose -f infra/compose.cmd.yaml up -d
```

## Notes / safety

- Only `127.0.0.1:8210` is published; nothing is exposed on the LAN/public IP.
- `cmd-whisper` is dedicated — it never contends with Open WebUI's shared
  `whisper-stt`.
- No command data, audio, transcripts, or AI calls leave the homelab.
- The DB volume `cmd-data` holds transcripts + board snapshots; back it up with
  the existing Restic→R2 job if desired.
