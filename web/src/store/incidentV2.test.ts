import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeIncidentV2, useBoard } from './boardStore'

describe('incident V2 migration and remote isolation', () => {
  beforeEach(() => useBoard.setState({ incidents: [], activeIncidentId: null }))

  it('normalizes a version-one incident to scene mode', () => {
    const migrated = normalizeIncidentV2({
      id: 'legacy',
      name: 'Legacy',
      address: '',
      marker: null,
      createdAt: '2026-06-10T12:00:00Z',
      updatedAt: '2026-06-10T12:00:00Z',
      closedAt: null,
      timer: { startedAt: null, accumulatedMs: 0, running: false },
      board: { columns: [], bankUnitIds: [] },
    })
    expect(migrated).toEqual(
      expect.objectContaining({ schemaVersion: 2, mode: 'scene', revision: 0 }),
    )
  })

  it('updates a remote incident without changing the locally selected incident', () => {
    const a = useBoard.getState().createIncident('A')
    const b = useBoard.getState().createIncident('B')
    useBoard.getState().resumeIncident(a)
    const remoteB = { ...useBoard.getState().incidents.find((item) => item.id === b)!, name: 'Remote B' }
    useBoard.getState().applyRemoteIncident(remoteB)
    expect(useBoard.getState().activeIncidentId).toBe(a)
    expect(useBoard.getState().incidents.find((item) => item.id === b)?.name).toBe('Remote B')
  })
})
