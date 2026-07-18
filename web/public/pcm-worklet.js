// Resample device audio to 16 kHz PCM16 inside the audio render thread.
class PcmForwarder extends AudioWorkletProcessor {
  constructor() {
    super()
    this.targetRate = 16000
    this.packet = new Int16Array(1600) // ~100 ms
    this.packetIndex = 0
    this.sourcePosition = 0
    this.nextOutputPosition = 0
    this.previous = 0
    this.sumSquares = 0
    this.peak = 0
    this.clipped = 0
    this.diagnosticSamples = 0
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true
    const step = sampleRate / this.targetRate
    for (let index = 0; index < channel.length; index += 1) {
      const current = channel[index]
      const absolute = this.sourcePosition + index
      while (this.nextOutputPosition <= absolute) {
        const fraction = Math.max(0, Math.min(1, this.nextOutputPosition - (absolute - 1)))
        const sample = this.previous + (current - this.previous) * fraction
        const bounded = Math.max(-1, Math.min(1, sample))
        this.packet[this.packetIndex++] = bounded < 0 ? bounded * 0x8000 : bounded * 0x7fff
        this.sumSquares += bounded * bounded
        this.peak = Math.max(this.peak, Math.abs(bounded))
        if (Math.abs(bounded) >= 0.98) this.clipped += 1
        this.diagnosticSamples += 1
        this.nextOutputPosition += step
        if (this.packetIndex === this.packet.length) {
          const pcm = this.packet.buffer
          this.port.postMessage({ type: 'audio', pcm }, [pcm])
          this.packet = new Int16Array(1600)
          this.packetIndex = 0
        }
      }
      this.previous = current
    }
    this.sourcePosition += channel.length
    if (this.diagnosticSamples >= this.targetRate) {
      this.port.postMessage({
        type: 'diagnostics',
        diagnostics: {
          rms: Math.sqrt(this.sumSquares / this.diagnosticSamples),
          peak: this.peak,
          clippingRatio: this.clipped / this.diagnosticSamples,
          sourceSampleRate: sampleRate,
          targetSampleRate: this.targetRate,
        },
      })
      this.sumSquares = 0
      this.peak = 0
      this.clipped = 0
      this.diagnosticSamples = 0
    }
    return true
  }
}

registerProcessor('pcm-forwarder', PcmForwarder)
