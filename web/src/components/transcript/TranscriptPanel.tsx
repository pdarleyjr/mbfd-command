import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eraser,
  FileJson,
  Mic,
  MicOff,
  Printer,
  Radio,
  Settings,
  Sheet,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ConnectionStatus, Incident } from '@/types'
import { useTranscript } from '@/store/transcriptStore'
import { listAudioInputs, type AudioInputDevice, type AudioInputProfile } from '@/lib/mic'
import { transcribeClient } from '@/lib/transcribeClient'
import {
  exportIncidentJson,
  exportTranscriptCsv,
  downloadEventSummaryPdf,
  printIncident,
} from '@/lib/export'
import { Button, IconButton } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Modal'
import { TranscriptLine } from './TranscriptLine'

export const STATUS_META: Record<ConnectionStatus, { label: string; dot: string; text: string }> = {
  idle: { label: 'Idle', dot: 'bg-ink-faint', text: 'text-ink-faint' },
  connecting: { label: 'Connecting…', dot: 'bg-warn animate-pulse', text: 'text-warn' },
  listening: { label: 'Listening', dot: 'bg-live animate-pulse-live', text: 'text-live' },
  reconnecting: { label: 'Reconnecting…', dot: 'bg-warn animate-pulse', text: 'text-warn' },
  error: { label: 'Offline', dot: 'bg-warn', text: 'text-warn' },
}

