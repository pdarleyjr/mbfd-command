import { describe, expect, it } from 'vitest'
import { assignmentDurationMs, eventElapsedMs, runActiveDurationMs } from './eventTime'

describe('absolute event and run timing', () => {
  it('caps elapsed at a scheduled end and handles a future start', () => {
    expect(eventElapsedMs({ scheduledStartAt: '2030-01-01T12:00:00Z', scheduledEndAt: null, actualStartAt: null, actualEndAt: null }, Date.parse('2030-01-01T11:00:00Z'))).toBe(0)
    expect(eventElapsedMs({ scheduledStartAt: '2030-01-01T10:00:00Z', scheduledEndAt: '2030-01-01T11:00:00Z', actualStartAt: null, actualEndAt: null }, Date.parse('2030-01-01T12:00:00Z'))).toBe(3_600_000)
  })

  it('calculates run time separately from unit assignment time', () => {
    const assignment = { assignedAt: '2030-01-01T10:30:00Z', clearedAt: null }
    expect(assignmentDurationMs(assignment, Date.parse('2030-01-01T11:00:00Z'))).toBe(1_800_000)
    expect(runActiveDurationMs({ receivedAt: '2030-01-01T10:00:00Z', activatedAt: null, clearedAt: null, unitAssignments: [assignment] }, Date.parse('2030-01-01T11:00:00Z'))).toBe(1_800_000)
  })
})
