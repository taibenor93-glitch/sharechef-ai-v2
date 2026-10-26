// One image that carries the whole share: the dish photo, the full recipe, and
// the ShareChef logo, App Store link and QR code. Threads, Instagram and
// Facebook keep only the image from the iOS share sheet and drop any text, so
// whatever is not inside the image never arrives there.
import QRCode from 'qrcode'
import { APP_STORE_LINK } from './recipeShareText'
import type { ShareableRecipe } from './recipeShareText'

const W = 1080
const PAD = 72
const MAX_H = 9000 // iOS caps canvas area (~16.7M px); 1080 x 9000 stays well inside
const PLUM = '#2D0826'
const INK = '#f6efe4'
const SOFT = '#d6c5d0'
const GOLD = '#d8ab5c'
const SERIF = "Fraunces, Georgia, 'Times New Roman', serif"
const SANS = "-apple-system, 'Helvetica Neue', Inter, Arial, sans-serif"

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`could not load ${src}`))
    img.src = src
  })
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width <= maxWidth || !line) line = next
      else { out.push(line); line = word }
    }
    out.push(line)
  }
  return out
}

type Assets = { photo: HTMLImageElement; logo: HTMLImageElement | null; qr: HTMLImageElement }

// Lays the card out top to bottom. With draw=false it only measures, so the
// canvas can be sized to fit before the real pass. Returns the total height.
function layout(ctx: CanvasRenderingContext2D, r: ShareableRecipe, a: Assets, k: number, draw: boolean): number {
  const textW = W - PAD * 2
  let y = 0

  // Photo, cropped to at most 4:5 so the recipe stays close to it.
  const photoH = Math.round(Math.min(W * 1.25, (W * a.photo.naturalHeight) / a.photo.naturalWidth))
  if (draw) {
    const srcRatio = a.photo.naturalWidth / a.photo.naturalHeight
    const dstRatio = W / photoH
    let sw = a.photo.naturalWidth, sh = a.photo.naturalHeight, sx = 0, sy = 0
    if (srcRatio > dstRatio) { sw = sh * dstRatio; sx = (a.photo.naturalWidth - sw) / 2 }
    else { sh = sw / dstRatio; sy = (a.photo.naturalHeight - sh) / 2 }
    ctx.drawImage(a.photo, sx, sy, sw, sh, 0, 0, W, photoH)
  }
  y = photoH + Math.round(56 * k)

  const block = (text: string, font: string, color: string, size: number, gapAfter: number, indent = 0, prefix = '') => {
    ctx.font = font
    const lh = Math.round(size * 1.32)
    const lines = wrap(ctx, text, textW - indent)
    lines.forEach((line, i) => {
      if (draw) {
        ctx.fillStyle = color
        if (prefix && i === 0) { ctx.fillStyle = GOLD; ctx.fillText(prefix, PAD, y + size); ctx.fillStyle = color }
        ctx.fillText(line, PAD + indent, y + size)
      }
      y += lh
    })
    y += gapAfter
  }
  const heading = (text: string) => {
    const size = Math.round(40 * k)
    block(text, `600 ${size}px ${SERIF}`, GOLD, size, Math.round(14 * k))
  }

  const titleSize = Math.round(68 * k)
  block(r.title, `600 ${titleSize}px ${SERIF}`, INK, titleSize, Math.round(12 * k))
  if (r.description) {
    const s = Math.round(34 * k)
    block(r.description, `italic ${s}px ${SERIF}`, SOFT, s, Math.round(10 * k))
  }
  const by = Math.round(28 * k)
  block('From my cook with Micheli', `500 ${by}px ${SANS}`, GOLD, by, Math.round(44 * k))

  const body = Math.round(34 * k)
  const ingredients = Array.isArray(r.ingredients) ? r.ingredients : []
  const steps = Array.isArray(r.steps) ? r.steps : []
  if (ingredients.length) {
    heading('Ingredients')
    ingredients.forEach((i) => block(i, `${body}px ${SANS}`, INK, body, Math.round(8 * k), Math.round(40 * k), '•'))
    y += Math.round(36 * k)
  }
  if (steps.length) {
    heading('Steps')
    steps.forEach((s, i) => block(s, `${body}px ${SANS}`, INK, body, Math.round(14 * k), Math.round(56 * k), `${i + 1}.`))
    y += Math.round(22 * k)
  }
  if (r.nutrition) {
    const s = Math.round(30 * k)
    block(`🥗 Nutrition (per serving, estimate): ${r.nutrition}`, `${s}px ${SANS}`, SOFT, s, Math.round(20 * k))
  }

  // Footer: logo + name + link on the left, QR on the right.
  y += Math.round(24 * k)
  if (draw) { ctx.fillStyle = 'rgba(216,171,92,0.45)'; ctx.fillRect(PAD, y, textW, 2) }
  y += Math.round(44 * k)
  const qr = 220
  const logo = 132
  const footTop = y
  if (draw) {
    if (a.logo) {
      ctx.save()
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') ctx.roundRect(PAD, footTop, logo, logo, 30)
      else ctx.rect(PAD, footTop, logo, logo)
      ctx.clip()
      ctx.drawImage(a.logo, PAD, footTop, logo, logo)
      ctx.restore()
    }
    const tx = PAD + (a.logo ? logo + 28 : 0)
    ctx.fillStyle = INK
    ctx.font = `600 44px ${SERIF}`
    ctx.fillText('ShareChef AI', tx, footTop + 50)
    // Keep every footer line clear of the QR code.
    const maxW = W - PAD - qr - 24 - tx
    ctx.fillStyle = SOFT
    ctx.font = `28px ${SANS}`
    ctx.fillText('Hands-free AI chef', tx, footTop + 92, maxW)
    ctx.fillText('Free on the App Store', tx, footTop + 128, maxW)
    ctx.fillStyle = GOLD
    ctx.font = `22px ${SANS}`
    ctx.fillText('apps.apple.com/app/sharechef-ai-hands-free-chef', tx, footTop + 166, maxW)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(W - PAD - qr, footTop - 10, qr, qr)
    ctx.drawImage(a.qr, W - PAD - qr + 10, footTop, qr - 20, qr - 20)
  }
  y = footTop + qr + PAD
  return y
}

// Returns a JPEG of the full share card, or null if the photo cannot be read.
export async function renderRecipeShareCard(recipe: ShareableRecipe, photo: Blob, fileName: string): Promise<File | null> {
  const photoUrl = URL.createObjectURL(photo)
  try {
    const [photoImg, logo, qr] = await Promise.all([
      loadImage(photoUrl),
      loadImage('/sharechef-logo.png').catch(() => null), // the card still works without the logo
      QRCode.toDataURL(APP_STORE_LINK, { margin: 0, width: 400, color: { dark: PLUM, light: '#ffffff' } }).then(loadImage),
    ])
    const assets: Assets = { photo: photoImg, logo, qr }
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined)

    // Long recipes shrink the type instead of getting cut off.
    let k = 1
    let h = layout(ctx, recipe, assets, k, false)
    for (let i = 0; i < 4 && h > MAX_H; i++) {
      k *= 0.85
      h = layout(ctx, recipe, assets, k, false)
    }
    canvas.width = W
    canvas.height = Math.min(h, MAX_H)
    ctx.fillStyle = PLUM
    ctx.fillRect(0, 0, W, canvas.height)
    ctx.textBaseline = 'alphabetic'
    layout(ctx, recipe, assets, k, true)

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9))
    return blob ? new File([blob], fileName, { type: 'image/jpeg' }) : null
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(photoUrl)
  }
}
