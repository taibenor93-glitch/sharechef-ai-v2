// Sound tape for the in-app recorder. iOS plays web audio outside what
// ReplayKit can hear, so the app keeps its own copy of the cook's sound:
// Micheli's voice (as scheduled for playback) and the mic chunks sent to her.
// Both are PCM16 mono @ 24kHz. On stop it becomes a WAV that the native
// recorder joins onto the silent screen video.
const RATE = 24000

let startMs = 0
let running = false
let chunks: { at: number; samples: Float32Array }[] = []
let voiceCount = 0
let micCount = 0

export interface TapeResult { wav: string; seconds: number; peak: number; voiceChunks: number; micChunks: number }

export function startTape(): void {
  startMs = performance.now()
  chunks = []
  voiceCount = 0
  micCount = 0
  running = true
}

export function isTaping(): boolean {
  return running
}

/** Micheli's voice. wallStartMs: when it will actually play (performance.now clock). */
export function tapeVoice(samples: Float32Array, wallStartMs: number): void {
  if (!running) return
  voiceCount++
  chunks.push({ at: Math.round(((wallStartMs - startMs) / 1000) * RATE), samples: samples.slice() })
}

/** Mic chunk (PCM16 little-endian) that just finished arriving. */
export function tapeMic(buf: ArrayBuffer): void {
  if (!running) return
  const view = new DataView(buf)
  const n = Math.floor(buf.byteLength / 2)
  const samples = new Float32Array(n)
  for (let i = 0; i < n; i++) samples[i] = view.getInt16(i * 2, true) / 32768
  const endAt = Math.round(((performance.now() - startMs) / 1000) * RATE)
  micCount++
  chunks.push({ at: endAt - n, samples })
}

/** Stops the tape and returns a base64 WAV of the whole recording. */
export function stopTape(): TapeResult {
  running = false
  const total = Math.max(1, Math.round(((performance.now() - startMs) / 1000) * RATE))
  const mix = new Float32Array(total)
  for (const c of chunks) {
    for (let i = 0; i < c.samples.length; i++) {
      const j = c.at + i
      if (j >= 0 && j < total) mix[j] += c.samples[i]
    }
  }
  chunks = []
  let peak = 0
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(mix[i]))
  const header = 44
  const out = new DataView(new ArrayBuffer(header + total * 2))
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); out.setUint32(4, 36 + total * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true)
  out.setUint32(24, RATE, true); out.setUint32(28, RATE * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true)
  str(36, 'data'); out.setUint32(40, total * 2, true)
  for (let i = 0; i < total; i++) {
    const v = Math.max(-1, Math.min(1, mix[i]))
    out.setInt16(header + i * 2, v < 0 ? v * 32768 : v * 32767, true)
  }
  const bytes = new Uint8Array(out.buffer)
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)))
  }
  return { wav: btoa(bin), seconds: total / RATE, peak: Math.min(1, peak), voiceChunks: voiceCount, micChunks: micCount }
}
