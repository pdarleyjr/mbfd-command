import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Activity, AlertTriangle, ExternalLink, Radio, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  feedAge,
  fetchPulsePointFeed,
  incidentTime,
  type PulsePointFeed,
  type PulsePointIncident,
} from '@/lib/pulsepoint'
import { Button } from '@/components/ui/Button'

interface PulsePointIncidentCardProps {
  className?: string
  onUseIncident?: (incident: PulsePointIncident) => void
}

export function PulsePointIncidentCard({
  className,
  onUseIncident,
}: PulsePointIncidentCardProps) {
  const [feed, setFeed] = useState<PulsePointFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    async function load() {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 12000)
      try {
        const next = await fetchPulsePointFeed(controller.signal)
        if (cancelled) return
        setFeed(next)
        setError(false)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        window.clearTimeout(timeout)
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    timer = window.setInterval(() => void load(), 30000)

    return () => {
      cancelled = true
      if (timer) window.clearInterval(timer)
    }
  }, [])

  const active = feed?.active ?? []
  const recent = feed?.recent ?? []
  const visible = useMemo(
    () => (active.length > 0 ? active.slice(0, 5) : recent.slice(0, 5)),
    [active, recent],
  )
  const showingRecent = active.length === 0 && recent.length > 0
  const updated = feed ? `Updated ${feedAge(feed.fetchedAt)}` : 'Connecting...'
  const agency = feed?.agency ?? 'X1012'

  return (
    <aside
      className={cn(
        'panel flex h-full min-h-0 flex-col overflow-hidden rounded-2xl shadow-card',
        className,
      )}
      aria-label="PulsePoint live incident feed"
      aria-live="polite"
    >
      <header className="flex items-start justify-between gap-2 border-b border-surface-line/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-live/35 bg-live/15 text-live">
            <Radio size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-extrabold text-ink">PulsePoint Live</h2>
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Miami Beach Fire - {agency}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-bold',
            error
              ? 'border-warn/35 bg-warn/10 text-warn'
              : feed?.stale
                ? 'border-warn/35 bg-warn/10 text-warn'
                : 'border-live/35 bg-live/10 text-live',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              error || feed?.stale ? 'bg-warn' : 'animate-pulse-live bg-live',
            )}
            aria-hidden
          />
          {error ? 'Offline' : feed?.stale ? 'Stale' : 'Live'}
        </span>
      </header>

      <div className="grid grid-cols-3 border-b border-surface-line/70 bg-surface-high/35 px-3 py-1.5">
        <Stat label="Active" value={loading ? '-' : active.length} tone="text-live" />
        <Stat label="Recent" value={loading ? '-' : recent.length} tone="text-ink-dim" />
        <div className="min-w-0 text-right">
          <p className="truncate text-[11px] font-semibold text-ink-faint">{updated}</p>
          <p className="mt-0.5 truncate text-[10px] font-medium text-ink-faint">30s refresh</p>
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <LoadingRows />
        ) : error && !feed ? (
          <StateMessage
            icon={<AlertTriangle size={22} />}
            title="Monitoring unavailable"
            detail="PulsePoint feed will retry automatically."
          />
        ) : visible.length === 0 ? (
          <StateMessage
            icon={<Activity size={22} />}
            title="No active incidents"
            detail="All units available."
          />
        ) : (
          <div className="space-y-1.5">
            <p
              className={cn(
                'px-1 text-[11px] font-extrabold uppercase tracking-wide',
                showingRecent ? 'text-ink-faint' : 'text-live',
              )}
            >
              {showingRecent ? 'Recent calls' : 'Active calls'}
            </p>
            {visible.slice(0, 4).map((incident) => (
              <IncidentRow
                key={incident.id}
                incident={incident}
                active={!showingRecent}
                onUseIncident={onUseIncident}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-surface-line/70 px-3 py-1.5 text-[11px] font-semibold text-ink-faint">
        <span className="inline-flex items-center gap-1">
          <RefreshCw size={12} aria-hidden /> Auto-refreshes every 30s
        </span>
        <a
          href="https://web.pulsepoint.org/?agency=X1012"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-ink-dim hover:text-live focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/70"
        >
          PulsePoint <ExternalLink size={12} aria-hidden />
        </a>
      </footer>
    </aside>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div>
      <p className={cn('tabnum text-lg font-black leading-none', tone)}>{value}</p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{label}</p>
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="space-y-2 px-1 py-1" aria-label="Loading PulsePoint incidents">
      {[0, 1, 2].map((n) => (
        <div key={n} className="rounded-xl border border-surface-line/60 bg-surface-high/35 p-2">
          <div className="h-3 w-1/2 rounded bg-surface-high" />
          <div className="mt-2 h-2.5 w-4/5 rounded bg-surface-high" />
          <div className="mt-2 h-2.5 w-2/5 rounded bg-surface-high" />
        </div>
      ))}
    </div>
  )
}

function StateMessage({
  icon,
  title,
  detail,
}: {
  icon: ReactNode
  title: string
  detail: string
}) {
  return (
    <div className="flex h-full min-h-24 flex-col items-center justify-center px-4 text-center text-ink-faint">
      <span className="mb-2 text-ink-faint">{icon}</span>
      <p className="text-sm font-bold text-ink-dim">{title}</p>
      <p className="mt-1 text-xs font-medium">{detail}</p>
    </div>
  )
}

function IncidentRow({
  incident,
  active,
  onUseIncident,
}: {
  incident: PulsePointIncident
  active: boolean
  onUseIncident?: (incident: PulsePointIncident) => void
}) {
  const units = incident.units ?? []
  const canUse = Boolean(onUseIncident && (incident.address || (incident.lat && incident.lng)))

  return (
    <article className="rounded-xl border border-surface-line/70 bg-surface-high/45 p-1.5 shadow-card">
      <div className="flex items-start gap-2">
        <time className="tabnum w-10 shrink-0 pt-0.5 text-[11px] font-bold text-ink-faint">
          {incidentTime(incident.receivedAt)}
        </time>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 text-xs font-extrabold leading-tight text-ink">{incident.callType}</h3>
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase leading-none',
                active ? 'bg-live/15 text-live' : 'bg-surface-high text-ink-faint',
              )}
            >
              {active ? 'Active' : 'Cleared'}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[11px] font-medium leading-tight text-ink-faint">
            {incident.address || 'Address unavailable'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {units.slice(0, 4).map((unit) => (
              <span
                key={`${incident.id}-${unit.id}`}
                className="tabnum rounded-md border border-surface-line bg-surface px-1.5 py-0.5 text-[10px] font-black leading-none text-ink-dim"
                title={unit.status ?? undefined}
              >
                {unit.id}
              </span>
            ))}
            {units.length > 4 && (
              <span className="text-[10px] font-semibold text-ink-faint">+{units.length - 4}</span>
            )}
            {canUse && (
              <Button
                size="sm"
                variant="solid"
                className="ml-auto h-6 min-h-0 px-2 text-[11px]"
                onClick={() => onUseIncident?.(incident)}
              >
                Use
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
