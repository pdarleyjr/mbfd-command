import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Activity, CirclePlus, GripVertical, MapPin, Plus, Truck } from 'lucide-react'
import type { EventRun, Incident, IncidentUnitState, MedicalDisposition, StagingLocation } from '@/types'
import { cn } from '@/lib/cn'
import { specialEventApi } from '@/lib/specialEventApi'
import { useSpecialEvents } from '@/store/specialEventStore'
import { Button, IconButton } from '@/components/ui/Button'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { ManualRunDialog } from './ManualRunDialog'

function UnitTile({ unit, location, onLocation }: { unit: IncidentUnitState; location?: StagingLocation; onLocation?: () => void }) {
  const drag = useDraggable({ id: `unit:${unit.unitId}`, disabled: unit.manualHold || Boolean(unit.currentRunId) })
  const style: CSSProperties = { transform: CSS.Translate.toString(drag.transform), opacity: drag.isDragging ? 0.35 : 1 }
  return <article ref={drag.setNodeRef} style={style} className="rounded-xl border border-surface-line bg-surface-raised p-2.5 shadow-card">
    <div className="flex items-center gap-2"><button ref={drag.setActivatorNodeRef} {...drag.listeners} {...drag.attributes} className="touch flex h-11 w-8 items-center justify-center text-ink-faint" aria-label={`Drag ${unit.unitId}`}><GripVertical size={17} /></button><strong className="text-base text-ink">{unit.unitId}</strong>{unit.manualHold && <span className="rounded bg-warn/15 px-1.5 text-[10px] font-bold text-warn">HOLD</span>}</div>
    {location && <button type="button" onClick={onLocation} className="mt-1 inline-flex min-h-8 max-w-full items-center gap-1 rounded-full bg-go/10 px-2 text-xs font-semibold text-go"><MapPin size={12} /><span className="truncate">{location.name}</span></button>}
  </article>
}

function RunCard({ run, onUnit, onSaved = () => undefined }: { run: EventRun; onUnit: (run: EventRun, unitId: string) => void; onSaved?: () => void }) {
  const drop = useDroppable({ id: `run:${run.id}` })
  return <article ref={drop.setNodeRef} className={cn('rounded-xl border bg-surface-raised p-3 shadow-card', drop.isOver ? 'border-go bg-go/10' : 'border-surface-line')}>
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><strong className="block truncate text-sm text-ink">{run.callTypeLabel}</strong><span className="mt-0.5 block truncate text-xs text-ink-faint">{run.address || 'No location entered'}</span></div><span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', run.category === 'medical' ? 'bg-go/15 text-go' : run.category === 'fire' ? 'bg-live/15 text-live' : 'bg-warn/15 text-warn')}>{run.category}</span></div>
    {run.status === 'clearing' && run.sourceExternalId && <div className="mt-2 rounded-lg border border-warn/35 bg-warn/10 p-2 text-xs text-warn"><strong>PulsePoint shows this call cleared.</strong><p className="mt-0.5 text-ink-dim">Eligible units will return to prior staging after the server grace period.</p><div className="mt-2 flex gap-2"><Button size="sm" onClick={() => void specialEventApi.clearPulsePointNow(run.incidentId, run.sourceExternalId!).then(onSaved)}>Clear now</Button><Button size="sm" onClick={() => void specialEventApi.keepPulsePointActive(run.incidentId, run.sourceExternalId!).then(onSaved)}>Keep active</Button></div></div>}
    <div className="mt-3 flex flex-wrap gap-2">{run.unitAssignments.filter((item) => !item.clearedAt).map((item) => <button type="button" key={item.unitId} onClick={() => onUnit(run, item.unitId)} className="touch min-h-11 rounded-lg border border-live/35 bg-live/10 px-3 text-sm font-bold text-live">{item.unitId}<span className="ml-1 text-[10px] font-medium uppercase opacity-70">{item.transportAt ? 'Transport' : item.onSceneAt ? 'On scene' : 'Responding'}</span></button>)}</div>
  </article>
}

