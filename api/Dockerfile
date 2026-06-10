# Single-origin image: builds the SPA and serves it from FastAPI alongside the
# transcription API + WebSocket. Build from the REPO ROOT:
#   docker build -f api/Dockerfile -t mbfd-cmd \
#     --build-arg VITE_GOOGLE_MAPS_API_KEY=... .

# ---- 1. Build the React/Vite SPA ----
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# Public (client-baked) build-time config. Empty VITE_CMD_API_URL => same-origin.
ARG VITE_GOOGLE_MAPS_API_KEY=""
ARG VITE_GOOGLE_MAPS_MAP_ID=""
ARG VITE_CMD_API_URL=""
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY \
    VITE_GOOGLE_MAPS_MAP_ID=$VITE_GOOGLE_MAPS_MAP_ID \
    VITE_CMD_API_URL=$VITE_CMD_API_URL
RUN npm run build

# ---- 2. FastAPI runtime serving the API + the built SPA ----
FROM python:3.12-slim AS api
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CMD_STATIC_DIR=/app/static \
    CMD_DB_PATH=/app/data/mbfd_command.sqlite
COPY api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY api/app ./app
COPY api/prompts ./prompts
COPY --from=web /web/dist ./static
RUN mkdir -p /app/data
EXPOSE 8200
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8200"]
