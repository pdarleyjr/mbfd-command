import { useEffect, useState } from 'react'
import type { RunCategory, RunSubtype } from '@/types'
import { specialEventApi } from '@/lib/specialEventApi'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

const field = 'h-11 w-full rounded-lg border border-surface-line bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-go/70'

export function ManualRunDialog({ open, incidentId, unitId, onClose, onSaved }: {
  open: boolean; incidentId: string; unitId?: string | null; onClose: () => void; onSaved: () => void
}) {
  const [type, setType] = useState('')
  const [category, setCategory] = useState<RunCategory>('medical')
  const [subtype, setSubtype] = useState<RunSubtype>('medical')
  const [address, setAddress] = useState('')
  const [receivedAt, setReceivedAt] = useState('')
  const [incidentNumber, setIncidentNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [noUnit, setNoUnit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (open) setReceivedAt(new Date().toISOString().slice(0, 16)) }, [open])

  async function save() {
    if (!type.trim()) { setError('Call type is required.'); return }
    setSaving(true); setError('')
    try {
      await specialEventApi.createRun(incidentId, {
        callTypeLabel: type.trim(), category, subtype, address: address.trim(),
        receivedAt: new Date(receivedAt).toISOString(), incidentNumber: incidentNumber.trim(), notes: notes.trim(),
        unitIds: unitId && !noUnit ? [unitId] : [], noUnitAssigned: noUnit || !unitId,
      })
      onSaved(); onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create run') }
    finally { setSaving(false) }
  }

  return <Modal open={open} title="Create manual run" onClose={onClose} className="max-w-xl" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="solid" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Create run'}</Button></>}>
    <div className="max-h-[65dvh] space-y-3 overflow-y-auto pr-1">
      {unitId && <p className="rounded-lg border border-go/30 bg-go/10 p-3 text-sm text-go"><strong>{unitId}</strong> will be assigned when this run is created.</p>}
      <label className="block text-xs font-bold uppercase text-ink-faint">Call type<input className={`${field} mt-1`} value={type} onChange={(event) => setType(event.target.value)} autoFocus /></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold uppercase text-ink-faint">Category<select className={`${field} mt-1`} value={category} onChange={(event) => { const value = event.target.value as RunCategory; setCategory(value); setSubtype(value) }}><option value="medical">Medical</option><option value="fire">Fire</option><option value="other">Other</option></select></label><label className="text-xs font-bold uppercase text-ink-faint">Subtype<select className={`${field} mt-1`} value={subtype} onChange={(event) => setSubtype(event.target.value as RunSubtype)}><option value="medical">Medical</option><option value="fire">Fire</option><option value="rescue">Rescue</option><option value="vehicle">Vehicle</option><option value="hazmat">Hazmat</option><option value="alarm">Alarm</option><option value="service">Service</option><option value="marine">Marine</option><option value="other">Other</option></select></label></div>
      <label className="block text-xs font-bold uppercase text-ink-faint">Address / location<input className={`${field} mt-1`} value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold uppercase text-ink-faint">Received<input type="datetime-local" className={`${field} mt-1`} value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} /></label><label className="text-xs font-bold uppercase text-ink-faint">Incident #<input className={`${field} mt-1`} value={incidentNumber} onChange={(event) => setIncidentNumber(event.target.value)} /></label></div>
      <label className="block text-xs font-bold uppercase text-ink-faint">Notes<textarea className="mt-1 min-h-24 w-full rounded-lg border border-surface-line bg-surface p-3 text-sm text-ink" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      {!unitId && <label className="flex min-h-11 items-center gap-3 text-sm text-ink"><input className="h-5 w-5" type="checkbox" checked={noUnit} onChange={(event) => setNoUnit(event.target.checked)} /> No unit assigned yet</label>}
      {error && <p className="rounded-lg bg-live/10 p-3 text-sm text-live">{error}</p>}
    </div>
  </Modal>
}
