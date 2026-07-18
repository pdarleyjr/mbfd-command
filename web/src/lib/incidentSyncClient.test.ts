import { describe, expect, it } from 'vitest'
import { incidentWebSocketUrl } from './incidentSyncClient'

describe('incident-scoped realtime URL', () => {
  it('includes the encoded incident id, client id, and last revision', () => {
    expect(incidentWebSocketUrl('inc / A', 'client-1', 42, 'wss://cmd.example')).toBe(
      'wss://cmd.example/ws/incidents/inc%20%2F%20A?client=client-1&lastRevision=42',
    )
  })
})
