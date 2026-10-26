// Turns a cooking video the user picked into a ShareChef share video:
// their clip with a small ShareChef badge in the corner, then the full recipe,
// then a ShareChef end frame with the logo, App Store link and QR code.
// Threads and Instagram drop the text from a share, so the recipe and the
// link have to be in the video itself.
//
// Done in the web view: the clip plays into a canvas that MediaRecorder
// records, with the clip's sound routed through Web Audio. It runs in real
// time, so the source is capped at MAX_CLIP_SECONDS.
import type { ShareableRecipe } from './recipeShareText'
import { PLUM, drawBrandFrame, loadBrandAssets, renderRecipePanel } from './recipeShareCard'
import type { BrandAssets } from './recipeShareCard'

export const MAX_CLIP_SECONDS = 60
const OUT_W = 1080
const OUT_H = 1920 // 9:16, what Threads, Reels and TikTok show full screen
const RECIPE_SECONDS = 7
const BRAND_SECONDS = 4
const FPS = 30

// Prefer MP4: it is what iOS records and what every app accepts.
export function pickVideoType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? null
}

export function canMakeShareVideo(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    pickVideoType() !== null
  )
}

function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.playsInline = true
    v.preload = 'auto'
    v.src = URL.createObjectURL(file)
    v.onloadedmetadata = () => resolve(v)
    v.onerror = () => reject(new Error('Could not open that video. Try another one.'))
  })
}

function drawContain(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number) {
  const s = Math.min(OUT_W / sw, OUT_H / sh)
  const w = sw * s, h = sh * s
  ctx.drawImage(src, (OUT_W - w) / 2, (OUT_H - h) / 2, w, h)
}

function drawBadge(ctx: CanvasRenderingContext2D, brand: BrandAssets) {
  const x = 40, y = OUT_H - 150, h = 104
  ctx.fillStyle = 'rgba(45,8,38,0.82)'
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, 560, h, 26)
  else ctx.rect(x, y, 560, h)
  ctx.fill()
  if (brand.logo) ctx.drawImage(brand.logo, x + 14, y + 14, 76, 76)
  ctx.fillStyle = '#f6efe4'
  ctx.font = "600 34px Fraunces, Georgia, serif"
  ctx.fillText('ShareChef AI', x + 108, y + 46)
  ctx.fillStyle = '#d8ab5c'
  ctx.font = "24px -apple-system, 'Helvetica Neue', Arial, sans-serif"
  ctx.fillText('Hands-free AI chef · App Store', x + 108, y + 82)
}

export type VideoProgress = { phase: 'clip' | 'recipe' | 'ending'; fraction: number }

// Must be started from a tap: iOS only lets audio and video play after one.
export async function makeRecipeShareVideo(
  source: File,
  recipe: ShareableRecipe,
  baseName: string,
  onProgress: (p: VideoProgress) => void
): Promise<File> {
  const type = pickVideoType()
  if (!type || !canMakeShareVideo()) throw new Error('This phone cannot make share videos yet.')

  const audioCtx = new AudioContext()
  const video = await loadVideo(source)
  const [brand] = await Promise.all([loadBrandAssets()])
  const panel = await renderRecipePanel(recipe, brand)

  const canvas = document.createElement('canvas')
  canvas.width = OUT_W
  canvas.height = OUT_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not make the video.')

  // Picture from the canvas, sound from the clip (not played out loud).
  const stream = canvas.captureStream(FPS)
  try {
    const src = audioCtx.createMediaElementSource(video)
    const dest = audioCtx.createMediaStreamDestination()
    src.connect(dest)
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
  } catch { /* clip without usable sound: picture only */ }

  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 })
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const stopped = new Promise<void>((res) => { recorder.onstop = () => res() })

  const clipSeconds = Math.min(video.duration || MAX_CLIP_SECONDS, MAX_CLIP_SECONDS)
  const frame = (fn: () => void) => new Promise<void>((res) => requestAnimationFrame(() => { fn(); res() }))
  const hold = async (seconds: number, draw: () => void, phase: VideoProgress['phase']) => {
    const start = performance.now()
    for (;;) {
      const t = (performance.now() - start) / 1000
      if (t >= seconds) break
      await frame(draw)
      onProgress({ phase, fraction: t / seconds })
    }
  }

  try {
    await audioCtx.resume()
    await video.play()
    recorder.start(1000)

    // 1) The user's clip, with the ShareChef badge.
    while (!video.ended && video.currentTime < clipSeconds) {
      await frame(() => {
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, OUT_W, OUT_H)
        drawContain(ctx, video, video.videoWidth, video.videoHeight)
        drawBadge(ctx, brand)
      })
      onProgress({ phase: 'clip', fraction: video.currentTime / clipSeconds })
    }
    video.pause()

    // 2) The full recipe.
    await hold(RECIPE_SECONDS, () => {
      ctx.fillStyle = PLUM
      ctx.fillRect(0, 0, OUT_W, OUT_H)
      if (panel) drawContain(ctx, panel, panel.width, panel.height)
      drawBadge(ctx, brand)
    }, 'recipe')

    // 3) ShareChef ending: logo, App Store link, QR code.
    await hold(BRAND_SECONDS, () => drawBrandFrame(ctx, OUT_W, OUT_H, brand), 'ending')
  } finally {
    if (recorder.state !== 'inactive') recorder.stop()
    await stopped
    stream.getTracks().forEach((t) => t.stop())
    URL.revokeObjectURL(video.src)
    void audioCtx.close()
  }

  const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm'
  const blob = new Blob(chunks, { type: type.split(';')[0] })
  if (!blob.size) throw new Error('The video came out empty. Try again.')
  return new File([blob], `${baseName}.${ext}`, { type: blob.type })
}
