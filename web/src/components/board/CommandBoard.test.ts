import { describe, expect, it } from 'vitest'
import { columnsPerPageForWidth } from './CommandBoard'

describe('CommandBoard responsive pagination', () => {
  it('recalculates visible command columns when the PulsePoint drawer changes space', () => {
    expect(columnsPerPageForWidth(1200)).toBe(4)
    expect(columnsPerPageForWidth(820)).toBe(2)
    expect(columnsPerPageForWidth(280)).toBe(1)
  })
})