export function TranscriptPanel({
  incident,
  collapsed = false,
  onCollapsedChange,
}: {
  incident: Incident
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}) {
  const transcript = useTranscript()
  const status = transcript.statusByIncident[incident.id] ?? 'idle'
  const partial = transcript.partialByIncident[incident.id] ?? ''
  const error = transcript.errorByIncident[incident.id] ?? null
  const entries = transcript.entriesByIncident[incident.id] ?? []
  const sharedState = transcript.stateByIncident[incident.id]
  const diagnostics = transcript.diagnosticsByIncident[incident.id]
  const [confirmClear, setConfirmClear] = useState(false)
  const [audioInputs, setAudioInputs] = useState<AudioInputDevice[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [profile, setProfile] = useState<AudioInputProfile>('radio_speaker')
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [health, setHealth] = useState<Record<string, unknown> | null>(null)
  const [calibration, setCalibration] = useState('')
  const logRef = useRef<HTMLOListElement>(null)
  const stick = useRef(true)

  const listening = Boolean(sharedState?.enabled)
  const isCaptureClient = sharedState?.captureClientId === transcribeClient.clientId

  useEffect(() => {
    void transcribeClient.watch(incident.id)
    return () => { void transcribeClient.unwatch() }
  }, [incident.id])

  // Auto-scroll to the newest line unless the chief has scrolled up to review.
  useEffect(() => {
    const el = logRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [entries, partial])

  async function refreshAudioInputs() {
    try {
      setAudioInputs(await listAudioInputs())
    } catch {
      setAudioInputs([])
    }
  }

  useEffect(() => {
    void refreshAudioInputs()
    const media = navigator.mediaDevices
    if (!media?.addEventListener) return
    media.addEventListener('devicechange', refreshAudioInputs)
    return () => media.removeEventListener('devicechange', refreshAudioInputs)
  }, [])

  function onScroll() {
    const el = logRef.current
    if (!el) return
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const toggle = () => {
    if (listening) void transcribeClient.stop()
    else {
      const label = audioInputs.find((input) => input.deviceId === deviceId)?.label || 'Command device'
      void transcribeClient.start(incident.id, deviceId || undefined, profile, label).then(refreshAudioInputs)
    }
  }

  async function loadDiagnostics() {
    setShowDiagnostics((value) => !value)
    try {
      const response = await fetch('/api/transcription/health')
      if (response.ok) setHealth(await response.json() as Record<string, unknown>)
    } catch {
      setHealth({ ok: false })
    }
  }

  function calibrate() {
    setCalibration('Sampling background and radio level for 5 seconds…')
    window.setTimeout(() => {
      if (!diagnostics) setCalibration('No input signal was measured. Confirm the selected device.')
      else if (diagnostics.clippingRatio > 0.01) setCalibration('Input is clipping. Reduce the radio or interface output level.')
      else if (diagnostics.rms < 0.005) setCalibration('Input is very quiet. Increase source level or verify the cable/profile.')
      else setCalibration(`Signal looks usable. Noise/voice RMS ${Math.round(diagnostics.rms * 1000) / 10}%, peak ${Math.round(diagnostics.peak * 100)}%.`)
    }, 5000)
  }

  return (
    <section className="panel flex h-full min-h-0 flex-col rounded-2xl" aria-label="Live radio transcription">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-surface-line/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-go" />
          <h2 className="text-sm font-bold text-ink">Radio Transcription</h2>
          <span className={cn('flex items-center gap-1.5 text-xs font-semibold', STATUS_META[status].text)}>
            <span className={cn('h-2 w-2 rounded-full', STATUS_META[status].dot)} />
            {STATUS_META[status].label}
          </span>
        </div>

        {/* Mic level meter */}
        <div className="flex items-center gap-2" aria-hidden>
          {listening ? <Mic size={14} className="text-live" /> : <MicOff size={14} className="text-ink-faint" />}
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-high">
            <div
              className="h-full rounded-full bg-live transition-[width] duration-100"
              style={{ width: `${Math.round((isCaptureClient ? Math.min(1, (diagnostics?.rms ?? 0) * 4) : 0) * 100)}%` }}
            />
          </div>
        </div>

        {(!listening || isCaptureClient) && <label className="flex min-w-36 max-w-56 items-center gap-1.5 text-xs font-semibold text-ink-faint">
          <span className="sr-only">Microphone input</span>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            disabled={listening}
            className="h-9 min-w-0 flex-1 rounded-lg border border-surface-line bg-surface px-2 text-xs font-semibold text-ink-dim focus:outline-none focus:ring-2 focus:ring-go/70 disabled:opacity-60"
            aria-label="Microphone input"
          >
            <option value="">Default microphone</option>
            {audioInputs.map((input) => (
              <option key={input.deviceId} value={input.deviceId}>
                {input.label}
              </option>
            ))}
          </select>
        </label>}

        {(!listening || isCaptureClient) && <select
          value={profile}
          onChange={(event) => setProfile(event.target.value as AudioInputProfile)}
          disabled={listening}
          className="h-11 rounded-lg border border-surface-line bg-surface px-2 text-xs font-semibold text-ink-dim disabled:opacity-60"
          aria-label="Audio input profile"
        >
          <option value="radio_line">Radio line input</option>
          <option value="radio_speaker">Radio speaker</option>
          <option value="room_microphone">Room microphone</option>
        </select>}

        <div className="ml-auto flex items-center gap-1.5">
          <IconButton
            label={collapsed ? 'Expand AI dispatch recording panel' : 'Minimize AI dispatch recording panel'}
            onClick={() => onCollapsedChange?.(!collapsed)}
          >
            {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </IconButton>
          <Button
            variant={listening ? 'live' : 'solid'}
            size="sm"
            onClick={toggle}
            className="min-w-[7.5rem]"
          >
            {listening ? <MicOff size={15} /> : <Mic size={15} />}
            {listening ? 'Stop' : 'Start Listening'}
          </Button>
          {listening && !isCaptureClient && (
            <Button size="sm" onClick={() => transcribeClient.requestTakeover('Command device')}>
              Request Takeover
            </Button>
          )}
          <IconButton label="Transcription diagnostics" onClick={() => void loadDiagnostics()}>
            <Settings size={16} />
          </IconButton>
          <IconButton label="Export transcript as CSV" onClick={() => exportTranscriptCsv(incident, entries)} disabled={!entries.length}>
            <Sheet size={16} />
          </IconButton>
          <IconButton label="Export incident as JSON" onClick={() => exportIncidentJson(incident, entries)}>
            <FileJson size={16} />
          </IconButton>
          <IconButton label={incident.mode === 'special_event' ? 'Download event summary PDF' : 'Print / save as PDF'} onClick={() => incident.mode === 'special_event' ? void downloadEventSummaryPdf(incident) : printIncident()}>
            <Printer size={16} />
          </IconButton>
          <IconButton label="Clear transcript" variant="danger" onClick={() => setConfirmClear(true)} disabled={!entries.length}>
            <Eraser size={16} />
          </IconButton>
        </div>
      </header>

      {!collapsed && sharedState?.enabled && (
        <div className="border-b border-go/25 bg-go/5 px-3 py-2 text-xs text-ink-dim">
          <strong className="text-go">Listening from {sharedState.captureLabel || 'capture device'}</strong>
          {sharedState.startedAt && <> · Started {new Date(sharedState.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}
          <span className="ml-2">All connected incident viewers are receiving this transcript.</span>
        </div>
      )}

      {!collapsed && showDiagnostics && (
        <div className="border-b border-surface-line bg-surface-high/40 px-3 py-2 text-xs text-ink-dim">
          <div className="flex flex-wrap items-center gap-2">
            <span>Service: {health && health.ok !== false ? 'reachable' : 'checking / unavailable'}</span>
            <span>RMS: {diagnostics ? `${Math.round(diagnostics.rms * 1000) / 10}%` : '—'}</span>
            <span>Peak: {diagnostics ? `${Math.round(diagnostics.peak * 100)}%` : '—'}</span>
            <span>Clipping: {diagnostics ? `${Math.round(diagnostics.clippingRatio * 10000) / 100}%` : '—'}</span>
            {isCaptureClient && <Button size="sm" onClick={calibrate}>5-second calibration</Button>}
          </div>
          {calibration && <p className="mt-1 text-ink-faint">{calibration}</p>}
        </div>
      )}

      {!collapsed && error && (
        <p className="border-b border-warn/30 bg-warn/10 px-3 py-1.5 text-xs font-medium text-warn">
          {error}
        </p>
      )}

      {!collapsed && (
        <ol
          ref={logRef}
          onScroll={onScroll}
          className="scroll-thin min-h-0 flex-1 divide-y divide-surface-line/40 overflow-y-auto px-1.5 py-1"
        >
        {entries.length === 0 && !partial && (
          <li className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-ink-faint">
            <span className="flex items-center gap-2">
              <Download size={15} className="rotate-180" />
              Press <strong className="text-ink-dim">Start Listening</strong>, allow the mic, and
              radio traffic will appear here.
            </span>
          </li>
        )}
        {entries.map((e) => (
          <TranscriptLine key={e.id} entry={e} />
        ))}
        {partial && (
          <li className="flex gap-2 py-1.5 pl-2 pr-1 text-sm italic text-ink-dim">
            <span className="mt-0.5 shrink-0 text-[11px] text-ink-faint">···</span>
            <span className="min-w-0 flex-1">{partial}</span>
          </li>
        )}
        </ol>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear the transcript?"
        message="This removes all transcribed radio lines from this view. Export first if you need a record."
        destructive
        confirmLabel="Clear transcript"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          void transcribeClient.clear(incident.id)
            .catch((clearError) => transcript.setError(incident.id, clearError instanceof Error ? clearError.message : 'Clear failed'))
            .finally(() => setConfirmClear(false))
        }}
      />
    </section>
  )
}
