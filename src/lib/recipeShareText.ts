import type { Recipe } from '../types/recipe'

// App Store page for ShareChef AI. A share is how a new user finds the app.
export const APP_STORE_LINK = 'https://apps.apple.com/app/sharechef-ai-hands-free-chef/id6787142176'

export type ShareableRecipe = Pick<Recipe, 'title' | 'description' | 'ingredients' | 'steps' | 'nutrition'>

// The text that travels with a shared recipe photo. Plain text only: it has to
// read the same in Messages, Notes, a caption, or the clipboard.
export function recipeShareText(recipe: ShareableRecipe): string {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
  const steps = Array.isArray(recipe.steps) ? recipe.steps : []
  return [
    recipe.title,
    ...(recipe.description ? [recipe.description] : []),
    'From my cook with Micheli',
    '',
    'Ingredients:',
    '',
    ...ingredients.map((i) => `* ${i}`),
    '',
    'Steps:',
    '',
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    ...(recipe.nutrition ? [`🥗 Nutrition (per serving, estimate): ${recipe.nutrition}`, ''] : []),
    `Cook it hands-free with ShareChef AI: ${APP_STORE_LINK}`,
  ].join('\n')
}
