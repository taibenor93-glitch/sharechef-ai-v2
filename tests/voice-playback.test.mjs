// Live voice playback tests. Run: node tests/voice-playback.test.mjs
//
// Why this exists: Micheli's voice arrives as 24 kHz chunks and plays at the
// device's native rate. Converting each chunk on its own leaves a seam at every
// chunk edge, and the seams are heard as light static during a live cook. The
// stream resampler must give the same audio whether the voice arrives in one
// piece or in many uneven chunks.
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const OUT = new URL('./.compiled-playback/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
execSync(
  `npx tsc src/voice/streamResampler.ts --outDir ${OUT} --module esnext --target es2020 --skipLibCheck`,
  { stdio: 'inherit' }
)
const { StreamResampler } = await import(pathToFileURL(`${OUT}streamResampler.js`).href)

const results = []
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// One second of a 440 Hz tone at 24 kHz, Micheli's rate.
const tone = new Float32Array(24000)
for (let i = 0; i < tone.length; i++) tone[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / 24000)

function inChunks(rate, sizes) {
  const r = new StreamResampler(24000, rate)
  const parts = []
  let at = 0, k = 0
  while (at < tone.length) {
    const n = Math.min(sizes[k++ % sizes.length], tone.length - at)
    parts.push(r.push(tone.subarray(at, at + n)))
    at += n
  }
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

for (const rate of [48000, 44100, 24000, 16000]) {
  const whole = new StreamResampler(24000, rate).push(tone)
  const chunked = inChunks(rate, [480, 37, 1201, 2, 960, 333])
  let maxDiff = 0
  for (let i = 0; i < Math.min(whole.length, chunked.length); i++) maxDiff = Math.max(maxDiff, Math.abs(whole[i] - chunked[i]))
  check(`${rate} Hz: chunked equals one piece (no seams)`, whole.length === chunked.length && maxDiff < 1e-6, `len ${whole.length}/${chunked.length}, max diff ${maxDiff}`)
  const expected = Math.round(tone.length * rate / 24000)
  check(`${rate} Hz: length tracks the rate`, Math.abs(whole.length - expected) <= 2, `${whole.length} vs ${expected}`)
  // No jump between neighbours bigger than the tone itself can make.
  const limit = 0.5 * 2 * Math.PI * 440 / rate * 1.05
  let maxStep = 0
  for (let i = 2; i < chunked.length; i++) maxStep = Math.max(maxStep, Math.abs(chunked[i] - chunked[i - 1]))
  check(`${rate} Hz: no clicks`, maxStep <= limit, `max step ${maxStep.toFixed(4)} limit ${limit.toFixed(4)}`)
}

const r = new StreamResampler(24000, 48000)
r.push(new Float32Array([1, 1, 1]))
r.reset()
const fresh = r.push(new Float32Array([0, 0]))
check('reset drops the last reply', fresh.every((v) => v === 0))
check('empty chunk is harmless', new StreamResampler(24000, 48000).push(new Float32Array(0)).length === 0)

const failed = results.filter((x) => !x.pass).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
