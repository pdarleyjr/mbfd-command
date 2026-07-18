import { describe, expect, it } from 'vitest'
import { constraintsForProfile } from './mic'

describe('audio input profiles', () => {
  it('never adds browser AGC or suppression to a direct radio line', () => {
    expect(constraintsForProfile('radio_line', 'scanner')).toEqual({
      channelCount: 1,
      deviceId: { exact: 'scanner' },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    })
  })

  it('uses AGC only for a room microphone', () => {
    expect(constraintsForProfile('radio_speaker').autoGainControl).toBe(false)
    expect(constraintsForProfile('room_microphone').autoGainControl).toBe(true)
  })
})
