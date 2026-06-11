import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronLeft, ChevronRight, MapPin, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { elapsedSince } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { unitLookup } from '@/data/units'
import type { Column, Unit, UnitTimer } from '@/types'
import { IconButton } from '@/components/ui/Button'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { SortableUnit } from './SortableUnit'

interface CommandColumnProps {
  column: Column
  index: number
  total: number
  onRename: (id: string, title: string) => void
  onLocation: (id: string, location: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, toIndex: number) => void
  customUnits?: Unit[]
  unitTimers?: Record<string, UnitTimer>
}

export function CommandColumn({
  column,
  index,
  total,
  onRename,
  onLocation,
  onDelete,
  onMove,
  customUnits = [],
  unitTimers = {},
}: CommandColumnProps) {
  const now = useNow(1000)
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column', containerId: column.id },
  })
  const unitsById = unitLookup(customUnits)
  const units = column.unitIds.map((id) => unitsById[id]).filter(Boolean)

  return (
    <section
      className={cn(
        'flex h-full w-64 shrink-0 flex-col rounded-2xl border border-surface-line/70 bg-surface/70',
        'snap-start',
      )}
      aria-label={`Column ${column.title}`}
    >
      <header className="flex flex-col gap-1.5 border-b border-surface-line/60 px-2.5 py-2">
        <div className="flex items-center gap-1">
          <InlineEdit
            value={column.title}
            ariaLabel="Column title"
            onChange={(t) => onRename(column.id, t)}
            className="flex-1 text-base font-bold text-ink"
            inputClassName="text-base font-bold"
          />
          <span className="tabnum rounded-md bg-surface-high px-1.5 py-0.5 text-xs font-bold text-ink-dim">
            {units.length}
          </span>
        </div>
        <div className="flex items-center gap-1 text-ink-faint">
          <MapPin size={13} className="shrink-0" aria-hidden />
          <InlineEdit
            value={column.location}
            ariaLabel="Location note"
            placeholder="add location…"
            onChange={(l) => onLocation(column.id, l)}
            className="flex-1 text-xs text-ink-dim"
            inputClassName="text-xs"
          />
          <IconButton
            label="Move column left"
            onClick={() => onMove(column.id, index - 1)}
            disabled={index === 0}
            className="h-7 w-7"
          >
            <ChevronLeft size={15} />
          </IconButton>
          <IconButton
            label="Move column right"
            onClick={() => onMove(column.id, index + 1)}
            disabled={index === total - 1}
            className="h-7 w-7"
          >
            <ChevronRight size={15} />
          </IconButton>
          <IconButton
            label="Delete column"
            variant="danger"
            onClick={() => onDelete(column.id)}
            className="h-7 w-7"
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      </header>

      <div
        ref={setNodeRef}
        data-dropzone={column.id}
        className={cn(
          'scroll-thin flex flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors',
          isOver && 'bg-go/5 ring-2 ring-inset ring-go/40',
        )}
      >
        <SortableContext items={column.unitIds} strategy={verticalListSortingStrategy}>
          {units.map((u) => (
            <SortableUnit
              key={u.id}
              unit={u}
              containerId={column.id}
              compact
              timerLabel={
                unitTimers[u.id]?.columnId === column.id
                  ? elapsedSince(unitTimers[u.id].startedAt, now)
                  : undefined
              }
            />
          ))}
        </SortableContext>
        {units.length === 0 && (
          <p className="select-none px-1 pt-2 text-center text-xs text-ink-faint">
            drop units here
          </p>
        )}
      </div>
    </section>
  )
}
