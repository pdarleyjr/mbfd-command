import { forwardRef, type HTMLAttributes } from 'react'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/cn'
import { APPARATUS_META } from '@/data/units'
import type { Unit } from '@/types'

interface UnitCardProps extends HTMLAttributes<HTMLDivElement> {
  unit: Unit
  timerLabel?: string
  /** Visual states. */
  dragging?: boolean
  overlay?: boolean
  compact?: boolean
  inColumn?: boolean
}

/**
 * A single draggable apparatus card. Big, color-coded by apparatus type, with a
 * clear grip affordance. Sized for gloved/rushed tablet use.
 */
export const UnitCard = forwardRef<HTMLDivElement, UnitCardProps>(function UnitCard(
  { unit, timerLabel, dragging, overlay, compact, inColumn, className, ...rest },
  ref,
) {
  const meta = APPARATUS_META[unit.type]
  return (
    <div
      ref={ref}
      data-unit-id={unit.id}
      className={cn(
        'group relative flex touch select-none items-center gap-1.5 rounded-xl border',
        'bg-surface-high/90 text-ink shadow-card ring-1 ring-inset',
        meta.chip,
        meta.ring,
        inColumn
          ? 'h-11 w-[calc(50%-4px)] shrink-0 px-2'
          : compact
            ? 'h-12 px-2.5'
            : 'h-14 px-2.5',
        overlay && 'rotate-1 scale-[1.04] shadow-lift',
        dragging && 'opacity-30',
        'transition-[transform,opacity] duration-100',
        className,
      )}
      {...rest}
    >
      <span className={cn(inColumn ? 'h-6 w-1' : 'h-9 w-1.5', 'shrink-0 rounded-full', meta.dot)} aria-hidden />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'tabnum block truncate font-extrabold leading-none tracking-tight',
            inColumn ? 'text-xs' : compact ? 'text-lg' : 'text-xl',
          )}
        >
          {unit.label}
        </span>
        {timerLabel && (
          <span className={cn('tabnum block leading-none text-ink-faint', inColumn ? 'text-[9px] mt-0.5' : 'text-[11px] mt-1')}>
            {timerLabel}
          </span>
        )}
      </span>
      {!inColumn && (
        <GripVertical
          size={18}
          className="shrink-0 text-ink-faint group-hover:text-ink-dim"
          aria-hidden
        />
      )}
    </div>
  )
})
