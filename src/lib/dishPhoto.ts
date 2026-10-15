// Optional photo of the finished dish. Stored in the private `dish-photos`
// bucket at '<user_id>/<recipe_id>.jpg' and linked from recipes.photo_path.
import { supabase } from './supabaseClient'

const BUCKET = 'dish-photos'
const MAX_SIDE = 1600
const QUALITY = 0.85

// Phone photos are several MB. Redraw onto a canvas: smaller upload, and the
// re-encode drops EXIF, so the GPS location of the user's kitchen never leaves
// the phone.
export async function compressPhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read that photo. Try another one.'))
      el.src = url
    })
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process that photo.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not process that photo.'))),
        'image/jpeg',
        QUALITY
      )
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Upload (or replace) the photo and link it to the recipe. Returns the path.
export async function saveDishPhoto(userId: string, recipeId: string, file: File): Promise<string> {
  const blob = await compressPhoto(file)
  const path = `${userId}/${recipeId}.jpg`
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (upErr) throw new Error(upErr.message)
  const { error: dbErr } = await supabase.from('recipes').update({ photo_path: path }).eq('id', recipeId)
  if (dbErr) throw new Error(dbErr.message)
  return path
}

export async function dishPhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}

// The photo as a File, ready for the share sheet.
export async function dishPhotoFile(path: string, title: string): Promise<File | null> {
  const { data } = await supabase.storage.from(BUCKET).download(path)
  if (!data) return null
  const safe = title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'my-dish'
  return new File([data], `${safe}.jpg`, { type: 'image/jpeg' })
}

export async function removeDishPhoto(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path])
}