export function SpecialEventBoard({ incident }: { incident: Incident }) {
  const state = useSpecialEvents((store) => store.byIncident[incident.id])
  const loading = useSpecialEvents((store) => store.loadingByIncident[incident.id])
  const error = useSpecialEvents((store) => store.errorByIncident[incident.id])
  const refresh = useSpecialEvents((store) => store.refresh)
  const [draggedUnit, setDraggedUnit] = useState<string | null>(null)
  const [assign, setAssign] = useState<{ unitId: string; run: EventRun } | null>(null)
  const [manualUnit, setManualUnit] = useState<string | null>(null)
  const [locationUnit, setLocationUnit] = useState<IncidentUnitState | null>(null)
  const [addLocation, setAddLocation] = useState(false)
  const [detail, setDetail] = useState<{ run: EventRun; unitId: string } | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }), useSensor(KeyboardSensor))
  useEffect(() => {
    void refresh(incident.id)
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ incidentId?: string }>).detail
      if (detail?.incidentId === incident.id) void refresh(incident.id)
    }
    window.addEventListener('mbfd-incident-event', listener)
    return () => window.removeEventListener('mbfd-incident-event', listener)
  }, [incident.id, refresh])
  const locationById = useMemo(() => new Map((state?.stagingLocations ?? []).map((item) => [item.id, item])), [state])
  const staged = state?.units.filter((unit) => unit.status === 'staged' && !unit.currentRunId) ?? []
  const bank = state?.units.filter((unit) => !unit.currentRunId && unit.status !== 'staged') ?? []
  const activeRuns = state?.runs.filter((run) => !['cleared', 'cancelled'].includes(run.status)) ?? []
  const activeDrop = useDroppable({ id: 'active-empty' })

  function onDragStart(event: DragStartEvent) { setDraggedUnit(String(event.active.id).replace('unit:', '')) }
  function onDragEnd(event: DragEndEvent) {
    const unitId = String(event.active.id).replace('unit:', '')
    const over = event.over ? String(event.over.id) : ''
    setDraggedUnit(null)
    if (over.startsWith('run:')) {
      const run = activeRuns.find((item) => item.id === over.slice(4)); if (run) setAssign({ unitId, run })
    } else if (over === 'active-empty') setManualUnit(unitId)
  }

  if (!state && loading) return <div className="flex h-full items-center justify-center text-sm text-ink-faint">Loading special-event board…</div>
  return <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
    <div className="grid h-full min-h-0 gap-2 overflow-x-auto pb-1 [grid-template-columns:minmax(180px,0.7fr)_minmax(260px,1fr)_minmax(340px,1.5fr)]">
      <section className="panel flex min-h-0 flex-col rounded-2xl"><header className="border-b border-surface-line px-3 py-2"><h2 className="font-bold text-ink">Unit Bank</h2><p className="text-xs text-ink-faint">Unassigned / unavailable</p></header><div className="scroll-thin min-h-0 space-y-2 overflow-y-auto p-2">{bank.length ? bank.map((unit) => <UnitTile key={unit.unitId} unit={unit} />) : <p className="p-4 text-center text-xs text-ink-faint">All detail units are staged or assigned.</p>}</div></section>
      <section className="panel flex min-h-0 flex-col rounded-2xl"><header className="flex items-center justify-between border-b border-surface-line px-3 py-2"><div><h2 className="font-bold text-ink">Staging</h2><p className="text-xs text-ink-faint">{staged.length} available units</p></div><IconButton label="Add staging location" onClick={() => setAddLocation(true)}><Plus size={17} /></IconButton></header><div className="scroll-thin grid min-h-0 auto-rows-min grid-cols-1 gap-2 overflow-y-auto p-2 sm:grid-cols-2">{staged.map((unit) => <UnitTile key={unit.unitId} unit={unit} location={locationById.get(unit.stagingLocationId ?? '')} onLocation={() => setLocationUnit(unit)} />)}</div></section>
      <section ref={activeDrop.setNodeRef} className={cn('panel flex min-h-0 flex-col rounded-2xl', activeDrop.isOver && 'ring-2 ring-go')}><header className="flex items-center justify-between border-b border-surface-line px-3 py-2"><div><h2 className="flex items-center gap-2 font-bold text-ink"><Activity size={17} className="text-live" /> Active Calls</h2><p className="text-xs text-ink-faint">Drop a staged unit here to create a manual run</p></div><Button size="sm" onClick={() => setManualUnit('')}><CirclePlus size={16} /> Add Run</Button></header><div className="scroll-thin min-h-0 space-y-2 overflow-y-auto p-2">{activeRuns.map((run) => <RunCard key={run.id} run={run} onUnit={(selectedRun, unitId) => setDetail({ run: selectedRun, unitId })} />)}{!activeRuns.length && <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-surface-line text-center text-sm text-ink-faint">No active calls.<br />Drag a unit here or tap Add Run.</div>}</div></section>
    </div>
    <DragOverlay>{draggedUnit && <div className="rounded-xl border border-go bg-surface-raised px-4 py-3 font-bold text-go shadow-lift">{draggedUnit}</div>}</DragOverlay>
    <ConfirmDialog open={Boolean(assign)} title="Assign unit to run?" message={assign ? <>Assign <strong>{assign.unitId}</strong> to {assign.run.callTypeLabel} — {assign.run.address || 'no address'}?</> : ''} confirmLabel="Assign unit" onCancel={() => setAssign(null)} onConfirm={() => { if (!assign) return; void specialEventApi.assignUnits(incident.id, assign.run.id, [assign.unitId]).then(() => refresh(incident.id)); setAssign(null) }} />
    <ManualRunDialog open={manualUnit !== null} incidentId={incident.id} unitId={manualUnit || null} onClose={() => setManualUnit(null)} onSaved={() => void refresh(incident.id)} />
    <StagingDialog open={Boolean(locationUnit)} unit={locationUnit} locations={state?.stagingLocations ?? []} onClose={() => setLocationUnit(null)} onAdd={() => { setLocationUnit(null); setAddLocation(true) }} onAssign={(locationId) => { if (!locationUnit) return; void specialEventApi.setUnitStaging(incident.id, locationUnit.unitId, locationId).then(() => refresh(incident.id)); setLocationUnit(null) }} />
    <AddStagingDialog open={addLocation} incidentId={incident.id} onClose={() => setAddLocation(false)} onSaved={() => void refresh(incident.id)} />
    <RunUnitDialog open={Boolean(detail)} incidentId={incident.id} detail={detail} locations={state?.stagingLocations ?? []} onClose={() => setDetail(null)} onSaved={() => { setDetail(null); void refresh(incident.id) }} />
    {error && <div className="fixed bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-live px-4 py-2 text-sm text-white">{error}</div>}
  </DndContext>
}

