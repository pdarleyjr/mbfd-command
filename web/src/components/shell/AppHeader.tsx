import { useState } from 'react'
import { Info, Layers, Maximize, Minimize, Pause, Play, Plus, RotateCcw } from 'lucide-react'
import type { Incident } from '@/types'
import { elapsedMs } from '@/lib/format'
import { eventElapsedMs } from '@/lib/eventTime'
import { apiBase } from '@/lib/config'
import { useNow } from '@/lib/useNow'
import { useBoard } from '@/store/boardStore'
import { Button, IconButton } from '@/components/ui/Button'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { IncidentsModal } from './IncidentsModal'
import { InfoModal } from './InfoModal'
import { Modal } from '@/components/ui/Modal'

export function AppHeader({ incident, onNewIncident }: { incident: Incident; onNewIncident: () => void }) {
  const renameIncident = useBoard((s) => s.renameIncident)
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
            <span className="text-sm font-extrabold tracking-tight text-ink">MBFD <span className="hidden min-[420px]:inline">COMMAND</span></span>
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
        {incident.mode === 'scene' ? <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-high/70 px-2 py-1">
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
        </div> : <SpecialTimerControls incident={incident} now={now} />}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => setShowIncidents(true)}>
          <Layers size={15} /> <span className="hidden sm:inline">Incidents</span>
        </Button>
        <IconButton label="New incident" variant="solid" onClick={onNewIncident}>
          <Plus size={18} />
        </IconButton>
        <IconButton label={fs ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen} className="hidden sm:inline-flex">
          {fs ? <Minimize size={18} /> : <Maximize size={18} />}
        </IconButton>
        <IconButton label="About this tool" onClick={() => setShowInfo(true)}>
          <Info size={18} />
        </IconButton>
      </div>

      <IncidentsModal open={showIncidents} onClose={() => setShowIncidents(false)} onNewIncident={onNewIncident} />
      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} />
    </header>
  )
}

function SpecialTimerControls({ incident, now }: { incident: Incident; now: number }) {
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [start, setStart] = useState(incident.schedule.scheduledStartAt?.slice(0, 16) ?? '')
  const [end, setEnd] = useState(incident.schedule.scheduledEndAt?.slice(0, 16) ?? '')
  const [error, setError] = useState('')
  const elapsed = eventElapsedMs(incident.schedule, now)
  const scheduledStartMs = incident.schedule.scheduledStartAt ? new Date(incident.schedule.scheduledStartAt).getTime() : null
  const startsIn = !incident.schedule.actualStartAt && scheduledStartMs && scheduledStartMs > now ? scheduledStartMs - now : null

  async function mutate(path: string, body: object) {
    setError('')
    try {
      const response = await fetch(`${apiBase()}/api/incidents/${encodeURIComponent(incident.id)}${path}`, { method: path === '/schedule' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail || 'Timer update failed')
      useBoard.getState().applyRemoteIncident(payload as Incident)
      return true
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Timer update failed'); return false }
  }

  return <>
    <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-high/70 px-2 py-1">
      <span className={`h-1.5 w-1.5 rounded-full ${incident.lifecycleStatus === 'active' ? 'bg-ok' : incident.lifecycleStatus === 'scheduled' ? 'bg-warn' : 'bg-ink-faint'}`} />
      <button type="button" onClick={() => setScheduleOpen(true)} className="touch tabnum min-h-9 rounded px-1 text-sm font-bold text-ink" title="Event schedule">{startsIn ? `Starts in ${elapsedMs(startsIn)}` : elapsedMs(elapsed)}</button>
      {incident.lifecycleStatus === 'active' ? <IconButton label="End special event" onClick={() => setEndOpen(true)} className="h-9 w-9"><Pause size={14} /></IconButton> : incident.lifecycleStatus !== 'ended' && <IconButton label="Start special event now" onClick={() => void mutate('/timer/start', {})} className="h-9 w-9"><Play size={14} /></IconButton>}
    </div>
    <Modal open={scheduleOpen} title="Event schedule" onClose={() => setScheduleOpen(false)} footer={<><Button onClick={() => setScheduleOpen(false)}>Cancel</Button><Button variant="solid" onClick={() => void mutate('/schedule', { scheduledStartAt: start ? new Date(start).toISOString() : null, scheduledEndAt: end ? new Date(end).toISOString() : null }).then((ok) => ok && setScheduleOpen(false))}>Save schedule</Button></>}><div className="space-y-3"><label className="block text-xs font-bold uppercase text-ink-faint">Start time (America/New_York)<input type="datetime-local" className="mt-1 h-11 w-full rounded-lg border border-surface-line bg-surface px-3 text-ink" value={start} onChange={(event) => setStart(event.target.value)} /></label><label className="block text-xs font-bold uppercase text-ink-faint">End time (America/New_York)<input type="datetime-local" className="mt-1 h-11 w-full rounded-lg border border-surface-line bg-surface px-3 text-ink" value={end} onChange={(event) => setEnd(event.target.value)} /></label>{error && <p className="text-sm text-live">{error}</p>}</div></Modal>
    <Modal open={endOpen} title="End special event?" onClose={() => setEndOpen(false)}><div className="space-y-3"><p className="text-sm text-ink-dim">Active runs are not cleared automatically. Choose the operational outcome explicitly.</p><Button className="w-full" variant="solid" onClick={() => void mutate('/timer/end', { clearActiveRuns: false }).then((ok) => ok && setEndOpen(false))}>End event and keep active runs open</Button><Button className="w-full" variant="danger" onClick={() => void mutate('/timer/end', { clearActiveRuns: true }).then((ok) => ok && setEndOpen(false))}>End event and clear all active runs</Button><Button className="w-full" onClick={() => setEndOpen(false)}>Cancel</Button>{error && <p className="text-sm text-live">{error}</p>}</div></Modal>
  </>
}
