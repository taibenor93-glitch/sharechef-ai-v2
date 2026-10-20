import type { Recipe } from '../types/recipe'

// The text that travels with a shared recipe photo. Plain text only: it has to
// read the same in Messages, Notes, a caption, or the clipboard.
export function recipeShareText(recipe: Pick<Recipe, 'title' | 'ingredients' | 'steps'>): string {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
  const steps = Array.isArray(recipe.steps) ? recipe.steps : []
  return [
    recipe.title,
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
    'Search ShareChef AI on the App Store',
  ].join('\n')
}