function StagingDialog({ open, unit, locations, onClose, onAdd, onAssign }: { open: boolean; unit: IncidentUnitState | null; locations: StagingLocation[]; onClose: () => void; onAdd: () => void; onAssign: (id: string) => void }) {
  return <Modal open={open} title={`Assign staging location · ${unit?.unitId ?? ''}`} onClose={onClose}><div className="space-y-2">{locations.map((location) => <button type="button" key={location.id} onClick={() => onAssign(location.id)} className="touch flex min-h-11 w-full items-center gap-3 rounded-lg border border-surface-line px-3 text-left text-sm text-ink"><span className={cn('h-4 w-4 rounded-full border', unit?.stagingLocationId === location.id && 'border-go bg-go')} />{location.name}</button>)}<Button className="w-full" onClick={onAdd}><Plus size={16} /> Add staging location</Button></div></Modal>
}

function AddStagingDialog({ open, incidentId, onClose, onSaved }: { open: boolean; incidentId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [notes, setNotes] = useState('')
  const [isDefault, setDefault] = useState(false)
  const field = 'h-11 w-full rounded-lg border border-surface-line bg-surface px-3 text-ink'
  const save = () => specialEventApi.addStaging(incidentId, {
    name: name.trim(), address: address.trim(),
    lat: lat ? Number(lat) : null, lng: lng ? Number(lng) : null,
    notes: notes.trim(), isDefault,
  }).then(() => { onSaved(); onClose() })
  return <Modal open={open} title="Add staging location" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="solid" disabled={!name.trim()} onClick={() => void save()}>Add location</Button></>}>
    <div className="space-y-3">
      <input className={field} placeholder="Location name" value={name} onChange={(event) => setName(event.target.value)} />
      <input className={field} placeholder="Address" value={address} onChange={(event) => setAddress(event.target.value)} />
      <div className="grid grid-cols-2 gap-2"><input inputMode="decimal" className={field} placeholder="Map pin latitude" value={lat} onChange={(event) => setLat(event.target.value)} /><input inputMode="decimal" className={field} placeholder="Map pin longitude" value={lng} onChange={(event) => setLng(event.target.value)} /></div>
      <textarea className="min-h-24 w-full rounded-lg border border-surface-line bg-surface p-3 text-ink" placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      <label className="flex min-h-11 items-center gap-3 text-sm text-ink"><input type="checkbox" className="h-5 w-5" checked={isDefault} onChange={(event) => setDefault(event.target.checked)} /> Default staging location</label>
    </div>
  </Modal>
}

