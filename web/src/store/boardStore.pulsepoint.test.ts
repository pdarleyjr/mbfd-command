import { beforeEach, describe, expect, it } from 'vitest'
import { useBoard } from './boardStore'

describe('scene PulsePoint unit safety', () => {
  beforeEach(() => {
    useBoard.setState({ incidents: [], activeIncidentId: null })
    useBoard.getState().createIncident('PulsePoint safety')
  })

  it('moves known units but never creates an unknown apparatus', () => {
    useBoard.getState().syncPulsePointUnits([{ id: 'E1' }, { id: 'UNKNOWN99' }])
    const board = useBoard.getState().getActive()!.board
    const dispatch = board.columns.find((column) => column.title === 'Dispatch')

    expect(dispatch?.unitIds).toContain('E1')
    expect(dispatch?.unitIds).not.toContain('UNKNOWN99')
    expect(board.customUnits ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'UNKNOWN99' })]),
    )
  })
})
