/** Public runtime configuration, read from Vite env (all VITE_* are public). */

const env = import.meta.env

export const config = {
  googleMapsApiKey: (env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim(),
  googleMapsMapId: (env.VITE_GOOGLE_MAPS_MAP_ID ?? '').trim() || undefined,
  // Empty string => same-origin (the single-origin production deploy). Local dev
  // sets this to the standalone gateway, e.g. http://127.0.0.1:8200.
  cmdApiUrl: (env.VITE_CMD_API_URL ?? '').trim().replace(/\/$/, ''),
  map: {
    lat: Number(env.VITE_MAP_DEFAULT_LAT ?? 25.7907),
    lng: Number(env.VITE_MAP_DEFAULT_LNG ?? -80.13),
    zoom: Number(env.VITE_MAP_DEFAULT_ZOOM ?? 13),
  },
}

export const hasMapsKey = config.googleMapsApiKey.length > 0

/** REST base for the gateway. Falls back to the current origin (single-origin deploy). */
export function apiBase(): string {
  return config.cmdApiUrl || (typeof window !== 'undefined' ? window.location.origin : '')
}

/** http(s) base → ws(s) base for the transcription socket. */
export function wsBase(): string {
  return apiBase().replace(/^http/, 'ws')
}
