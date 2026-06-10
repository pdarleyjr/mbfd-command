import { useState } from 'react'
import { Flame, Info, Layers, Maximize, Minimize, Plus } from 'lucide-react'
import type { Incident } from '@/types'
import { elapsedSince } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { useBoard } from '@/store/boardStore'
import { Button, IconButton } from '@/components/ui/Button'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { IncidentsModal } from './IncidentsModal'
import { InfoModal } from './InfoModal'

export function AppHeader({ incident }: { incident: Incident }) {
  const renameIncident = useBoard((s) => s.renameIncident)
  const createIncident = useBoard((s) => s.createIncident)
  const now = useNow()
  const [showIncidents, setShowIncidents] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [fs, setFs] = useState(false)

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setFs(true)
      } else {
        await document.exitFullscreen()
        setFs(false)
      }
    } catch {
      /* fullscreen not available */
    }
  }

  return (
    <header className="no-print flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-1">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-live/15 ring-1 ring-inset ring-live/40">
          <Flame size={20} className="text-live" />
        </span>
        <div className="leading-none">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-extrabold tracking-tight text-ink">MBFD COMMAND</span>
            <span className="rounded bg-warn/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warn">
              Prototype
            </span>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
            Miami Beach Fire Dept · Incident Command
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <InlineEdit
          value={incident.name}
          ariaLabel="Incident name"
          onChange={(name) => renameIncident(incident.id, name)}
          className="truncate text-lg font-bold text-ink"
          inputClassName="text-lg font-bold"
        />
        <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-high/70 px-2 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          <span className="tabnum text-sm font-bold text-ink" title="Operation elapsed time">
            {elapsedSince(incident.createdAt, now)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => setShowIncidents(true)}>
          <Layers size={15} /> Incidents
        </Button>
        <IconButton label="New incident" variant="solid" onClick={() => createIncident()}>
          <Plus size={18} />
        </IconButton>
        <IconButton label={fs ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
          {fs ? <Minimize size={18} /> : <Maximize size={18} />}
        </IconButton>
        <IconButton label="About this tool" onClick={() => setShowInfo(true)}>
          <Info size={18} />
        </IconButton>
      </div>

      <IncidentsModal open={showIncidents} onClose={() => setShowIncidents(false)} />
      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} />
    </header>
  )
}
