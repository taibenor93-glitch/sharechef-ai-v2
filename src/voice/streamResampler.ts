// Converts Micheli's 24 kHz voice to the playback device's native rate as ONE
// continuous stream. The browser would otherwise resample every network chunk
// on its own, starting fresh at each chunk's edge, and those seams click. Heard
// together, the clicks are the light static in a live cook.
//
// Linear interpolation, with the last input sample and the read position
// carried from one chunk to the next, so chunk boundaries vanish. The position
// is kept as whole numbers (index + phase / outRate), never a drifting float,
// so the output is identical however the voice happens to be chunked.

export class StreamResampler {
  private readonly inRate: number
  private readonly outRate: number
  private prev = 0 // last input sample of the previous chunk
  private index = 0 // read position, in input samples, relative to `prev`
  private phase = 0 // fractional part of the read position, in 1/outRate units

  constructor(inRate: number, outRate: number) {
    this.inRate = Math.round(inRate)
    this.outRate = Math.round(outRate)
  }

  /** Start a new stream (a new reply): no carry-over from the last one. */
  reset(): void {
    this.prev = 0
    this.index = 0
    this.phase = 0
  }

  push(input: Float32Array): Float32Array {
    if (input.length === 0) return new Float32Array(0)
    // Virtual buffer: index 0 is `prev`, indexes 1..n are this chunk.
    const last = input.length
    const at = (i: number) => (i === 0 ? this.prev : input[i - 1])
    const out: number[] = []
    let index = this.index
    let phase = this.phase
    while (index < last) {
      const s0 = at(index)
      out.push(phase === 0 ? s0 : s0 + (at(index + 1) - s0) * (phase / this.outRate))
      phase += this.inRate
      index += Math.floor(phase / this.outRate)
      phase %= this.outRate
    }
    this.index = index - last
    this.phase = phase
    this.prev = input[last - 1]
    return Float32Array.from(out)
  }
}
