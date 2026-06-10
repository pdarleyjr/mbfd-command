import type { BoardState, Column, Placement } from '@/types'
import { uid } from '@/lib/id'

/**
 * Pure, immutable transforms over BoardState. Every function returns a NEW
 * board and never mutates its input — this keeps the Zustand store predictable
 * and makes the drag/drop + column logic unit-testable in isolation.
 */

export function makeColumn(title: string, location = ''): Column {
  return { id: uid('col'), title, location, unitIds: [] }
}

export function emptyBoard(
  columnDefs: { title: string; location?: string }[],
  bankUnitIds: string[],
): BoardState {
  return {
    columns: columnDefs.map((c) => makeColumn(c.title, c.location ?? '')),
    bankUnitIds: [...bankUnitIds],
  }
}

/** Where does a unit currently live, if anywhere? */
export function findPlacement(board: BoardState, unitId: string): Placement | null {
  if (board.bankUnitIds.includes(unitId)) return { kind: 'bank' }
  const col = board.columns.find((c) => c.unitIds.includes(unitId))
  return col ? { kind: 'column', columnId: col.id } : null
}

/** Remove a unit from wherever it sits. No-op if absent. */
export function removeUnit(board: BoardState, unitId: string): BoardState {
  return {
    bankUnitIds: board.bankUnitIds.filter((id) => id !== unitId),
    columns: board.columns.map((c) =>
      c.unitIds.includes(unitId)
        ? { ...c, unitIds: c.unitIds.filter((id) => id !== unitId) }
        : c,
    ),
  }
}

/** Insert a unit into a destination at an index (clamped). Assumes it's not already present. */
export function insertUnit(
  board: BoardState,
  unitId: string,
  to: Placement,
  index?: number,
): BoardState {
  const place = (list: string[]): string[] => {
    const next = [...list]
    const at = index === undefined ? next.length : Math.max(0, Math.min(index, next.length))
    next.splice(at, 0, unitId)
    return next
  }
  if (to.kind === 'bank') {
    return { ...board, bankUnitIds: place(board.bankUnitIds) }
  }
  return {
    ...board,
    columns: board.columns.map((c) =>
      c.id === to.columnId ? { ...c, unitIds: place(c.unitIds) } : c,
    ),
  }
}

/** Move a unit to a destination + index. The single primitive behind every drag. */
export function moveUnit(
  board: BoardState,
  unitId: string,
  to: Placement,
  index?: number,
): BoardState {
  return insertUnit(removeUnit(board, unitId), unitId, to, index)
}

export function addColumn(board: BoardState, title = 'New Column'): BoardState {
  return { ...board, columns: [...board.columns, makeColumn(title)] }
}

export function renameColumn(board: BoardState, columnId: string, title: string): BoardState {
  return {
    ...board,
    columns: board.columns.map((c) => (c.id === columnId ? { ...c, title } : c)),
  }
}

export function setColumnLocation(
  board: BoardState,
  columnId: string,
  location: string,
): BoardState {
  return {
    ...board,
    columns: board.columns.map((c) => (c.id === columnId ? { ...c, location } : c)),
  }
}

/**
 * Delete a column. Its units are NOT lost — they move to `dest`
 * (the bank by default, or another column).
 */
export function deleteColumn(
  board: BoardState,
  columnId: string,
  dest: Placement = { kind: 'bank' },
): BoardState {
  const target = board.columns.find((c) => c.id === columnId)
  if (!target) return board
  const orphans = target.unitIds
  const withoutCol: BoardState = {
    ...board,
    columns: board.columns.filter((c) => c.id !== columnId),
  }
  if (dest.kind === 'bank') {
    return { ...withoutCol, bankUnitIds: [...withoutCol.bankUnitIds, ...orphans] }
  }
  // Guard: if the destination was the deleted column, fall back to the bank.
  if (dest.columnId === columnId) {
    return { ...withoutCol, bankUnitIds: [...withoutCol.bankUnitIds, ...orphans] }
  }
  return {
    ...withoutCol,
    columns: withoutCol.columns.map((c) =>
      c.id === dest.columnId ? { ...c, unitIds: [...c.unitIds, ...orphans] } : c,
    ),
  }
}

/** Reorder a column from one index to another (cards travel with it). */
export function moveColumn(board: BoardState, fromIndex: number, toIndex: number): BoardState {
  const cols = [...board.columns]
  if (fromIndex < 0 || fromIndex >= cols.length) return board
  const [moved] = cols.splice(fromIndex, 1)
  cols.splice(Math.max(0, Math.min(toIndex, cols.length)), 0, moved)
  return { ...board, columns: cols }
}

export function moveColumnById(board: BoardState, columnId: string, toIndex: number): BoardState {
  const from = board.columns.findIndex((c) => c.id === columnId)
  return from === -1 ? board : moveColumn(board, from, toIndex)
}

/** Every unit id currently on the board (bank + all columns). */
export function allUnitIds(board: BoardState): string[] {
  return [...board.bankUnitIds, ...board.columns.flatMap((c) => c.unitIds)]
}

/** Send every assigned unit back to the bank (recover/clear), keeping columns. */
export function recoverUnitsToBank(board: BoardState, bankOrder: string[]): BoardState {
  const present = new Set(allUnitIds(board))
  const ordered = bankOrder.filter((id) => present.has(id))
  // Preserve any units somehow not in the canonical order (defensive).
  const extras = allUnitIds(board).filter((id) => !bankOrder.includes(id))
  return {
    columns: board.columns.map((c) => ({ ...c, unitIds: [] })),
    bankUnitIds: [...ordered, ...extras],
  }
}

/**
 * Reconcile the board against the canonical roster so cards can never silently
 * vanish: any roster unit missing from the board is restored to the bank, and
 * any duplicate placement is collapsed to its first occurrence.
 */
export function reconcileRoster(board: BoardState, roster: string[]): BoardState {
  const seen = new Set<string>()
  const keepFirst = (list: string[]) =>
    list.filter((id) => (seen.has(id) ? false : (seen.add(id), true)))

  const columns = board.columns.map((c) => ({ ...c, unitIds: keepFirst(c.unitIds) }))
  const bankUnitIds = keepFirst(board.bankUnitIds)
  const missing = roster.filter((id) => !seen.has(id))
  return { columns, bankUnitIds: [...bankUnitIds, ...missing] }
}
