import { apiBase } from '@/lib/config'

export interface PulsePointUnit {
  id: string
  status?: string | null
  clearedAt?: string | null
}

export interface PulsePointIncident {
  id: string
  callTypeCode?: string
  callType: string
  address: string
  receivedAt: string
  closedAt?: string | null
  units: PulsePointUnit[]
  lat?: number | null
  lng?: number | null
}

export interface PulsePointFeed {
  active: PulsePointIncident[]
  recent: PulsePointIncident[]
  fetchedAt: string
  agency?: string
  error?: string
  stale?: boolean
}

export async function fetchPulsePointFeed(signal?: AbortSignal): Promise<PulsePointFeed> {
  const resp = await fetch(`${apiBase()}/api/pulsepoint/incidents`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  const data = (await resp.json()) as PulsePointFeed
  if (!resp.ok) {
    throw new Error(data.error || `PulsePoint feed failed (${resp.status})`)
  }
  return {
    active: Array.isArray(data.active) ? data.active : [],
    recent: Array.isArray(data.recent) ? data.recent : [],
    fetchedAt: data.fetchedAt || new Date().toISOString(),
    agency: data.agency,
    error: data.error,
    stale: data.stale,
  }
}

export function incidentTime(iso: string): string {
  if (!iso) return '--:--'
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/New_York',
    })
  } catch {
    return '--:--'
  }
}

export function feedAge(iso: string): string {
  if (!iso) return 'just now'
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  return `${Math.floor(diff / 3600)}h ago`
}
