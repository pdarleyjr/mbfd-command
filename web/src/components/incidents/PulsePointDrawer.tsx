import { useState } from 'react'
import { ChevronLeft, ChevronRight, Radio } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { IncidentMode } from '@/types'
import type { PulsePointIncident } from '@/lib/pulsepoint'
import { PulsePointIncidentCard } from './PulsePointIncidentCard'

export const PULSEPOINT_UI_KEY = 'mbfd-command-pulsepoint-drawer'

export type PulsePointAction =
  | { kind: 'use_as_scene'; incident: PulsePointIncident }
  | { kind: 'assign_special_event_units'; incident: PulsePointIncident }

export function readPulsePointCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const preference = window.localStorage.getItem(PULSEPOINT_UI_KEY)
    if (preference) return preference === 'collapsed'
    return window.innerWidth < 1280
  } catch {
    return false
  }
}

export function PulsePointDrawer({
  incidentId,
  mode,
  collapsed,
  onCollapsedChange,
  onAction,
}: {
  incidentId: string
  mode: IncidentMode
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onAction: (action: PulsePointAction) => void
}) {
  const [activeCount, setActiveCount] = useState(0)

  const setCollapsed = (next: boolean) => {
    try {
      window.localStorage.setItem(PULSEPOINT_UI_KEY, next ? 'collapsed' : 'open')
    } catch {
      // The preference is optional; private browsing may reject storage.
    }
    onCollapsedChange(next)
  }

  const actionLabel = mode === 'special_event' ? 'Assign Units' : 'Use'

  return (
    <aside
      data-incident-id={incidentId}
      style={{ '--pulsepoint-drawer-width': collapsed ? '48px' : 'clamp(340px, 24vw, 420px)' } as React.CSSProperties}
      className={cn(
        'pulsepoint-drawer h-full shrink-0 overflow-hidden rounded-2xl border border-surface-line/70 bg-surface',
        'transition-[width,transform] duration-200 motion-reduce:transition-none',
        collapsed ? 'is-collapsed' : 'is-expanded shadow-lift',
      )}
      aria-label="PulsePoint incident monitor"
    >
      {collapsed ? (
        <div className="flex h-full w-12 flex-col items-center gap-3 py-2">
          <button
            type="button"
            aria-expanded={false}
            aria-controls="pulsepoint-drawer-body"
            aria-label="Open PulsePoint incidents"
            onClick={() => setCollapsed(false)}
            className="touch inline-flex w-11 items-center justify-center rounded-lg text-ink-dim hover:bg-surface-high hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/70"
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <span className="tabnum inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-live px-1.5 text-xs font-black text-white" aria-label={`${activeCount} active incidents`}>
            {activeCount}
          </span>
          <span className="flex flex-1 items-center [writing-mode:vertical-rl] rotate-180 text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink-faint">
            PulsePoint
          </span>
          <Radio size={17} className="text-live" aria-hidden />
        </div>
      ) : (
        <div id="pulsepoint-drawer-body" className="flex h-full min-w-[340px] flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-surface-line/70 px-2.5">
            <Radio size={17} className="text-live" aria-hidden />
            <span className="min-w-0 flex-1 text-sm font-extrabold text-ink">PulsePoint Live</span>
            <button
              type="button"
              aria-expanded={true}
              aria-controls="pulsepoint-drawer-body"
              aria-label="Collapse PulsePoint incidents"
              onClick={() => setCollapsed(true)}
              className="touch inline-flex w-11 items-center justify-center rounded-lg text-ink-dim hover:bg-surface-high hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/70"
            >
              <ChevronRight size={20} aria-hidden />
            </button>
          </div>
          <PulsePointIncidentCard
            className="min-h-0 flex-1 rounded-none border-0 shadow-none"
            actionLabel={actionLabel}
            onActiveCountChange={setActiveCount}
            onAction={(incident) =>
              onAction({
                kind: mode === 'special_event' ? 'assign_special_event_units' : 'use_as_scene',
                incident,
              })
            }
          />
        </div>
      )}
    </aside>
  )
}
