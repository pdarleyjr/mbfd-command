/**
 * Microphone capture → 16 kHz mono PCM16 frames, suitable for streaming to a
 * faster-whisper backend. Uses an AudioWorklet (with a graceful close path) and
 * resamples from the device rate to 16 kHz on the main thread.
 */

const TARGET_RATE = 16000
const FRAME_MS = 250 // send ~4 frames/sec

export interface MicHandle {
  stop: () => Promise<void>
}

export async function startMic(
  onFrame: (pcm16: ArrayBuffer) => void,
  onLevel: (level: number) => void,
): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })

  const AudioCtx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AudioCtx({ sampleRate: TARGET_RATE })
  const srcRate = ctx.sampleRate // browser may ignore the requested rate

  await ctx.audioWorklet.addModule('/pcm-worklet.js')
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'pcm-forwarder')

  const samplesPerFrame = Math.round((TARGET_RATE * FRAME_MS) / 1000)
  let acc: number[] = []

  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const chunk = e.data
    // RMS for the level meter.
    let sum = 0
    for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i]
    onLevel(Math.min(1, Math.sqrt(sum / chunk.length) * 4))

    const resampled = srcRate === TARGET_RATE ? chunk : downsample(chunk, srcRate, TARGET_RATE)
    for (let i = 0; i < resampled.length; i++) acc.push(resampled[i])

    while (acc.length >= samplesPerFrame) {
      const slice = acc.slice(0, samplesPerFrame)
      acc = acc.slice(samplesPerFrame)
      onFrame(floatToPcm16(slice))
    }
  }

  source.connect(node)
  // A muted sink keeps the graph pulling on some browsers without echoing audio.
  const sink = ctx.createGain()
  sink.gain.value = 0
  node.connect(sink).connect(ctx.destination)

  return {
    stop: async () => {
      try {
        node.port.onmessage = null
        source.disconnect()
        node.disconnect()
        sink.disconnect()
        stream.getTracks().forEach((t) => t.stop())
        await ctx.close()
      } catch {
        /* already torn down */
      }
    },
  }
}

function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return input
  const ratio = from / to
  const outLen = Math.floor(input.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    out[i] = input[Math.floor(i * ratio)]
  }
  return out
}

function floatToPcm16(samples: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buf)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buf
}
