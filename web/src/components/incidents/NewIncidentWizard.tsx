import { useState } from 'react'
import { CalendarClock, Flame, ShieldCheck } from 'lucide-react'
import { apiBase } from '@/lib/config'
import type { Incident, IncidentMode } from '@/types'
import { useBoard } from '@/store/boardStore'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

const input = 'h-11 w-full rounded-lg border border-surface-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-go/70'

export function NewIncidentWizard({ open, required, onClose }: { open: boolean; required: boolean; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [mode, setMode] = useState<IncidentMode>('scene')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [commandLabel, setCommandLabel] = useState('MBFD Command Post')
  const [commandAddress, setCommandAddress] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [scheduledStartAt, setScheduledStartAt] = useState('')
  const [scheduledEndAt, setScheduledEndAt] = useState('')
  const [startImmediately, setStartImmediately] = useState(true)
  const [stagingName, setStagingName] = useState('Primary Staging')
  const [stagingAddress, setStagingAddress] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!name.trim()) { setError(mode === 'scene' ? 'Incident name is required.' : 'Event name is required.'); return }
    setSaving(true); setError('')
    const coordinates = lat && lng ? { lat: Number(lat), lng: Number(lng) } : { lat: null, lng: null }
    const payload = mode === 'scene'
      ? { mode, name: name.trim(), address: address.trim(), marker: lat && lng ? coordinates : null, startImmediately: true }
      : {
          mode, name: name.trim(), address: '',
          commandPost: { label: commandLabel.trim(), address: commandAddress.trim(), ...coordinates },
          scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt).toISOString() : null,
          scheduledEndAt: scheduledEndAt ? new Date(scheduledEndAt).toISOString() : null,
          startImmediately,
          initialStagingLocation: stagingName.trim()
            ? { label: stagingName.trim(), address: stagingAddress.trim(), ...coordinates }
            : null,
        }
    try {
      const response = await fetch(`${apiBase()}/api/incidents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { detail?: string }
        throw new Error(body.detail || `Creation failed (${response.status})`)
      }
      const incident = await response.json() as Incident
      useBoard.getState().applyRemoteIncident(incident)
      useBoard.getState().resumeIncident(incident.id)
      setStep(1); setName(''); onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create incident')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} title={step === 1 ? 'New command board' : mode === 'scene' ? 'Scene details' : 'Special-event details'} onClose={onClose} dismissible={!required} className="max-w-2xl" footer={
      step === 1 ? <Button variant="solid" onClick={() => setStep(2)}>Continue</Button> : <>
        <Button onClick={() => setStep(1)}>Back</Button>
        <Button variant="solid" disabled={saving} onClick={() => void submit()}>{saving ? 'Creating…' : 'Create command board'}</Button>
      </>
    }>
      {step === 1 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setMode('scene')} className={`min-h-44 rounded-2xl border p-5 text-left ${mode === 'scene' ? 'border-live/70 bg-live/10' : 'border-surface-line bg-surface-high/40'}`}>
            <Flame className="mb-3 text-live" /><strong className="block text-lg text-ink">Scene Command</strong>
            <span className="mt-2 block text-sm leading-relaxed text-ink-dim">Fire, medical, rescue, hazmat, marine, or another single incident. Uses the tactical board and checklist.</span>
          </button>
          <button type="button" onClick={() => setMode('special_event')} className={`min-h-44 rounded-2xl border p-5 text-left ${mode === 'special_event' ? 'border-go/70 bg-go/10' : 'border-surface-line bg-surface-high/40'}`}>
            <ShieldCheck className="mb-3 text-go" /><strong className="block text-lg text-ink">Special Events Detail</strong>
            <span className="mt-2 block text-sm leading-relaxed text-ink-dim">Planned detail with staging, active calls, dispositions, unit availability, statistics, and event reports.</span>
          </button>
        </div>
      ) : (
        <div className="max-h-[65dvh] space-y-4 overflow-y-auto pr-1">
          <label className="block text-xs font-bold uppercase tracking-wide text-ink-faint">{mode === 'scene' ? 'Incident name' : 'Event name'}<input className={`${input} mt-1`} value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label>
          {mode === 'scene' ? <label className="block text-xs font-bold uppercase tracking-wide text-ink-faint">Incident address (optional)<input className={`${input} mt-1`} value={address} onChange={(event) => setAddress(event.target.value)} /></label> : <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold uppercase tracking-wide text-ink-faint">Command-post name<input className={`${input} mt-1`} value={commandLabel} onChange={(event) => setCommandLabel(event.target.value)} /></label>
              <label className="text-xs font-bold uppercase tracking-wide text-ink-faint">Command-post address<input className={`${input} mt-1`} value={commandAddress} onChange={(event) => setCommandAddress(event.target.value)} /></label>
              <label className="text-xs font-bold uppercase tracking-wide text-ink-faint"><CalendarClock size={14} className="inline" /> Scheduled start<input type="datetime-local" className={`${input} mt-1`} value={scheduledStartAt} onChange={(event) => setScheduledStartAt(event.target.value)} /></label>
              <label className="text-xs font-bold uppercase tracking-wide text-ink-faint">Scheduled end<input type="datetime-local" className={`${input} mt-1`} value={scheduledEndAt} onChange={(event) => setScheduledEndAt(event.target.value)} /></label>
            </div>
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-surface-line px-3 text-sm text-ink"><input type="checkbox" className="h-5 w-5" checked={startImmediately} onChange={(event) => setStartImmediately(event.target.checked)} /> Start event immediately</label>
            <div className="rounded-xl border border-surface-line bg-surface-high/30 p-3">
              <h3 className="mb-2 text-sm font-bold text-ink">Initial staging location (optional)</h3>
              <div className="grid gap-3 sm:grid-cols-2"><input className={input} aria-label="Staging name" value={stagingName} onChange={(event) => setStagingName(event.target.value)} /><input className={input} aria-label="Staging address" value={stagingAddress} onChange={(event) => setStagingAddress(event.target.value)} /></div>
            </div>
          </>}
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold uppercase tracking-wide text-ink-faint">Latitude (optional)<input inputMode="decimal" className={`${input} mt-1`} value={lat} onChange={(event) => setLat(event.target.value)} /></label><label className="text-xs font-bold uppercase tracking-wide text-ink-faint">Longitude (optional)<input inputMode="decimal" className={`${input} mt-1`} value={lng} onChange={(event) => setLng(event.target.value)} /></label></div>
          {error && <p className="rounded-lg border border-live/30 bg-live/10 p-3 text-sm text-live">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
