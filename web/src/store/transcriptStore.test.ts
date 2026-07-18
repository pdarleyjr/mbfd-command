import { beforeEach, describe, expect, it } from 'vitest'
import { useTranscript } from './transcriptStore'

const entry = (id: string, text: string) => ({
  id, at: '2026-07-18T12:00:00Z', speaker: null, recipient: null,
  displayPrefix: 'inaudible', rawText: text, correctedText: text,
  messageType: 'unknown' as const, priority: 'routine' as const,
  confidence: 0, flags: [],
})

describe('incident-scoped transcript store', () => {
  beforeEach(() => useTranscript.setState({ entriesByIncident: {}, partialByIncident: {}, stateByIncident: {} }))

  it('never leaks transcript lines between incidents', () => {
    useTranscript.getState().upsertEntry('inc-a', entry('tx-a', 'Alpha'))
    useTranscript.getState().upsertEntry('inc-b', entry('tx-b', 'Bravo'))
    expect(useTranscript.getState().entriesByIncident['inc-a']?.map((item) => item.rawText)).toEqual(['Alpha'])
    expect(useTranscript.getState().entriesByIncident['inc-b']?.map((item) => item.rawText)).toEqual(['Bravo'])
  })

  it('enrichment replaces the raw line instead of appending', () => {
    useTranscript.getState().upsertEntry('inc-a', entry('tx-a', 'engine one'))
    useTranscript.getState().upsertEntry('inc-a', { ...entry('tx-a', 'engine one'), speaker: 'E1', displayPrefix: 'E1' })
    expect(useTranscript.getState().entriesByIncident['inc-a']).toHaveLength(1)
    expect(useTranscript.getState().entriesByIncident['inc-a']?.[0].speaker).toBe('E1')
  })
})
