import type { Incident } from '@/types'
import { wsBase } from '@/lib/config'
import { uid } from '@/lib/id'
import { useBoard } from '@/store/boardStore'

const CLIENT_ID_KEY = 'mbfd-command-client-id'

interface IncidentSnapshotMessage {
  type: 'snapshot'
  incidentId: string
  revision: number
  snapshot: Incident | null
}

interface IncidentServerEvent {
  type: 'event'
  eventId: string
  incidentId: string
  revision: number
  serverAt: string
  actorClientId: string
  action: string
  payload: { snapshot?: Incident }
}

interface CommandRejectedMessage {
  type: 'command.rejected'
  commandId: string
  incidentId: string
  reason: string
  currentRevision: number
}

type SyncMessage = IncidentSnapshotMessage | IncidentServerEvent | CommandRejectedMessage

interface PendingCommand {
  commandId: string
  incident: Incident
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

export function incidentWebSocketUrl(
  incidentId: string,
  clientId: string,
  lastRevision: number,
  base = wsBase(),
): string {
  return (
    `${base}/ws/incidents/${encodeURIComponent(incidentId)}` +
    `?client=${encodeURIComponent(clientId)}` +
    `&lastRevision=${Math.max(0, lastRevision)}`
  )
}

/** Incident-scoped, revision-aware synchronization with one idempotent command in flight. */
class IncidentSyncClient {
  private ws: WebSocket | null = null
  private incidentId: string | null = null
  private active = false
  private applyingRemote = false
  private receivedSnapshot = false
  private lastRevision = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private sendTimer: ReturnType<typeof setTimeout> | null = null
  private unsubscribe: (() => void) | null = null
  private pendingIncident: Incident | null = null
  private inflight: PendingCommand | null = null
  private retry: PendingCommand | null = null
  private readonly clientId = getClientId()

  start(incidentId: string): void {
    if (this.active && this.incidentId === incidentId) return
    this.stop()
    this.active = true
    this.incidentId = incidentId
    this.lastRevision = Math.max(
      0,
      useBoard.getState().incidents.find((item) => item.id === incidentId)?.revision ?? 0,
    )
    this.unsubscribe = useBoard.subscribe((state, previous) => {
      if (this.applyingRemote || !this.incidentId) return
      const incident = state.incidents.find((item) => item.id === this.incidentId) ?? null
      const previousIncident = previous.incidents.find((item) => item.id === this.incidentId) ?? null
      if (!incident || incident === previousIncident) return
      this.scheduleSend(incident)
    })
    this.openSocket()
  }

  stop(): void {
    this.active = false
    this.incidentId = null
    this.pendingIncident = null
    this.inflight = null
    this.retry = null
    this.receivedSnapshot = false
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
        // Socket may already be closed.
      }
      this.ws = null
    }
  }

  private openSocket(): void {
    if (!this.active || !this.incidentId) return
    this.receivedSnapshot = false
    const ws = new WebSocket(
      incidentWebSocketUrl(this.incidentId, this.clientId, this.lastRevision),
    )
    this.ws = ws
    ws.onmessage = (event) => this.onMessage(event)
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null
      if (this.active) this.reconnect()
    }
    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        // Socket may already be closed.
      }
    }
  }

  private onMessage(event: MessageEvent): void {
    if (typeof event.data !== 'string') return
    let message: SyncMessage
    try {
      message = JSON.parse(event.data) as SyncMessage
    } catch {
      return
    }
    if (!this.incidentId || message.incidentId !== this.incidentId) return

    if (message.type === 'snapshot') {
      this.receivedSnapshot = true
      this.lastRevision = message.revision
      const unsynced = this.retry?.incident ?? this.pendingIncident ?? this.inflight?.incident ?? null
      if (message.snapshot) this.applyRemoteIncident(message.snapshot)
      this.inflight = null
      if (unsynced) {
        const rebased = { ...unsynced, revision: message.revision }
        this.applyRemoteIncident(rebased)
        this.pendingIncident = rebased
      } else if (!message.snapshot) {
        const local = useBoard.getState().incidents.find((item) => item.id === this.incidentId)
        if (local) this.pendingIncident = local
      }
      this.flushLatest()
      return
    }

    if (message.type === 'event') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mbfd-incident-event', { detail: message }))
      }
      const pending = this.pendingIncident
      this.lastRevision = message.revision
      if (message.payload.snapshot) this.applyRemoteIncident(message.payload.snapshot)
      if (this.inflight && message.actorClientId === this.clientId) this.inflight = null
      if (pending) {
        const rebased = { ...pending, revision: message.revision }
        this.applyRemoteIncident(rebased)
        this.pendingIncident = rebased
      }
      this.flushLatest()
      return
    }

    if (message.type === 'command.rejected' && this.inflight?.commandId === message.commandId) {
      if (message.reason === 'revision_conflict') {
        this.retry = this.inflight
        this.lastRevision = message.currentRevision
        this.inflight = null
        this.reopenNow()
      } else {
        this.inflight = null
      }
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

  private scheduleSend(incident: Incident): void {
    if (this.applyingRemote || incident.id !== this.incidentId) return
    this.pendingIncident = incident
    if (this.sendTimer) return
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null
      this.flushLatest()
    }, 200)
  }

  private flushLatest(): void {
    if (
      !this.receivedSnapshot ||
      !this.incidentId ||
      this.inflight ||
      this.ws?.readyState !== WebSocket.OPEN
    ) return

    const retry = this.retry
    const incident = retry?.incident ?? this.pendingIncident
    if (!incident) return
    const commandId = retry?.commandId ?? uid('cmd')
    this.retry = null
    this.pendingIncident = null
    this.inflight = { commandId, incident }
    this.ws.send(JSON.stringify({
      type: 'command',
      commandId,
      incidentId: this.incidentId,
      baseRevision: this.lastRevision,
      action: 'incident.replace_snapshot',
      payload: { snapshot: { ...incident, revision: this.lastRevision } },
    }))
  }

  private reopenNow(): void {
    const ws = this.ws
    if (ws) {
      ws.onclose = null
      try {
        ws.close()
      } catch {
        // Socket may already be closed.
      }
      this.ws = null
    }
    if (this.active) this.openSocket()
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
