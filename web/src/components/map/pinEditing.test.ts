import { describe, expect, it } from 'vitest'
import { locationSuggestionForColumn } from './IncidentMap'

describe('map pin location suggestions', () => {
  it('fills a blank column location from reverse geocoding', () => {
    expect(locationSuggestionForColumn('', 'Convention Center — Hall D Entrance')).toEqual({
      kind: 'apply',
      value: 'Convention Center — Hall D Entrance',
    })
  })

  it('never overwrites existing tactical location text', () => {
    expect(locationSuggestionForColumn('Alpha side', 'Convention Center — Hall D Entrance')).toEqual({
      kind: 'confirm',
      value: 'Convention Center — Hall D Entrance',
    })
  })
})
