import { useState } from 'react'
import { ChevronDown, ChevronUp, Map as MapIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useBoard } from '@/store/boardStore'
import { AppHeader } from '@/components/shell/AppHeader'
import { CommandBoard } from '@/components/board/CommandBoard'
import { IncidentMap } from '@/components/map/IncidentMap'
import { TranscriptPanel } from '@/components/transcript/TranscriptPanel'
import { IconButton } from '@/components/ui/Button'

export default function App() {
  const incident = useBoard((s) => s.getActive())
  const createIncident = useBoard((s) => s.createIncident)
  const [mapOpen, setMapOpen] = useState(true)

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

      {/* Map — spans the full working width across the top. */}
      <div
        className={cn(
          'relative shrink-0 transition-[height] duration-200',
          mapOpen ? 'h-[30dvh] min-h-[190px]' : 'h-11',
        )}
      >
        {mapOpen ? (
          <>
            <IncidentMap incident={incident} />
            <IconButton
              label="Collapse map"
              onClick={() => setMapOpen(false)}
              className="no-print absolute right-2 top-2 z-10 bg-surface/90 backdrop-blur-md"
            >
              <ChevronUp size={16} />
            </IconButton>
          </>
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

      {/* Command board — bank + assignment columns. Fills remaining height. */}
      <main className="min-h-0 flex-1">
        <CommandBoard board={incident.board} />
      </main>

      {/* Live transcription — spans the full width under the board. */}
      <div className="h-[27dvh] min-h-[170px] shrink-0">
        <TranscriptPanel incident={incident} />
      </div>
    </div>
  )
}
