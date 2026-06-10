import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { APPARATUS_META, UNIT_BY_ID } from '@/data/units'
import { clockTime, pct } from '@/lib/format'
import type { TranscriptEntry } from '@/types'

const PRIORITY_ROW: Record<TranscriptEntry['priority'], string> = {
  routine: 'border-l-surface-line',
  important: 'border-l-go/70',
  urgent: 'border-l-warn',
  emergency: 'border-l-live bg-live/5',
}

function confidenceTone(c: number): string {
  if (c >= 0.75) return 'text-ok'
  if (c >= 0.5) return 'text-warn'
  return 'text-live'
}

export function TranscriptLine({ entry }: { entry: TranscriptEntry }) {
  const knownUnit = entry.speaker ? UNIT_BY_ID[entry.speaker] : undefined
  const prefixColor = knownUnit ? APPARATUS_META[knownUnit.type].text : 'text-ink-faint'
  const isInaudible = entry.displayPrefix === 'inaudible' || !entry.speaker
  const isCritical = entry.priority === 'emergency' || entry.flags.includes('mayday')

  return (
    <li
      className={cn(
        'flex gap-2 border-l-2 py-1.5 pl-2 pr-1 text-sm leading-snug',
        PRIORITY_ROW[entry.priority],
      )}
    >
      <time className="tabnum mt-0.5 shrink-0 text-[11px] font-medium text-ink-faint">
        {clockTime(entry.at)}
      </time>
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            'font-bold',
            isInaudible ? 'italic text-ink-faint' : prefixColor,
          )}
        >
          {entry.displayPrefix}:
        </span>{' '}
        <span className={cn('text-ink', isInaudible && 'text-ink-dim')}>
          {entry.correctedText || entry.rawText}
        </span>
        {(isCritical || entry.flags.length > 0) && (
          <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
            {isCritical && (
              <span className="inline-flex items-center gap-1 rounded bg-live/20 px-1 text-[10px] font-bold uppercase text-live">
                <AlertTriangle size={11} /> Priority
              </span>
            )}
            {entry.flags.slice(0, 3).map((f) => (
              <span
                key={f}
                className="rounded bg-surface-high px-1 text-[10px] font-medium uppercase tracking-wide text-ink-faint"
              >
                {f.replace(/_/g, ' ')}
              </span>
            ))}
          </span>
        )}
      </div>
      <span
        className={cn('tabnum mt-0.5 shrink-0 text-[11px] font-semibold', confidenceTone(entry.confidence))}
        title="Transcription confidence"
      >
        {pct(entry.confidence)}%
      </span>
    </li>
  )
}
