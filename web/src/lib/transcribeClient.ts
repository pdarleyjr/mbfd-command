import type { SharedTranscriptionState, TranscriptEntry } from '@/types'
import { apiBase, wsBase } from '@/lib/config'
import { uid } from '@/lib/id'
import {
  startMic,
  type AudioInputProfile,
  type MicHandle,
} from '@/lib/mic'
import { useTranscript } from '@/store/transcriptStore'

const CLIENT_ID_KEY = 'mbfd-command-client-id'

function clientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY)
    if (existing) return existing
    const value = uid('client')
    localStorage.setItem(CLIENT_ID_KEY, value)
    return value
  } catch {
    return uid('client')
  }
}

interface CaptureRequest {
  deviceId?: string
  profile: AudioInputProfile
  label: string
}

class TranscribeClient {
  private ws: WebSocket | null = null
  private mic: MicHandle | null = null
  private incidentId = ''
  private leaseId = ''
  private watching = false
  private captureRequest: CaptureRequest | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  readonly clientId = clientId()

  async watch(incidentId: string): Promise<void> {
    if (this.watching && this.incidentId === incidentId && this.ws) return
    await this.unwatch()
    this.watching = true
    this.incidentId = incidentId
    const store = useTranscript.getState()
    store.setStatus(incidentId, 'connecting')
    store.setError(incidentId, null)
    void this.hydrate(incidentId)
    await this.openSocket()
  }

  async start(
    incidentId: string,
    deviceId?: string,
    profile: AudioInputProfile = 'radio_speaker',
    label = 'Command device',
  ): Promise<void> {
    await this.watch(incidentId)
    this.captureRequest = { deviceId, profile, label }
    this.sendControl('transcription.acquire', { captureLabel: label })
  }

  requestTakeover(label = 'Command device'): void {
    this.captureRequest ??= { profile: 'radio_speaker', label }
    this.sendControl('transcription.takeover', { captureLabel: label })
  }

  async stop(): Promise<void> {
    this.sendControl('transcription.stop', {})
    await this.stopMic()
    this.leaseId = ''
    this.captureRequest = null
  }

  async clear(incidentId: string): Promise<void> {
    const response = await fetch(`${apiBase()}/api/incidents/${encodeURIComponent(incidentId)}/transcript`, {
      method: 'DELETE', headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Could not clear transcript (${response.status})`)
    useTranscript.getState().clearIncident(incidentId)
  }

  async unwatch(): Promise<void> {
    this.watching = false
    await this.stopMic()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.incidentId = ''
    this.leaseId = ''
  }

  private async hydrate(incidentId: string): Promise<void> {
    try {
      const response = await fetch(`${apiBase()}/api/incidents/${encodeURIComponent(incidentId)}/transcript`)
      if (!response.ok) return
      const payload = await response.json() as { entries?: TranscriptEntry[] }
      if (this.incidentId === incidentId) {
        useTranscript.getState().hydrate(incidentId, payload.entries ?? [])
      }
    } catch {
      // Live WebSocket can still provide new entries while history is unavailable.
    }
  }

  private openSocket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const query = `client=${encodeURIComponent(this.clientId)}` +
        (this.leaseId ? `&lease=${encodeURIComponent(this.leaseId)}` : '')
      const ws = new WebSocket(
        `${wsBase()}/ws/incidents/${encodeURIComponent(this.incidentId)}/audio?${query}`,
      )
      this.ws = ws
      ws.binaryType = 'arraybuffer'
      const timeout = setTimeout(() => reject(new Error('Transcription server timed out')), 8000)
      ws.onopen = () => {
        clearTimeout(timeout)
        if (this.leaseId && this.captureRequest) void this.beginMic(this.captureRequest)
        resolve()
      }
      ws.onmessage = (event) => this.onMessage(event)
      ws.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Cannot reach the transcription server'))
      }
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null
        if (this.watching) {
          useTranscript.getState().setStatus(this.incidentId, 'reconnecting')
          this.reconnect()
        }
      }
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Transcription connection failed'
      useTranscript.getState().setError(this.incidentId, message)
      useTranscript.getState().setStatus(this.incidentId, 'error')
      throw error
    })
  }

  private onMessage(event: MessageEvent): void {
    if (typeof event.data !== 'string' || !this.incidentId) return
    let message: Record<string, unknown>
    try {
      message = JSON.parse(event.data) as Record<string, unknown>
    } catch {
      return
    }
    const store = useTranscript.getState()
    switch (message.type) {
      case 'transcription.state': {
        const state = message.state as SharedTranscriptionState
        store.setState(this.incidentId, state)
        store.setStatus(this.incidentId, state.enabled ? 'listening' : 'idle')
        break
      }
      case 'transcription.lease_acquired': {
        const payload = message.payload as { leaseId?: string }
        if (!payload.leaseId) return
        this.leaseId = payload.leaseId
        void this.reopenWithLease()
        break
      }
      case 'transcript.partial':
        store.setPartial(this.incidentId, String(message.text ?? ''))
        break
      case 'transcript.final':
      case 'transcript.enriched':
        if (message.entry) store.upsertEntry(this.incidentId, message.entry as TranscriptEntry)
        break
      case 'transcript.cleared':
        store.clearIncident(this.incidentId)
        break
      case 'error':
        store.setError(this.incidentId, String(message.message ?? 'Transcription error'))
        break
    }
  }

  private async reopenWithLease(): Promise<void> {
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    await this.openSocket()
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => {
      this.sendControl('transcription.heartbeat', { leaseId: this.leaseId })
    }, 4000)
  }

  private async beginMic(request: CaptureRequest): Promise<void> {
    if (this.mic) return
    try {
      this.mic = await startMic(
        (frame) => { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame) },
        (diagnostics) => useTranscript.getState().setDiagnostics(this.incidentId, diagnostics),
        request.deviceId,
        request.profile,
      )
      useTranscript.getState().setError(this.incidentId, null)
      useTranscript.getState().setStatus(this.incidentId, 'listening')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start listening'
      useTranscript.getState().setError(this.incidentId, humanizeMicError(message))
      useTranscript.getState().setStatus(this.incidentId, 'error')
      this.sendControl('transcription.stop', {})
    }
  }

  private sendControl(action: string, payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action, payload }))
    }
  }

  private async stopMic(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    await this.mic?.stop()
    this.mic = null
    if (this.incidentId) useTranscript.getState().setDiagnostics(this.incidentId, null)
  }

  private reconnect(): void {
    if (!this.watching || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.watching) void this.openSocket().catch(() => this.reconnect())
    }, 2000)
  }
}

function humanizeMicError(message: string): string {
  if (/Permission|NotAllowed|denied/i.test(message)) return 'Microphone permission was blocked. Allow mic access, then try again.'
  if (/NotFound|Requested device/i.test(message)) return 'No microphone was found on this device.'
  if (/NotReadable|TrackStart/i.test(message)) return 'The selected microphone is busy or unavailable.'
  if (/secure browser context|mediaDevices/i.test(message)) return 'Microphone access requires HTTPS or localhost.'
  return message
}

export const transcribeClient = new TranscribeClient()
