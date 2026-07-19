import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import type { SpecialEventState } from '@/types'
import type { PulsePointIncident } from '@/lib/pulsepoint'
import { incidentTime } from '@/lib/pulsepoint'
import { specialEventApi } from '@/lib/specialEventApi'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

function normalize(value: string): string {
  const token = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return ({ ENGINE1: 'E1', LADDER1: 'L1', RESCUE44: 'R44', FIREBOAT6: 'FB6', CAPTAIN5: 'Capt. 5' } as Record<string, string>)[token] ?? token
}

export function AssignUnitsDialog({ incidentId, pulsepoint, state, onClose, onSaved, onRefresh }: {
  incidentId: string; pulsepoint: PulsePointIncident | null; state?: SpecialEventState;
  onClose: () => void; onSaved: () => void; onRefresh: () => Promise<void>
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [addingExternal, setAddingExternal] = useState('')
  const staged = state?.units.filter((unit) => unit.status === 'staged' && unit.currentRunId === null && !unit.manualHold) ?? []
  const reported = useMemo(() => new Set((pulsepoint?.units ?? []).map((unit) => unit.normalizedId || normalize(unit.id))), [pulsepoint])
  const known = new Set(state?.units.map((unit) => unit.unitId) ?? [])
  const external = (pulsepoint?.units ?? []).filter((unit) => !known.has(unit.normalizedId || normalize(unit.id)))
  const locationById = new Map(state?.stagingLocations.map((location) => [location.id, location]) ?? [])
  const existingRun = state?.runs.find((run) => run.source === 'pulsepoint' && run.sourceExternalId === pulsepoint?.id)

  useEffect(() => {
    if (!pulsepoint) { setSelected([]); return }
    setSelected(staged.filter((unit) => reported.has(unit.unitId)).map((unit) => unit.unitId))
  }, [pulsepoint?.id, reported, state?.units])

  async function submit() {
    if (!pulsepoint || !selected.length) return
    setSaving(true); setError('')
    try { await specialEventApi.assignPulsePoint(incidentId, pulsepoint.id, selected); onSaved(); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Assignment failed') }
    finally { setSaving(false) }
  }

  async function addExternal(unitId: string) {
    setAddingExternal(unitId); setError('')
    try {
      await specialEventApi.addCustomUnit(incidentId, unitId, state?.stagingLocations.find((location) => location.isDefault)?.id)
      await onRefresh(); setSelected((items) => [...new Set([...items, unitId])])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add external unit') }
    finally { setAddingExternal('') }
  }

  return <Modal open={Boolean(pulsepoint)} title="Assign special-event units" onClose={onClose} className="max-w-2xl" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="solid" disabled={!selected.length || saving} onClick={() => void submit()}>{saving ? 'Assigning…' : `Assign ${selected.length || ''} Unit${selected.length === 1 ? '' : 's'}`}</Button></>}>
    {pulsepoint && <div className="max-h-[70dvh] space-y-4 overflow-y-auto pr-1">
      <section className="rounded-xl border border-surface-line bg-surface-high/35 p-3"><div className="flex items-start justify-between gap-2"><div><h3 className="font-bold text-ink">{pulsepoint.callType}</h3><p className="text-sm text-ink-dim">{pulsepoint.address || 'Address unavailable'}</p></div><span className="rounded bg-go/15 px-2 py-1 text-xs font-bold uppercase text-go">{pulsepoint.classification?.category ?? 'other'} / {pulsepoint.classification?.subtype ?? 'other'}</span></div><p className="mt-2 text-xs text-ink-faint">Received {incidentTime(pulsepoint.receivedAt)} · Classification source: {pulsepoint.classification?.source?.replace('_', ' ') ?? 'label fallback'}</p></section>
      {existingRun && <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">This call already has {existingRun.unitAssignments.filter((item) => !item.clearedAt).map((item) => item.unitId).join(', ') || 'no active units'} assigned.</p>}
      <section><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">Currently staged MBFD units</h3><div className="grid gap-2 sm:grid-cols-2">{staged.map((unit) => { const checked = selected.includes(unit.unitId); return <label key={unit.unitId} className="touch flex min-h-14 items-center gap-3 rounded-xl border border-surface-line bg-surface-high/30 p-3 text-sm text-ink"><input type="checkbox" className="h-5 w-5" checked={checked} onChange={() => setSelected((items) => checked ? items.filter((id) => id !== unit.unitId) : [...items, unit.unitId])} /><span><strong>{unit.unitId}</strong><span className="block text-xs text-ink-faint">{locationById.get(unit.stagingLocationId ?? '')?.name ?? 'No staging location'}{reported.has(unit.unitId) ? ' · Reported by PulsePoint' : ''}</span></span></label> })}</div>{!staged.length && <p className="text-sm text-ink-faint">No units are currently eligible. Units on calls, held, or unavailable cannot be selected.</p>}</section>
      <section><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">Units reported by PulsePoint</h3><div className="flex flex-wrap gap-2">{pulsepoint.units.map((unit) => <span key={unit.id} className="rounded-lg border border-surface-line px-2 py-1 text-xs text-ink-dim">{unit.id}{unit.status ? ` · ${unit.status}` : ''}</span>)}</div></section>
      {external.length > 0 && <section className="rounded-xl border border-warn/30 bg-warn/5 p-3"><h3 className="flex items-center gap-2 text-sm font-bold text-warn"><AlertTriangle size={16} /> External / unrecognized resources</h3><p className="my-2 text-xs text-ink-faint">These resources are attached to the source call but are not silently created as MBFD units.</p>{external.map((unit) => { const unitId = unit.normalizedId || normalize(unit.id); return <div key={unit.id} className="flex min-h-11 items-center justify-between gap-2 border-t border-warn/15 py-2 text-sm text-ink"><span>{unit.id} → {unitId}</span><Button size="sm" disabled={addingExternal === unitId} onClick={() => void addExternal(unitId)}><Plus size={14} /> Add to event roster</Button></div> })}</section>}
      {error && <p className="rounded-lg bg-live/10 p-3 text-sm text-live">{error}</p>}
    </div>}
  </Modal>
}
