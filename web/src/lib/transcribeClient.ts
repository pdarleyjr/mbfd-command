import type { MessagePriority, MessageType, TranscriptEntry } from '@/types'
import { uid } from '@/lib/id'
import { wsBase } from '@/lib/config'
import { startMic, type MicHandle } from '@/lib/mic'
import { useTranscript } from '@/store/transcriptStore'

/** Shape of a `final` parse message coming back from cmd-api. */
interface ParsedMessage {
  speaker: string | null
  recipient: string | null
  display_prefix: string
  raw_text: string
  corrected_text: string
  message_type: MessageType
  priority: MessagePriority
  confidence: number
  flags: string[]
}

function toEntry(p: ParsedMessage): TranscriptEntry {
  return {
    id: uid('tx'),
    at: new Date().toISOString(),
    speaker: p.speaker ?? null,
    recipient: p.recipient ?? null,
    displayPrefix: p.display_prefix || 'inaudible',
    rawText: p.raw_text ?? '',
    correctedText: p.corrected_text || p.raw_text || '',
    messageType: p.message_type ?? 'unknown',
    priority: p.priority ?? 'routine',
    confidence: typeof p.confidence === 'number' ? p.confidence : 0,
    flags: Array.isArray(p.flags) ? p.flags : [],
  }
}

/**
 * Owns the mic → WebSocket → transcript-store pipeline. One instance per app.
 * Designed to fail soft: a backend that's unreachable simply leaves the panel
 * in an `error` state without throwing into React.
 */
class TranscribeClient {
  private ws: WebSocket | null = null
  private mic: MicHandle | null = null
  private active = false
  private incidentId = ''

  async start(incidentId: string): Promise<void> {
    if (this.active) return
    this.active = true
    this.incidentId = incidentId
    const tx = useTranscript.getState()
    tx.setError(null)
    tx.setStatus('connecting')

    try {
      await this.openSocket()
      this.mic = await startMic(
        (frame) => {
          if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame)
        },
        (level) => useTranscript.getState().setLevel(level),
      )
      useTranscript.getState().setStatus('listening')
    } catch (err) {
      this.active = false
      const msg = err instanceof Error ? err.message : 'Could not start listening'
      const tx2 = useTranscript.getState()
      tx2.setError(humanizeMicError(msg))
      tx2.setStatus('error')
      await this.teardown()
    }
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${wsBase()}/ws/transcribe?incident=${encodeURIComponent(this.incidentId)}`
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      this.ws = ws

      const timeout = setTimeout(() => reject(new Error('Transcription server timed out')), 8000)

      ws.onopen = () => {
        clearTimeout(timeout)
        resolve()
      }
      ws.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Cannot reach the transcription server'))
      }
      ws.onmessage = (e) => this.onMessage(e)
      ws.onclose = () => {
        if (this.active) {
          // Unexpected drop while listening.
          useTranscript.getState().setStatus('reconnecting')
          this.reconnect()
        }
      }
    })
  }

  private onMessage(e: MessageEvent): void {
    if (typeof e.data !== 'string') return
    let msg: { type: string; text?: string; message?: string; parsed?: ParsedMessage }
    try {
      msg = JSON.parse(e.data)
    } catch {
      return
    }
    const tx = useTranscript.getState()
    switch (msg.type) {
      case 'partial':
        tx.setPartial(msg.text ?? '')
        break
      case 'final':
        if (msg.parsed) tx.addEntry(toEntry(msg.parsed))
        break
      case 'error':
        tx.setError(msg.message ?? 'Transcription error')
        break
    }
  }

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnect(): void {
    if (!this.active || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (!this.active) return
      try {
        await this.openSocket()
        useTranscript.getState().setStatus('listening')
      } catch {
        this.reconnect()
      }
    }, 2000)
  }

  async stop(): Promise<void> {
    this.active = false
    await this.teardown()
    useTranscript.getState().setStatus('idle')
    useTranscript.getState().setPartial('')
    useTranscript.getState().setLevel(0)
  }

  private async teardown(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    await this.mic?.stop()
    this.mic = null
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
}

function humanizeMicError(msg: string): string {
  if (/Permission|NotAllowed|denied/i.test(msg)) {
    return 'Microphone permission was blocked. Allow mic access in your browser, then try again.'
  }
  if (/NotFound|Requested device/i.test(msg)) {
    return 'No microphone was found on this device.'
  }
  return msg
}

export const transcribeClient = new TranscribeClient()
