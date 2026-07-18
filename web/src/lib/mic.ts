export type AudioInputProfile = 'radio_line' | 'radio_speaker' | 'room_microphone'

export interface AudioDiagnostics {
  rms: number
  peak: number
  clippingRatio: number
  sourceSampleRate: number
  targetSampleRate: 16000
}

export interface MicHandle { stop: () => Promise<void> }
export interface AudioInputDevice { deviceId: string; label: string }

export function constraintsForProfile(
  profile: AudioInputProfile,
  deviceId?: string,
): MediaTrackConstraints {
  const base: MediaTrackConstraints = { channelCount: 1 }
  if (deviceId) base.deviceId = { exact: deviceId }
  switch (profile) {
    case 'radio_line':
      return { ...base, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    case 'radio_speaker':
      return { ...base, echoCancellation: false, noiseSuppression: true, autoGainControl: false }
    case 'room_microphone':
      return { ...base, echoCancellation: false, noiseSuppression: true, autoGainControl: true }
  }
}

export async function listAudioInputs(): Promise<AudioInputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((device) => device.kind === 'audioinput').map((device, index) => ({
    deviceId: device.deviceId,
    label: device.label || `Microphone ${index + 1}`,
  }))
}

export async function startMic(
  onFrame: (pcm16: ArrayBuffer) => void,
  onDiagnostics: (diagnostics: AudioDiagnostics) => void,
  deviceId?: string,
  profile: AudioInputProfile = 'radio_speaker',
): Promise<MicHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access requires a secure browser context')
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: constraintsForProfile(profile, deviceId),
  })
  const AudioCtx: typeof AudioContext = window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const context = new AudioCtx()
  await context.audioWorklet.addModule('/pcm-worklet.js')
  const source = context.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(context, 'pcm-forwarder')
  node.port.onmessage = (event: MessageEvent<
    { type: 'audio'; pcm: ArrayBuffer } | { type: 'diagnostics'; diagnostics: AudioDiagnostics }
  >) => {
    if (event.data.type === 'audio') onFrame(event.data.pcm)
    else onDiagnostics(event.data.diagnostics)
  }
  source.connect(node)
  const sink = context.createGain()
  sink.gain.value = 0
  node.connect(sink).connect(context.destination)
  return {
    stop: async () => {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      sink.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      if (context.state !== 'closed') await context.close()
    },
  }
}
