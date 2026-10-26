// Shareable recipe links: https://<server>/r/<id>. Sharing a link (instead of
// only an image) is what makes a share look like it came from an app: the
// recipient sees a ShareChef preview card and taps it to get the recipe and
// the App Store button. See /r/:id in server.js and the
// public_recipe_shares migration.
import { supabase } from './supabaseClient'
import { API_BASE } from './apiBase'
import type { ShareableRecipe } from './recipeShareText'

export const SHARE_BASE = API_BASE || window.location.origin

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
export function newShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export const shareUrl = (id: string) => `${SHARE_BASE}/r/${id}`

// True only when both halves are live: the server serves /r/ pages and the
// database has the shares table. Until then the app shares the image instead.
export async function shareLinksReady(): Promise<boolean> {
  try {
    const [page, table] = await Promise.all([
      fetch(`${SHARE_BASE}/r/_ready`).then((r) => r.status === 204).catch(() => false),
      supabase.from('public_recipe_shares').select('id', { count: 'exact', head: true }).then(({ error }) => !error),
    ])
    return page && table
  } catch {
    return false
  }
}

// Uploads the preview image, then stores the recipe snapshot the page shows.
export async function publishShare(
  id: string,
  userId: string,
  recipeId: string | null,
  recipe: ShareableRecipe,
  preview: Blob | null
): Promise<boolean> {
  let imagePath: string | null = null
  if (preview) {
    const path = `${userId}/${id}.jpg`
    const { error } = await supabase.storage.from('share-cards').upload(path, preview, { contentType: 'image/jpeg' })
    if (!error) imagePath = path
  }
  const { error } = await supabase.from('public_recipe_shares').insert({
    id,
    user_id: userId,
    recipe_id: recipeId,
    title: recipe.title.slice(0, 200),
    description: recipe.description ? recipe.description.slice(0, 1000) : null,
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    steps: Array.isArray(recipe.steps) ? recipe.steps : [],
    nutrition: recipe.nutrition ? recipe.nutrition.slice(0, 300) : null,
    image_path: imagePath,
  })
  return !error
}

// Undo a link that was never shared (the user closed the share sheet).
export async function removeShare(id: string, userId: string): Promise<void> {
  await supabase.from('public_recipe_shares').delete().eq('id', id)
  await supabase.storage.from('share-cards').remove([`${userId}/${id}.jpg`])
}

// A recipe's links go when the recipe is deleted: rows by CASCADE, images here.
export async function removeRecipeShareImages(recipeId: string, userId: string): Promise<void> {
  const { data } = await supabase.from('public_recipe_shares').select('id').eq('recipe_id', recipeId)
  const paths = (data ?? []).map((r) => `${userId}/${r.id}.jpg`)
  if (paths.length) await supabase.storage.from('share-cards').remove(paths)
}
