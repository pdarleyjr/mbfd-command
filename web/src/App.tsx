import { useEffect, useState } from 'react'
import { LayoutGrid, Map, Radio } from 'lucide-react'
import { cn } from '@/lib/cn'
import { incidentSyncClient } from '@/lib/incidentSyncClient'
import { useBoard } from '@/store/boardStore'
import { AppHeader } from '@/components/shell/AppHeader'
import { CommandBoard } from '@/components/board/CommandBoard'
import { PulsePointIncidentCard } from '@/components/incidents/PulsePointIncidentCard'
import { IncidentMap } from '@/components/map/IncidentMap'
import { TranscriptPanel } from '@/components/transcript/TranscriptPanel'
import type { PulsePointIncident } from '@/lib/pulsepoint'

export default function App() {
  const incident = useBoard((s) => s.getActive())
  const createIncident = useBoard((s) => s.createIncident)
  const renameIncident = useBoard((s) => s.renameIncident)
  const setAddress = useBoard((s) => s.setAddress)
  const setMarker = useBoard((s) => s.setMarker)
  const syncPulsePointUnits = useBoard((s) => s.syncPulsePointUnits)

  const [activeTab, setActiveTab] = useState<'board' | 'map' | 'audio'>('board')
  const hasIncident = Boolean(incident)

  useEffect(() => {
    if (!hasIncident) {
      incidentSyncClient.stop()
      return
    }
    incidentSyncClient.start()
    return () => incidentSyncClient.stop()
  }, [hasIncident])

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
      <nav className="no-print flex shrink-0 border-b border-surface-line px-1.5 py-1 gap-2 bg-surface/45 rounded-xl backdrop-blur-sm">
        <button
          onClick={() => setActiveTab('board')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 font-bold text-sm rounded-lg transition-all touch",
            activeTab === 'board'
              ? "bg-go/15 text-go border border-go/40 shadow-card"
              : "text-ink-dim hover:text-ink hover:bg-surface-high/50 border border-transparent"
          )}
        >
          <LayoutGrid size={16} />
          BOARD
        </button>
        <button
          onClick={() => setActiveTab('map')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 font-bold text-sm rounded-lg transition-all touch",
            activeTab === 'map'
              ? "bg-go/15 text-go border border-go/40 shadow-card"
              : "text-ink-dim hover:text-ink hover:bg-surface-high/50 border border-transparent"
          )}
        >
          <Map size={16} />
          MAP
        </button>
        <button
          onClick={() => setActiveTab('audio')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 font-bold text-sm rounded-lg transition-all touch",
            activeTab === 'audio'
              ? "bg-go/15 text-go border border-go/40 shadow-card"
              : "text-ink-dim hover:text-ink hover:bg-surface-high/50 border border-transparent"
          )}
        >
          <Radio size={16} />
          AUDIO
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="min-h-0 flex-1 relative">
        {activeTab === 'board' && (
          <CommandBoard
            board={incident.board}
            top={
              <div className="h-[35dvh] min-h-[260px] max-h-[360px] shrink-0">
                <PulsePointIncidentCard onUseIncident={usePulsePointIncident} />
              </div>
            }
            transcript={null}
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
      </main>
    </div>
  )
}