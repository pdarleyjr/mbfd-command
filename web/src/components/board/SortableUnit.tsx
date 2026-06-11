import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { UnitCard } from './UnitCard'
import type { Unit } from '@/types'

/**
 * A unit card wired into a dnd-kit SortableContext. `containerId` rides along in
 * the sortable data so the drag handler can tell which column/bank it came from.
 */
export function SortableUnit({
  unit,
  containerId,
  compact,
  timerLabel,
}: {
  unit: Unit
  containerId: string
  compact?: boolean
  timerLabel?: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: unit.id,
    data: { type: 'unit', containerId },
  })

  return (
    <UnitCard
      ref={setNodeRef}
      unit={unit}
      timerLabel={timerLabel}
      compact={compact}
      dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
    />
  )
}
