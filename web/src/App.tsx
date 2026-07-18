import { useEffect, useState } from 'react'
import { LayoutGrid, Map, Radio, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/cn'
import { incidentSyncClient } from '@/lib/incidentSyncClient'
import { useBoard } from '@/store/boardStore'
import { AppHeader } from '@/components/shell/AppHeader'
import { CommandBoard } from '@/components/board/CommandBoard'
import {
  PulsePointDrawer,
  readPulsePointCollapsed,
  type PulsePointAction,
} from '@/components/incidents/PulsePointDrawer'
import { IncidentMap } from '@/components/map/IncidentMap'
import { TranscriptPanel } from '@/components/transcript/TranscriptPanel'
import { ChecklistPanel } from '@/components/board/ChecklistPanel'
import type { PulsePointIncident } from '@/lib/pulsepoint'

export default function App() {
  const incident = useBoard((s) => s.getActive())
  const createIncident = useBoard((s) => s.createIncident)
  const renameIncident = useBoard((s) => s.renameIncident)
  const setAddress = useBoard((s) => s.setAddress)
  const setMarker = useBoard((s) => s.setMarker)
  const syncPulsePointUnits = useBoard((s) => s.syncPulsePointUnits)

  const [activeTab, setActiveTab] = useState<'board' | 'map' | 'audio'>('board')
  const [showChecklist, setShowChecklist] = useState(false)
  const [pulsePointCollapsed, setPulsePointCollapsed] = useState(readPulsePointCollapsed)
  const checklist = incident?.checklist ?? []
  const uncompletedChecklistCount = checklist.filter((item) => !item.completed).length
  useEffect(() => {
    if (!incident?.id) {
      incidentSyncClient.stop()
      return
    }
    incidentSyncClient.start(incident.id)
    return () => incidentSyncClient.stop()
  }, [incident?.id])

  function usePulsePointIncident(run: PulsePointIncident) {
    if (!incident) return
    if (run.address) setAddress(run.address)
    if (typeof run.lat === 'number' && typeof run.lng === 'number') {
      setMarker({ lat: run.lat, lng: run.lng })
    }
    const name = [run.callType, run.address].filter(Boolean).join(' - ')
    if (name) renameIncident(incident.id, name)

    // Automatically sync units into the "Dispatch" column
    if (run.units && run.units.length > 0) {
      syncPulsePointUnits(run.units)
    }
  }

  function handlePulsePointAction(action: PulsePointAction) {
    if (action.kind === 'use_as_scene') usePulsePointIncident(action.incident)
    // The special-event assignment dialog is introduced with the domain model in Phase 4/5.
  }

  if (!incident) {
    return (
      <div className="flex h-full items-center justify-center">
        <button
          onClick={() => createIncident()}
          className="rounded-xl border border-go/40 bg-go/15 px-5 py-3 font-semibold text-go"
        >
          Start an incident
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-2">
      <AppHeader incident={incident} />

      {/* Modern High-Contrast Tab Bar */}
      <nav className="no-print flex shrink-0 items-center justify-between border-b border-surface-line px-1.5 py-1 bg-surface/45 rounded-xl backdrop-blur-sm">
        <div className="flex min-w-0 gap-1 sm:gap-2">
          <button
            aria-label="Board"
            onClick={() => setActiveTab('board')}
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 font-bold text-sm rounded-lg transition-all touch sm:px-5",
              activeTab === 'board'
                ? "bg-go/15 text-go border border-go/40 shadow-card"
                : "text-ink-dim hover:text-ink hover:bg-surface-high/50 border border-transparent"
            )}
          >
            <LayoutGrid size={16} />
            <span className="hidden min-[420px]:inline">BOARD</span>
          </button>
          <button
            aria-label="Map"
            onClick={() => setActiveTab('map')}
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 font-bold text-sm rounded-lg transition-all touch sm:px-5",
              activeTab === 'map'
                ? "bg-go/15 text-go border border-go/40 shadow-card"
                : "text-ink-dim hover:text-ink hover:bg-surface-high/50 border border-transparent"
            )}
          >
            <Map size={16} />
            <span className="hidden min-[420px]:inline">MAP</span>
          </button>
          <button
            aria-label="Audio"
            onClick={() => setActiveTab('audio')}
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 font-bold text-sm rounded-lg transition-all touch sm:px-5",
              activeTab === 'audio'
                ? "bg-go/15 text-go border border-go/40 shadow-card"
                : "text-ink-dim hover:text-ink hover:bg-surface-high/50 border border-transparent"
            )}
          >
            <Radio size={16} />
            <span className="hidden min-[420px]:inline">AUDIO</span>
          </button>
        </div>

        {/* Checklist Toggle Button on the Right */}
        <div className="flex items-center gap-2 pr-1.5">
          <button
            aria-label="Checklist"
            onClick={() => setShowChecklist(!showChecklist)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 font-bold text-sm rounded-lg transition-all border touch sm:px-5",
              showChecklist
                ? "bg-go/15 text-go border-go/40 shadow-card"
                : "bg-surface-high/40 text-ink-dim hover:text-ink hover:bg-surface-high/70 border-surface-line"
            )}
          >
            <ClipboardList size={16} />
            <span className="hidden sm:inline">Checklist</span>
            {uncompletedChecklistCount > 0 && (
              <span className="tabnum rounded-full bg-live px-1.5 py-0.5 text-[10px] font-bold text-white ml-1 leading-none">
                {uncompletedChecklistCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="min-h-0 flex-1 relative">
        {activeTab === 'board' && (
          <CommandBoard
            board={incident.board}
            right={
              <PulsePointDrawer
                incidentId={incident.id}
                mode="scene"
                collapsed={pulsePointCollapsed}
                onCollapsedChange={setPulsePointCollapsed}
                onAction={handlePulsePointAction}
              />
            }
          />
        )}

        {activeTab === 'map' && (
          <div className="h-full w-full">
            <IncidentMap incident={incident} fullPage />
          </div>
        )}

        {activeTab === 'audio' && (
          <div className="h-full w-full">
            <TranscriptPanel incident={incident} collapsed={false} />
          </div>
        )}

        {/* Sliding Checklist Panel overlay */}
        {showChecklist && (
          <ChecklistPanel onClose={() => setShowChecklist(false)} />
        )}
      </main>
    </div>
  )
}
