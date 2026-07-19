import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, CirclePlus, Search, X } from 'lucide-react'
import type { EventRun, Incident } from '@/types'
import { elapsedMs } from '@/lib/format'
import { runActiveDurationMs } from '@/lib/eventTime'
import { specialEventApi } from '@/lib/specialEventApi'
import { useNow } from '@/lib/useNow'
import { useSpecialEvents } from '@/store/specialEventStore'
import { Button, IconButton } from '@/components/ui/Button'
import { ManualRunDialog } from './ManualRunDialog'

type Filter = 'active' | 'cleared' | 'all' | 'medical' | 'fire' | 'other' | 'pulsepoint' | 'manual'

export function RunsPanel({ incident }: { incident: Incident }) {
  const state = useSpecialEvents((store) => store.byIncident[incident.id])
  const refresh = useSpecialEvents((store) => store.refresh)
  const [filter, setFilter] = useState<Filter>('active')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<EventRun | null>(null)
  const [manual, setManual] = useState(false)
  const now = useNow()
  useEffect(() => { void refresh(incident.id) }, [incident.id, refresh])
  const runs = useMemo(() => (state?.runs ?? []).filter((run) => {
    if (filter === 'active' && ['cleared', 'cancelled'].includes(run.status)) return false
    if (filter === 'cleared' && run.status !== 'cleared') return false
    if (['medical', 'fire', 'other'].includes(filter) && run.category !== filter) return false
    if (['pulsepoint', 'manual'].includes(filter) && run.source !== filter) return false
    const query = search.trim().toLowerCase()
    return !query || [run.incidentNumber, run.callTypeLabel, run.address, ...run.unitAssignments.map((item) => item.unitId)].some((value) => value.toLowerCase().includes(query))
  }), [filter, search, state])
  return <section className="panel flex h-full min-h-0 flex-col rounded-2xl">
    <header className="flex flex-wrap items-center gap-2 border-b border-surface-line p-2.5"><div className="relative min-w-52 flex-1"><Search size={16} className="absolute left-3 top-3.5 text-ink-faint" /><input className="h-11 w-full rounded-lg border border-surface-line bg-surface pl-9 pr-3 text-sm text-ink" placeholder="Search unit, incident #, type, or address" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="scroll-thin flex max-w-full gap-1 overflow-x-auto">{(['active', 'cleared', 'all', 'medical', 'fire', 'other', 'pulsepoint', 'manual'] as Filter[]).map((value) => <button type="button" key={value} onClick={() => setFilter(value)} className={`touch min-h-11 whitespace-nowrap rounded-lg border px-3 text-xs font-bold uppercase ${filter === value ? 'border-go/50 bg-go/15 text-go' : 'border-surface-line text-ink-dim'}`}>{value}</button>)}</div><Button variant="solid" onClick={() => setManual(true)}><CirclePlus size={16} /> Add Run</Button></header>
    <div className="scroll-thin min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[1050px] border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-surface"><tr className="border-b border-surface-line text-ink-faint">{['Status', 'Received', 'Incident #', 'Type', 'Address', 'Units', 'Disposition', 'Active Time', 'Source', 'Last Updated', ''].map((label) => <th key={label} className="px-3 py-2 font-bold uppercase">{label}</th>)}</tr></thead><tbody>{runs.map((run) => <tr key={run.id} onClick={() => setSelected(run)} className="touch cursor-pointer border-b border-surface-line/50 text-ink-dim hover:bg-surface-high/50"><td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 font-bold uppercase ${run.status === 'active' ? 'bg-live/15 text-live' : 'bg-surface-high text-ink-faint'}`}>{run.status}</span></td><td className="tabnum px-3 py-2">{new Date(run.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td className="px-3 py-2">{run.incidentNumber || '—'}</td><td className="max-w-44 truncate px-3 py-2 font-semibold text-ink">{run.callTypeLabel}</td><td className="max-w-56 truncate px-3 py-2">{run.address || '—'}</td><td className="px-3 py-2">{run.unitAssignments.map((item) => item.unitId).join(', ') || 'Unassigned'}</td><td className="px-3 py-2">{run.unitAssignments.map((item) => item.disposition?.replace('_', ' ')).filter(Boolean).join(', ') || '—'}</td><td className="tabnum px-3 py-2">{elapsedMs(runActiveDurationMs(run, now))}</td><td className="px-3 py-2 font-bold uppercase">{run.source}</td><td className="px-3 py-2">{new Date(run.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td className="px-3 py-2"><ChevronRight size={16} /></td></tr>)}</tbody></table>{!runs.length && <p className="p-8 text-center text-sm text-ink-faint">No runs match these filters.</p>}</div>
    <RunDetail incidentId={incident.id} run={selected} onClose={() => setSelected(null)} onSaved={async () => { await refresh(incident.id); const next = useSpecialEvents.getState().byIncident[incident.id]?.runs.find((run) => run.id === selected?.id); setSelected(next ?? null) }} />
    <ManualRunDialog open={manual} incidentId={incident.id} onClose={() => setManual(false)} onSaved={() => void refresh(incident.id)} />
  </section>
}

function RunDetail({ incidentId, run, onClose, onSaved }: { incidentId: string; run: EventRun | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [notes, setNotes] = useState(''); const [saveStatus, setSaveStatus] = useState('Saved'); const [audit, setAudit] = useState<Array<{ action: string; serverAt: string; payload: Record<string, unknown> }>>([])
  useEffect(() => { setNotes(run?.notes ?? ''); setSaveStatus('Saved') }, [run])
  useEffect(() => {
    if (!run || notes === run.notes) return
    setSaveStatus('Unsaved changes')
    const timer = window.setTimeout(async () => {
      setSaveStatus('Saving…')
      try { await specialEventApi.patchRun(incidentId, run.id, { notes } as Partial<EventRun>); setSaveStatus('Saved by server'); await onSaved() }
      catch { setSaveStatus('Save failed — retrying when edited') }
    }, 700)
    return () => clearTimeout(timer)
  }, [incidentId, notes, onSaved, run])
  useEffect(() => {
    if (!run) return
    void fetch(`/api/incidents/${encodeURIComponent(incidentId)}/events`).then((response) => response.json()).then((body: { events?: typeof audit }) => setAudit((body.events ?? []).filter((event) => event.payload?.runId === run.id)))
  }, [incidentId, run])
  if (!run) return null
  return <aside className="fixed inset-y-0 right-0 z-40 w-[min(92vw,520px)] overflow-hidden border-l border-surface-line bg-surface-raised shadow-lift"><header className="flex items-start justify-between border-b border-surface-line p-4"><div><span className="text-xs font-bold uppercase text-go">Run detail</span><h2 className="text-lg font-bold text-ink">{run.callTypeLabel}</h2><p className="text-sm text-ink-faint">{run.address || 'No address'}</p></div><IconButton label="Close run detail" onClick={onClose}><X size={18} /></IconButton></header><div className="scroll-thin h-[calc(100%-88px)] space-y-4 overflow-y-auto p-4"><DetailSection title="Summary"><dl className="grid grid-cols-2 gap-2 text-sm"><dt className="text-ink-faint">Status</dt><dd className="text-ink">{run.status}</dd><dt className="text-ink-faint">Classification</dt><dd className="text-ink">{run.category} / {run.subtype}</dd><dt className="text-ink-faint">Source</dt><dd className="text-ink">{run.source}</dd><dt className="text-ink-faint">Incident #</dt><dd className="text-ink">{run.incidentNumber || '—'}</dd></dl></DetailSection><DetailSection title="Times"><p className="text-sm text-ink-dim">Received {new Date(run.receivedAt).toLocaleString()}<br />Activated {run.activatedAt ? new Date(run.activatedAt).toLocaleString() : '—'}<br />Cleared {run.clearedAt ? new Date(run.clearedAt).toLocaleString() : '—'}</p></DetailSection><DetailSection title="Units">{run.unitAssignments.map((item) => <div key={item.unitId} className="mb-2 rounded-lg bg-surface-high/60 p-2 text-sm text-ink-dim"><strong className="text-ink">{item.unitId}</strong> · {item.disposition?.replace('_', ' ') || 'No disposition'}<br /><span className="text-xs text-ink-faint">Assigned {new Date(item.assignedAt).toLocaleString()} · Cleared {item.clearedAt ? new Date(item.clearedAt).toLocaleString() : 'Active'}{item.transportDestination ? ` · ${item.transportDestination}` : ''}</span></div>)}</DetailSection><DetailSection title="Additional information"><textarea className="min-h-36 w-full rounded-lg border border-surface-line bg-surface p-3 text-sm text-ink" value={notes} onChange={(event) => setNotes(event.target.value)} /><p className={`mt-1 text-xs ${saveStatus.includes('failed') ? 'text-live' : 'text-ink-faint'}`}>{saveStatus}</p></DetailSection>{run.source === 'pulsepoint' && <DetailSection title="PulsePoint source"><p className="text-sm text-ink-dim">Identifier: {run.sourceExternalId}<br />Original code: {run.callTypeCode || '—'}</p><details className="mt-2"><summary className="touch cursor-pointer text-xs font-bold text-go">Normalized technical payload</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-ground p-2 text-[10px] text-ink-faint">{JSON.stringify(run.sourcePayload, null, 2)}</pre></details></DetailSection>}<DetailSection title="Audit">{audit.length ? audit.map((event, index) => <p key={`${event.action}-${index}`} className="border-b border-surface-line/40 py-1.5 text-xs text-ink-dim">{new Date(event.serverAt).toLocaleString()} · {event.action.replaceAll('.', ' ')}</p>) : <p className="text-xs text-ink-faint">No run-specific audit entries loaded.</p>}</DetailSection></div></aside>
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-surface-line bg-surface-high/25 p-3"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{title}</h3>{children}</section> }
