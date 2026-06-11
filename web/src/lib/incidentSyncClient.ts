import type { Incident } from '@/types'
import { wsBase } from '@/lib/config'
import { uid } from '@/lib/id'
import { useBoard } from '@/store/boardStore'

const CHANNEL = 'active'
const CLIENT_ID_KEY = 'mbfd-command-client-id'

interface SnapshotPayload {
  incident: Incident | null
  updatedAt?: string | null
}

interface SyncMessage {
  type: string
  clientId?: string
  snapshot?: SnapshotPayload | null
  incident?: Incident | null
  updatedAt?: string | null
}

function getClientId(): string {
  if (typeof window === 'undefined') return uid('client')
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY)
    if (existing) return existing
    const next = uid('client')
    window.localStorage.setItem(CLIENT_ID_KEY, next)
    return next
  } catch {
    return uid('client')
  }
}

/** Full-incident live sync for the shared command board. */
class IncidentSyncClient {
  private ws: WebSocket | null = null
  private active = false
  private applyingRemote = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private sendTimer: ReturnType<typeof setTimeout> | null = null
  private unsubscribe: (() => void) | null = null
  private pendingIncident: Incident | null = null
  private readonly clientId = getClientId()

  start(): void {
    if (this.active) return
    this.active = true
    this.unsubscribe = useBoard.subscribe((state, previous) => {
      if (this.applyingRemote) return
      const incident = state.incidents.find((i) => i.id === state.activeIncidentId) ?? null
      const previousIncident = previous.incidents.find((i) => i.id === previous.activeIncidentId) ?? null
      if (!incident || incident === previousIncident) return
      this.scheduleSend(incident)
    })
    this.openSocket()
  }

  stop(): void {
    this.active = false
    this.pendingIncident = null
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.sendTimer) clearTimeout(this.sendTimer)
    this.reconnectTimer = null
    this.sendTimer = null
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.ws) {
      this.ws.onclose = null
      try {
        this.ws.close()
      } catch {
        /* noop */
      }
      this.ws = null
    }
  }

  private openSocket(): void {
    const url = `${wsBase()}/ws/incident?channel=${encodeURIComponent(CHANNEL)}&client=${encodeURIComponent(this.clientId)}`
    const ws = new WebSocket(url)
    this.ws = ws
    ws.onmessage = (e) => this.onMessage(e)
    ws.onopen = () => {
      this.flushLatest()
    }
    ws.onclose = () => {
      if (this.active) this.reconnect()
    }
    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        /* noop */
      }
    }
  }

  private onMessage(e: MessageEvent): void {
    if (typeof e.data !== 'string') return
    let msg: SyncMessage
    try {
      msg = JSON.parse(e.data)
    } catch {
      return
    }

    if (msg.clientId === this.clientId) return
    if (msg.type === 'ready') {
      if (msg.snapshot?.incident) this.applyRemoteIncident(msg.snapshot.incident)
      else this.scheduleSend(useBoard.getState().getActive())
      return
    }
    if (msg.type === 'incident.snapshot' && msg.incident) {
      this.applyRemoteIncident(msg.incident)
    }
  }

  private applyRemoteIncident(incident: Incident): void {
    this.applyingRemote = true
    try {
      useBoard.getState().applyRemoteIncident(incident)
    } finally {
      this.applyingRemote = false
    }
  }

  private scheduleSend(incident: Incident | null): void {
    if (!incident || this.applyingRemote) return
    this.pendingIncident = incident
    if (this.sendTimer) return
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null
      this.flushLatest()
    }, 200)
  }

  private flushLatest(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    const incident = this.pendingIncident ?? useBoard.getState().getActive()
    if (!incident) return
    this.pendingIncident = null
    this.ws.send(
      JSON.stringify({
        type: 'incident.update',
        channel: CHANNEL,
        clientId: this.clientId,
        incident,
      }),
    )
  }

  private reconnect(): void {
    if (!this.active || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.active) this.openSocket()
    }, 2000)
  }
}

export const incidentSyncClient = new IncidentSyncClient()
