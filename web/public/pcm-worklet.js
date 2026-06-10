// AudioWorklet processor: forwards mono Float32 PCM frames to the main thread.
// Kept as a plain static asset so it loads identically in dev and production.
class PcmForwarder extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input[0]) {
      // Copy — the underlying buffer is reused by the engine after process().
      this.port.postMessage(input[0].slice(0))
    }
    return true
  }
}

registerProcessor('pcm-forwarder', PcmForwarder)
