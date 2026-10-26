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
export const PLUM = '#2D0826'
const INK = '#f6efe4'
const SOFT = '#d6c5d0'
const GOLD = '#d8ab5c'
const SERIF = "Fraunces, Georgia, 'Times New Roman', serif"
const SANS = "-apple-system, 'Helvetica Neue', Inter, Arial, sans-serif"

export function loadImage(src: string): Promise<HTMLImageElement> {
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

// Logo and QR code, shared by the photo card and the video end card.
export type BrandAssets = { logo: HTMLImageElement | null; qr: HTMLImageElement }
type Assets = BrandAssets & { photo: HTMLImageElement | null }

export async function loadBrandAssets(): Promise<BrandAssets> {
  const [logo, qr] = await Promise.all([
    loadImage('/sharechef-logo.png').catch(() => null), // the card still works without the logo
    QRCode.toDataURL(APP_STORE_LINK, { margin: 0, width: 400, color: { dark: PLUM, light: '#ffffff' } }).then(loadImage),
  ])
  return { logo, qr }
}

// Lays the card out top to bottom. With draw=false it only measures, so the
// canvas can be sized to fit before the real pass. Returns the total height.
// Without a photo it starts with the title; without the footer it ends after
// the recipe (the video shows the footer on its own end frame instead).
function layout(ctx: CanvasRenderingContext2D, r: ShareableRecipe, a: Assets, k: number, draw: boolean, footer = true): number {
  const textW = W - PAD * 2
  let y = PAD

  // Photo, cropped to at most 4:5 so the recipe stays close to it.
  if (a.photo) {
    const photo = a.photo
    const photoH = Math.round(Math.min(W * 1.25, (W * photo.naturalHeight) / photo.naturalWidth))
    if (draw) {
      const srcRatio = photo.naturalWidth / photo.naturalHeight
      const dstRatio = W / photoH
      let sw = photo.naturalWidth, sh = photo.naturalHeight, sx = 0, sy = 0
      if (srcRatio > dstRatio) { sw = sh * dstRatio; sx = (photo.naturalWidth - sw) / 2 }
      else { sh = sw / dstRatio; sy = (photo.naturalHeight - sh) / 2 }
      ctx.drawImage(photo, sx, sy, sw, sh, 0, 0, W, photoH)
    }
    y = photoH + Math.round(56 * k)
  }

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

  if (!footer) return y + Math.round(24 * k)

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

// Draws the recipe (and footer) onto a new canvas, shrinking the type for
// long recipes instead of cutting them off.
function drawCard(recipe: ShareableRecipe, assets: Assets, footer: boolean): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  let k = 1
  let h = layout(ctx, recipe, assets, k, false, footer)
  for (let i = 0; i < 4 && h > MAX_H; i++) {
    k *= 0.85
    h = layout(ctx, recipe, assets, k, false, footer)
  }
  canvas.width = W
  canvas.height = Math.min(h, MAX_H)
  ctx.fillStyle = PLUM
  ctx.fillRect(0, 0, W, canvas.height)
  ctx.textBaseline = 'alphabetic'
  layout(ctx, recipe, assets, k, true, footer)
  return canvas
}

// The recipe on its own (no photo, no footer), for the video's recipe frame.
export async function renderRecipePanel(recipe: ShareableRecipe, brand: BrandAssets): Promise<HTMLCanvasElement | null> {
  if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined)
  return drawCard(recipe, { ...brand, photo: null }, false)
}

// Full-frame ShareChef ending: logo, name, App Store link and a big QR code.
export function drawBrandFrame(ctx: CanvasRenderingContext2D, w: number, h: number, brand: BrandAssets): void {
  const u = w / 1080
  ctx.fillStyle = PLUM
  ctx.fillRect(0, 0, w, h)
  ctx.textAlign = 'center'
  let y = h * 0.16
  if (brand.logo) {
    const s = 260 * u
    ctx.save()
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(w / 2 - s / 2, y, s, s, 56 * u)
    else ctx.rect(w / 2 - s / 2, y, s, s)
    ctx.clip()
    ctx.drawImage(brand.logo, w / 2 - s / 2, y, s, s)
    ctx.restore()
    y += s + 90 * u
  }
  ctx.fillStyle = INK
  ctx.font = `600 ${84 * u}px ${SERIF}`
  ctx.fillText('ShareChef AI', w / 2, y)
  y += 70 * u
  ctx.fillStyle = SOFT
  ctx.font = `${40 * u}px ${SANS}`
  ctx.fillText('Cook this hands-free with Micheli', w / 2, y)
  y += 56 * u
  ctx.fillText('Free on the App Store', w / 2, y)
  y += 60 * u
  const q = Math.min(440 * u, h - y - 200 * u)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(w / 2 - q / 2 - 18 * u, y, q + 36 * u, q + 36 * u)
  ctx.drawImage(brand.qr, w / 2 - q / 2, y + 18 * u, q, q)
  y += q + 36 * u + 70 * u
  ctx.fillStyle = GOLD
  ctx.font = `${30 * u}px ${SANS}`
  ctx.fillText('apps.apple.com/app/sharechef-ai-hands-free-chef', w / 2, y, w - 80 * u)
  ctx.textAlign = 'left'
}

// A JPEG of the full share card: photo (when there is one), the recipe, and
// the ShareChef footer. Null only if drawing fails.
export async function renderRecipeShareCard(recipe: ShareableRecipe, photo: Blob | null, fileName: string): Promise<File | null> {
  const photoUrl = photo ? URL.createObjectURL(photo) : null
  try {
    const [photoImg, brand] = await Promise.all([
      photoUrl ? loadImage(photoUrl) : Promise.resolve(null),
      loadBrandAssets(),
    ])
    if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined)
    const canvas = drawCard(recipe, { ...brand, photo: photoImg }, true)
    if (!canvas) return null
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9))
    return blob ? new File([blob], fileName, { type: 'image/jpeg' }) : null
  } catch {
    return null
  } finally {
    if (photoUrl) URL.revokeObjectURL(photoUrl)
  }
}
