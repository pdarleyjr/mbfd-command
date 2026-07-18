import { useMemo, useState, useRef, useEffect, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { BoardState, Placement } from '@/types'
import { unitLookup } from '@/data/units'
import { findPlacement } from '@/store/boardOps'
import { useBoard } from '@/store/boardStore'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Modal'
import { UnitBank } from './UnitBank'
import { CommandColumn } from './CommandColumn'
import { UnitCard } from './UnitCard'

/** pointer-first detection so empty column space still resolves to its droppable. */
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args)
  return pointer.length ? pointer : closestCorners(args)
}

const COLUMN_WIDTH_WITH_GAP = 296

export function columnsPerPageForWidth(width: number): number {
  return Math.max(1, Math.floor(width / COLUMN_WIDTH_WITH_GAP))
}

export function CommandBoard({ board, right }: { board: BoardState; right?: ReactNode }) {
  const moveUnit = useBoard((s) => s.moveUnit)
  const addUnit = useBoard((s) => s.addUnit)
  const editUnit = useBoard((s) => s.editUnit)
  const addColumn = useBoard((s) => s.addColumn)
  const renameColumn = useBoard((s) => s.renameColumn)
  const setColumnLocation = useBoard((s) => s.setColumnLocation)
  const deleteColumn = useBoard((s) => s.deleteColumn)
  const moveColumnById = useBoard((s) => s.moveColumnById)
  const recoverUnitsToBank = useBoard((s) => s.recoverUnitsToBank)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [startIndex, setStartIndex] = useState(0)
  const [containerWidth, setContainerWidth] = useState(1024)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Setup droppable areas for left/right arrows during drag
  const { setNodeRef: leftArrowRef, isOver: isOverLeft } = useDroppable({
    id: 'left-arrow-trigger',
    data: { type: 'arrow-left' },
  })

  const { setNodeRef: rightArrowRef, isOver: isOverRight } = useDroppable({
    id: 'right-arrow-trigger',
    data: { type: 'arrow-right' },
  })

  // Detect and apply automatic page shifting when hovering over arrows while dragging
  useEffect(() => {
    if (!isOverLeft) return
    const interval = setInterval(() => {
      setStartIndex((prev) => Math.max(0, prev - 1))
    }, 750)
    return () => clearInterval(interval)
  }, [isOverLeft])

  useEffect(() => {
    if (!isOverRight) return
    const interval = setInterval(() => {
      setStartIndex((prev) => {
        const totalItems = board.columns.length + 1
        const columnsPerPage = columnsPerPageForWidth(containerWidth)
        const maxStart = Math.max(0, totalItems - columnsPerPage)
        return Math.min(maxStart, prev + 1)
      })
    }, 750)
    return () => clearInterval(interval)
  }, [isOverRight, board.columns.length, containerWidth])

  // Calculate layout pagination parameters
  const totalItems = board.columns.length + 1
  const columnsPerPage = columnsPerPageForWidth(containerWidth)
  const maxStart = Math.max(0, totalItems - columnsPerPage)
  const clampedStart = Math.min(startIndex, maxStart)

  const visibleColumns = board.columns.slice(clampedStart, clampedStart + columnsPerPage)
  const showAddColumnOnCurrentPage =
    (clampedStart + visibleColumns.length < clampedStart + columnsPerPage) ||
    (clampedStart + columnsPerPage >= totalItems)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 130, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const containerIds = useMemo(
    () => new Set<string>(['bank', ...board.columns.map((c) => c.id)]),
    [board.columns],
  )

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const unitId = String(active.id)
    const overId = String(over.id)

    let to: Placement
    let index: number | undefined

    if (overId === 'bank') {
      to = { kind: 'bank' }
    } else if (containerIds.has(overId)) {
      to = { kind: 'column', columnId: overId }
    } else {
      // Dropped onto another unit card — land at that card's slot.
      const place = findPlacement(board, overId)
      if (!place) return
      to = place
      const list =
        place.kind === 'bank'
          ? board.bankUnitIds
          : (board.columns.find((c) => c.id === place.columnId)?.unitIds ?? [])
      index = list.indexOf(overId)
    }

    const current = findPlacement(board, unitId)
    // No-op guard: same container + same slot.
    if (
      current &&
      to.kind === current.kind &&
      (to.kind === 'bank' || to.columnId === (current as { columnId: string }).columnId) &&
      index === undefined
    ) {
      return
    }
    moveUnit(unitId, to, index)
  }

  const unitsById = useMemo(() => unitLookup(board.customUnits), [board.customUnits])
  const activeUnit = activeId ? unitsById[activeId] : null
  const deleteTarget = board.columns.find((c) => c.id === pendingDelete)

  function requestDeleteColumn(id: string) {
    const col = board.columns.find((c) => c.id === id)
    if (col && col.unitIds.length === 0) {
      deleteColumn(id)
    } else {
      setPendingDelete(id)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="relative flex h-full min-h-0 gap-2 overflow-hidden">
        <UnitBank
          bankUnitIds={board.bankUnitIds}
          customUnits={board.customUnits}
          onAddUnit={addUnit}
          onEditUnit={editUnit}
          onRecoverAll={recoverUnitsToBank}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="relative flex-1 min-h-[210px] min-w-0" ref={containerRef}>
            {/* Left Page Arrow */}
            {clampedStart > 0 && (
              <div
                ref={leftArrowRef}
                onClick={() => setStartIndex((prev) => Math.max(0, prev - 1))}
                className={cn(
                  "absolute left-0 top-0 bottom-0 z-20 w-10 flex items-center justify-center cursor-pointer",
                  "bg-gradient-to-r from-ground via-ground/80 to-transparent text-ink-dim hover:text-ink transition-all rounded-l-2xl border-l border-surface-line/20",
                  isOverLeft && "bg-go/20 text-go"
                )}
              >
                <ChevronLeft size={32} />
              </div>
            )}

            {/* Columns Area */}
            <div className="h-full w-full overflow-hidden px-1">
              <div className="flex h-full gap-2 items-stretch py-1">
                {visibleColumns.map((col, i) => (
                  <CommandColumn
                    key={col.id}
                    column={col}
                    index={clampedStart + i}
                    total={board.columns.length}
                    onRename={renameColumn}
                    onLocation={setColumnLocation}
                    onDelete={requestDeleteColumn}
                    onMove={moveColumnById}
                    customUnits={board.customUnits}
                    unitTimers={board.unitTimers}
                  />
                ))}

                {showAddColumnOnCurrentPage && (
                  <div className="flex h-full w-72 shrink-0 items-start pt-1">
                    <Button
                      variant="ghost"
                      onClick={() => addColumn('New Column')}
                      className="w-full border-dashed min-h-[120px]"
                    >
                      <Plus size={16} /> Add column
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Page Arrow */}
            {clampedStart + columnsPerPage < totalItems && (
              <div
                ref={rightArrowRef}
                onClick={() => {
                  setStartIndex((prev) => Math.min(maxStart, prev + 1))
                }}
                className={cn(
                  "absolute right-0 top-0 bottom-0 z-20 w-10 flex items-center justify-center cursor-pointer",
                  "bg-gradient-to-l from-ground via-ground/80 to-transparent text-ink-dim hover:text-ink transition-all rounded-r-2xl border-r border-surface-line/20",
                  isOverRight && "bg-go/20 text-go"
                )}
              >
                <ChevronRight size={32} />
              </div>
            )}
          </div>
        </div>

        {right}
      </div>

      <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {activeUnit ? <UnitCard unit={activeUnit} overlay compact /> : null}
      </DragOverlay>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete "${deleteTarget?.title ?? ''}"?`}
        message={
          <>
            This column holds{' '}
            <strong className="text-ink">{deleteTarget?.unitIds.length ?? 0} unit(s)</strong>. They
            won't be lost — they'll move back to the unit bank so you can reassign them.
          </>
        }
        destructive
        confirmLabel="Delete column"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteColumn(pendingDelete)
          setPendingDelete(null)
        }}
      />
    </DndContext>
  )
}