function RunUnitDialog({ open, incidentId, detail, locations, onClose, onSaved }: { open: boolean; incidentId: string; detail: { run: EventRun; unitId: string } | null; locations: StagingLocation[]; onClose: () => void; onSaved: () => void }) {
  const assignment = detail?.run.unitAssignments.find((item) => item.unitId === detail.unitId)
  const [disposition, setDisposition] = useState<MedicalDisposition | ''>(''); const [destination, setDestination] = useState(''); const [patients, setPatients] = useState(''); const [notes, setNotes] = useState(''); const [returnLocation, setReturnLocation] = useState('')
  useEffect(() => { if (assignment) { setDisposition(assignment.disposition ?? ''); setDestination(assignment.transportDestination); setPatients(assignment.patientCount?.toString() ?? ''); setNotes(assignment.notes) } }, [assignment])
  if (!detail || !assignment) return null
  const patch = (value: Record<string, unknown>) => {
    if (value.status === 'responding' && Object.keys(value).length === 1) {
      void specialEventApi.setUnitHold(incidentId, detail.unitId, true).then(onSaved)
      return
    }
    void specialEventApi.patchUnit(incidentId, detail.run.id, detail.unitId, value).then(onSaved)
  }
  return <Modal open={open} title={`${detail.unitId} · ${detail.run.callTypeLabel}`} onClose={onClose} className="max-w-xl" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => void specialEventApi.clearUnit(incidentId, detail.run.id, detail.unitId, { returnStagingLocationId: returnLocation || undefined, disposition: disposition || undefined, transportDestination: destination, patientCount: patients ? Number(patients) : undefined, notes }).then(onSaved)}>Clear Unit</Button></>}><div className="max-h-[65dvh] space-y-3 overflow-y-auto"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Button onClick={() => patch({ status: 'responding', enrouteAt: new Date().toISOString() })}>En Route</Button><Button onClick={() => patch({ status: 'on_scene', onSceneAt: new Date().toISOString() })}>On Scene</Button><Button onClick={() => { setDisposition('transport'); patch({ status: 'transporting', transportAt: new Date().toISOString(), disposition: 'transport' }) }}><Truck size={15} /> Transport</Button><Button onClick={() => patch({ status: 'responding' })}>Keep Active</Button></div>{detail.run.category === 'medical' && <fieldset className="rounded-xl border border-surface-line p-3"><legend className="px-1 text-xs font-bold uppercase text-ink-faint">Medical disposition</legend><div className="grid grid-cols-2 gap-2">{(['transport', 'refusal', 'no_patient', 'assist_only'] as MedicalDisposition[]).map((value) => <label key={value} className="flex min-h-11 items-center gap-2 text-sm text-ink"><input type="radio" className="h-5 w-5" checked={disposition === value} onChange={() => setDisposition(value)} />{value.replace('_', ' ')}</label>)}</div></fieldset>}<input className="h-11 w-full rounded-lg border border-surface-line bg-surface px-3 text-ink" placeholder="Transport destination" value={destination} onChange={(event) => setDestination(event.target.value)} /><input type="number" min="0" className="h-11 w-full rounded-lg border border-surface-line bg-surface px-3 text-ink" placeholder="Patient count (optional)" value={patients} onChange={(event) => setPatients(event.target.value)} /><textarea className="min-h-24 w-full rounded-lg border border-surface-line bg-surface p-3 text-ink" placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} /><label className="block text-xs font-bold uppercase text-ink-faint">Return to staging<select className="mt-1 h-11 w-full rounded-lg border border-surface-line bg-surface px-3 text-ink" value={returnLocation} onChange={(event) => setReturnLocation(event.target.value)}><option value="">Previous staging location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div></Modal>
}
