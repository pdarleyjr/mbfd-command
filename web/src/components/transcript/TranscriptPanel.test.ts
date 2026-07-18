import { describe, expect, it } from 'vitest'
import { STATUS_META } from './TranscriptPanel'

describe('TranscriptPanel status colors', () => {
  it('uses warning colors for offline instead of the live recording color', () => {
    expect(STATUS_META.error).toEqual(
      expect.objectContaining({ label: 'Offline', dot: 'bg-warn', text: 'text-warn' }),
    )
    expect(STATUS_META.error.dot).not.toBe('bg-live')
  })
})
