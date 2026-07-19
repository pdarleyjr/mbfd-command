import { useEffect, useState } from 'react'
import { ClipboardList, LayoutGrid, ListChecks, Map, Radio } from 'lucide-react'
import { cn } from '@/lib/cn'
import { incidentSyncClient } from '@/lib/incidentSyncClient'
import { useBoard } from '@/store/boardStore'
import { AppHeader } from '@/components/shell/AppHeader'
import { CommandBoard } from '@/components/board/CommandBoard'
import { PulsePointDrawer, readPulsePointCollapsed, type PulsePointAction } from '@/components/incidents/PulsePointDrawer'
import { NewIncidentWizard } from '@/components/incidents/NewIncidentWizard'
import { IncidentMap } from '@/components/map/IncidentMap'
import { TranscriptPanel } from '@/components/transcript/TranscriptPanel'
import { ChecklistPanel } from '@/components/board/ChecklistPanel'
import { SpecialEventBoard } from '@/components/events/SpecialEventBoard'
import { RunsPanel } from '@/components/events/RunsPanel'
import type { PulsePointIncident } from '@/lib/pulsepoint'

type AppTab = 'board' | 'map' | 'runs' | 'audio'

export default function App() {
  const incident = useBoard((state) => state.getActive())
  const renameIncident = useBoard((state) => state.renameIncident)
  const setAddress = useBoard((state) => state.setAddress)
  const setMarker = useBoard((state) => state.setMarker)
  const syncPulsePointUnits = useBoard((state) => state.syncPulsePointUnits)
  const [activeTab, setActiveTab] = useState<AppTab>('board')
  const [showNewIncident, setShowNewIncident] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const [pulsePointCollapsed, setPulsePointCollapsed] = useState(readPulsePointCollapsed)
  const checklist = incident?.checklist ?? []
  const uncompletedChecklistCount = checklist.filter((item) => !item.completed).length

  useEffect(() => {
    if (!incident?.id) { incidentSyncClient.stop(); return }
    incidentSyncClient.start(incident.id)
    return () => incidentSyncClient.stop()
  }, [incident?.id])

  useEffect(() => {
    if (incident?.mode !== 'special_event' && activeTab === 'runs') setActiveTab('board')
  }, [activeTab, incident?.mode])

  function usePulsePointIncident(run: PulsePointIncident) {
    if (!incident) return
    if (run.address) setAddress(run.address)
    if (typeof run.lat === 'number' && typeof run.lng === 'number') setMarker({ lat: run.lat, lng: run.lng })
    const name = [run.callType, run.address].filter(Boolean).join(' - ')
    if (name) renameIncident(incident.id, name)
    if (run.units?.length) syncPulsePointUnits(run.units)
  }

  function handlePulsePointAction(action: PulsePointAction) {
    if (action.kind === 'use_as_scene') usePulsePointIncident(action.incident)
    // Special-event assignment is handled by the server-backed dialog in the PulsePoint phase.
  }

  if (!incident) return <NewIncidentWizard open required onClose={() => setShowNewIncident(false)} />

  const tabs: Array<{ id: AppTab; label: string; icon: typeof LayoutGrid }> = [
    { id: 'board', label: 'Board', icon: LayoutGrid },
    { id: 'map', label: 'Map', icon: Map },
    ...(incident.mode === 'special_event' ? [{ id: 'runs' as const, label: 'Runs', icon: ListChecks }] : []),
    { id: 'audio', label: 'Audio', icon: Radio },
  ]

  return <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-2">
    <AppHeader incident={incident} onNewIncident={() => setShowNewIncident(true)} />
    <nav className="no-print flex shrink-0 items-center justify-between rounded-xl border-b border-surface-line bg-surface/45 px-1.5 py-1 backdrop-blur-sm">
      <div className="flex min-w-0 gap-1 sm:gap-2">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} aria-label={tab.label} onClick={() => setActiveTab(tab.id)} className={cn('touch flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold transition-all sm:px-5', activeTab === tab.id ? 'border-go/40 bg-go/15 text-go shadow-card' : 'border-transparent text-ink-dim hover:bg-surface-high/50 hover:text-ink')}><Icon size={16} /><span className="hidden min-[420px]:inline">{tab.label.toUpperCase()}</span></button> })}</div>
      {incident.mode === 'scene' && <button aria-label="Checklist" onClick={() => setShowChecklist(!showChecklist)} className={cn('touch flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition-all sm:px-5', showChecklist ? 'border-go/40 bg-go/15 text-go shadow-card' : 'border-surface-line bg-surface-high/40 text-ink-dim')}><ClipboardList size={16} /><span className="hidden sm:inline">Checklist</span>{uncompletedChecklistCount > 0 && <span className="tabnum rounded-full bg-live px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{uncompletedChecklistCount}</span>}</button>}
    </nav>
    <main className="relative min-h-0 flex-1">
      {activeTab === 'board' && (incident.mode === 'scene'
        ? <CommandBoard board={incident.board} right={<PulsePointDrawer incidentId={incident.id} mode="scene" collapsed={pulsePointCollapsed} onCollapsedChange={setPulsePointCollapsed} onAction={handlePulsePointAction} />} />
        : <div className="flex h-full min-h-0 gap-2 overflow-hidden"><div className="min-w-0 flex-1"><SpecialEventBoard incident={incident} /></div><PulsePointDrawer incidentId={incident.id} mode="special_event" collapsed={pulsePointCollapsed} onCollapsedChange={setPulsePointCollapsed} onAction={handlePulsePointAction} /></div>)}
      {activeTab === 'map' && <div className="h-full w-full"><IncidentMap incident={incident} fullPage /></div>}
      {activeTab === 'runs' && incident.mode === 'special_event' && <RunsPanel incident={incident} />}
      {activeTab === 'audio' && <div className="h-full w-full"><TranscriptPanel incident={incident} collapsed={false} /></div>}
      {showChecklist && incident.mode === 'scene' && <ChecklistPanel onClose={() => setShowChecklist(false)} />}
    </main>
    <NewIncidentWizard open={showNewIncident} required={false} onClose={() => setShowNewIncident(false)} />
  </div>
}
