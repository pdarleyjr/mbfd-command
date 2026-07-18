import { useState } from 'react'
import { Info, Layers, Maximize, Minimize, Pause, Play, Plus, RotateCcw } from 'lucide-react'
import type { Incident } from '@/types'
import { elapsedMs } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { useBoard } from '@/store/boardStore'
import { Button, IconButton } from '@/components/ui/Button'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { IncidentsModal } from './IncidentsModal'
import { InfoModal } from './InfoModal'

export function AppHeader({ incident }: { incident: Incident }) {
  const renameIncident = useBoard((s) => s.renameIncident)
  const createIncident = useBoard((s) => s.createIncident)
  const startIncidentTimer = useBoard((s) => s.startIncidentTimer)
  const stopIncidentTimer = useBoard((s) => s.stopIncidentTimer)
  const resetIncidentTimer = useBoard((s) => s.resetIncidentTimer)
  const now = useNow()
  const [showIncidents, setShowIncidents] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [fs, setFs] = useState(false)
  const timer = incident.timer ?? { startedAt: null, accumulatedMs: 0, running: false }
  const elapsed =
    timer.accumulatedMs +
    (timer.running && timer.startedAt ? Math.max(0, now - new Date(timer.startedAt).getTime()) : 0)

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
    <header className="no-print flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 px-1 sm:gap-x-4">
      <div className="flex items-center gap-2">
        <img
          src="/mbfd-logo.png"
          alt="Miami Beach Fire Department"
          className="h-10 w-10 shrink-0 object-contain sm:h-12 sm:w-12"
        />
        <div className="leading-none">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-extrabold tracking-tight text-ink">MBFD COMMAND</span>
            <span className="rounded bg-warn/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warn">
              Prototype
            </span>
          </div>
          <span className="hidden text-[10px] font-medium uppercase tracking-wider text-ink-faint sm:inline">
            Miami Beach Fire Dept · Incident Command
          </span>
        </div>
      </div>

      <div className="order-3 flex w-full min-w-0 items-center gap-2 sm:order-none sm:w-auto sm:flex-1 sm:gap-3">
        <InlineEdit
          value={incident.name}
          ariaLabel="Incident name"
          onChange={(name) => renameIncident(incident.id, name)}
          className="truncate text-base font-bold text-ink sm:text-lg"
          inputClassName="text-lg font-bold"
        />
        <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-high/70 px-2 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          <span className="tabnum text-sm font-bold text-ink" title="Operation elapsed time">
            {elapsedMs(elapsed)}
          </span>
          <IconButton
            label={timer.running ? 'Stop incident timer' : 'Start incident timer'}
            onClick={timer.running ? stopIncidentTimer : startIncidentTimer}
            className="h-7 w-7"
          >
            {timer.running ? <Pause size={14} /> : <Play size={14} />}
          </IconButton>
          <IconButton label="Reset incident timer" onClick={resetIncidentTimer} className="h-7 w-7">
            <RotateCcw size={13} />
          </IconButton>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => setShowIncidents(true)}>
          <Layers size={15} /> <span className="hidden sm:inline">Incidents</span>
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
