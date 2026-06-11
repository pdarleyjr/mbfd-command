import { useMemo, useState, type ReactNode } from 'react'
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
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
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

export function CommandBoard({
  board,
  top,
  transcript,
}: {
  board: BoardState
  top: ReactNode
  transcript: ReactNode
}) {
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
      <div className="flex h-full min-h-0 gap-2">
        <UnitBank
          bankUnitIds={board.bankUnitIds}
          customUnits={board.customUnits}
          onAddUnit={addUnit}
          onEditUnit={editUnit}
          onRecoverAll={recoverUnitsToBank}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {top}

          <div className="scroll-thin min-h-[210px] flex-1 snap-x overflow-x-auto pb-1">
            <div className="flex h-full min-w-max gap-2">
              {board.columns.map((col, i) => (
                <CommandColumn
                  key={col.id}
                  column={col}
                  index={i}
                  total={board.columns.length}
                  onRename={renameColumn}
                  onLocation={setColumnLocation}
                  onDelete={requestDeleteColumn}
                  onMove={moveColumnById}
                  customUnits={board.customUnits}
                  unitTimers={board.unitTimers}
                />
              ))}

              <div className="flex h-full w-44 shrink-0 items-start pt-1">
                <Button
                  variant="ghost"
                  onClick={() => addColumn('New Column')}
                  className="w-full border-dashed"
                >
                  <Plus size={16} /> Add column
                </Button>
              </div>
            </div>
          </div>

          {transcript}
        </div>
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
