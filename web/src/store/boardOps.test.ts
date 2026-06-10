import { describe, expect, it } from 'vitest'
import * as ops from './boardOps'
import type { BoardState } from '@/types'

const COLS = [{ title: 'Command' }, { title: 'Staging' }, { title: 'Fire Attack' }]
const UNITS = ['E1', 'E2', 'L1', 'R1']

function board(): BoardState {
  return ops.emptyBoard(COLS, UNITS)
}

describe('emptyBoard', () => {
  it('puts every unit in the bank and creates the columns empty', () => {
    const b = board()
    expect(b.bankUnitIds).toEqual(UNITS)
    expect(b.columns).toHaveLength(3)
    expect(b.columns.every((c) => c.unitIds.length === 0)).toBe(true)
  })
})

describe('moveUnit', () => {
  it('moves a unit from the bank into a column', () => {
    const b = board()
    const colId = b.columns[0].id
    const next = ops.moveUnit(b, 'E1', { kind: 'column', columnId: colId })
    expect(next.bankUnitIds).not.toContain('E1')
    expect(next.columns[0].unitIds).toEqual(['E1'])
  })

  it('does not mutate the original board (immutability)', () => {
    const b = board()
    const colId = b.columns[0].id
    ops.moveUnit(b, 'E1', { kind: 'column', columnId: colId })
    expect(b.bankUnitIds).toContain('E1')
    expect(b.columns[0].unitIds).toHaveLength(0)
  })

  it('moves a unit between two columns', () => {
    let b = board()
    const [a, c] = [b.columns[0].id, b.columns[1].id]
    b = ops.moveUnit(b, 'E1', { kind: 'column', columnId: a })
    b = ops.moveUnit(b, 'E1', { kind: 'column', columnId: c })
    expect(b.columns[0].unitIds).toEqual([])
    expect(b.columns[1].unitIds).toEqual(['E1'])
  })

  it('respects the insertion index when reordering within a column', () => {
    let b = board()
    const a = b.columns[0].id
    b = ops.moveUnit(b, 'E1', { kind: 'column', columnId: a })
    b = ops.moveUnit(b, 'E2', { kind: 'column', columnId: a })
    b = ops.moveUnit(b, 'L1', { kind: 'column', columnId: a })
    // Move E1 to the end (index 2 after removal -> length).
    b = ops.moveUnit(b, 'E1', { kind: 'column', columnId: a }, 2)
    expect(b.columns[0].unitIds).toEqual(['E2', 'L1', 'E1'])
  })

  it('never duplicates a unit (remove-then-insert)', () => {
    let b = board()
    const a = b.columns[0].id
    b = ops.moveUnit(b, 'E1', { kind: 'column', columnId: a })
    b = ops.moveUnit(b, 'E1', { kind: 'column', columnId: a }, 0)
    const total = ops.allUnitIds(b).filter((id) => id === 'E1').length
    expect(total).toBe(1)
  })
})

describe('deleteColumn', () => {
  it('returns the column units to the bank by default', () => {
    let b = board()
    const a = b.columns[0].id
    b = ops.moveUnit(b, 'E1', { kind: 'column', columnId: a })
    b = ops.moveUnit(b, 'E2', { kind: 'column', columnId: a })
    b = ops.deleteColumn(b, a)
    expect(b.columns).toHaveLength(2)
    expect(b.bankUnitIds).toContain('E1')
    expect(b.bankUnitIds).toContain('E2')
  })

  it('can move orphaned units into another column', () => {
    let b = board()
    const [a, c] = [b.columns[0].id, b.columns[1].id]
    b = ops.moveUnit(b, 'E1', { kind: 'column', columnId: a })
    b = ops.deleteColumn(b, a, { kind: 'column', columnId: c })
    expect(b.columns.find((x) => x.id === c)?.unitIds).toContain('E1')
  })
})

describe('moveColumn', () => {
  it('reorders columns, carrying their cards', () => {
    let b = board()
    const a = b.columns[0].id
    b = ops.moveUnit(b, 'E1', { kind: 'column', columnId: a })
    b = ops.moveColumnById(b, a, 2)
    expect(b.columns[2].id).toBe(a)
    expect(b.columns[2].unitIds).toEqual(['E1'])
  })
})

describe('recoverUnitsToBank', () => {
  it('pulls every assigned unit back to the bank in roster order', () => {
    let b = board()
    b = ops.moveUnit(b, 'R1', { kind: 'column', columnId: b.columns[2].id })
    b = ops.moveUnit(b, 'E1', { kind: 'column', columnId: b.columns[0].id })
    b = ops.recoverUnitsToBank(b, UNITS)
    expect(b.bankUnitIds).toEqual(UNITS)
    expect(b.columns.every((c) => c.unitIds.length === 0)).toBe(true)
  })
})

describe('reconcileRoster', () => {
  it('restores a roster unit that went missing', () => {
    let b = board()
    b = ops.removeUnit(b, 'E2') // simulate a lost card
    expect(ops.allUnitIds(b)).not.toContain('E2')
    b = ops.reconcileRoster(b, UNITS)
    expect(ops.allUnitIds(b)).toContain('E2')
    expect(b.bankUnitIds).toContain('E2')
  })

  it('collapses a duplicated placement to the first occurrence', () => {
    const b: BoardState = {
      columns: [{ id: 'x', title: 'A', location: '', unitIds: ['E1'] }],
      bankUnitIds: ['E1', 'E2', 'L1', 'R1'],
    }
    const r = ops.reconcileRoster(b, UNITS)
    const e1 = ops.allUnitIds(r).filter((id) => id === 'E1').length
    expect(e1).toBe(1)
  })
})
