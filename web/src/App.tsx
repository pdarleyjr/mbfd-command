import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Map as MapIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { incidentSyncClient } from '@/lib/incidentSyncClient'
import { useBoard } from '@/store/boardStore'
import { AppHeader } from '@/components/shell/AppHeader'
import { CommandBoard } from '@/components/board/CommandBoard'
import { PulsePointIncidentCard } from '@/components/incidents/PulsePointIncidentCard'
import { IncidentMap } from '@/components/map/IncidentMap'
import { TranscriptPanel } from '@/components/transcript/TranscriptPanel'
import { IconButton } from '@/components/ui/Button'
import type { PulsePointIncident } from '@/lib/pulsepoint'

export default function App() {
  const incident = useBoard((s) => s.getActive())
  const createIncident = useBoard((s) => s.createIncident)
  const renameIncident = useBoard((s) => s.renameIncident)
  const setAddress = useBoard((s) => s.setAddress)
  const setMarker = useBoard((s) => s.setMarker)
  const [mapOpen, setMapOpen] = useState(true)
  const [transcriptOpen, setTranscriptOpen] = useState(true)
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

      <main className="min-h-0 flex-1">
        <CommandBoard
          board={incident.board}
          top={
            <div
              className={cn(
                'relative shrink-0 transition-[height] duration-200',
                mapOpen ? 'h-[32dvh] min-h-[230px]' : 'h-11',
              )}
            >
              {mapOpen ? (
                <div className="grid h-full min-h-0 grid-cols-[minmax(12rem,1fr)_minmax(0,3fr)] gap-2">
                  <PulsePointIncidentCard onUseIncident={usePulsePointIncident} />
                  <div className="relative min-w-0">
                    <IncidentMap incident={incident} />
                    <IconButton
                      label="Collapse map"
                      onClick={() => setMapOpen(false)}
                      className="no-print absolute right-2 top-2 z-10 bg-surface/90 backdrop-blur-md"
                    >
                      <ChevronUp size={16} />
                    </IconButton>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setMapOpen(true)}
                  className="no-print flex h-full w-full items-center justify-between rounded-2xl border border-surface-line/70 bg-surface/60 px-4 text-sm font-semibold text-ink-dim hover:bg-surface-high/50"
                >
                  <span className="flex items-center gap-2">
                    <MapIcon size={16} className="text-go" />
                    {incident.address || 'Incident map (collapsed)'}
                  </span>
                  <ChevronDown size={16} />
                </button>
              )}
            </div>
          }
          transcript={
            <div
              className={cn(
                'shrink-0 transition-[height] duration-200',
                transcriptOpen ? 'h-[25dvh] min-h-[150px]' : 'h-11',
              )}
            >
              <TranscriptPanel
                incident={incident}
                collapsed={!transcriptOpen}
                onCollapsedChange={(collapsed) => setTranscriptOpen(!collapsed)}
              />
            </div>
          }
        />
      </main>
    </div>
  )
}
