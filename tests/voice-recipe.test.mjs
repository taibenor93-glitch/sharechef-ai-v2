// Voice cook → recipe endpoint tests. Run: node tests/voice-recipe.test.mjs
// Offline: no Supabase, no OpenAI call is ever made (every request below is
// rejected before the model is reached, or exercises pure helpers).
import { setTimeout as sleep } from 'node:timers/promises'

const results = []
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

process.env.SC_TEST_NO_LISTEN = '1'
process.env.SUPABASE_URL = ''
process.env.SUPABASE_ANON_KEY = ''
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-offline'
const { app, __test } = await import('../server.js')
const { validateCookLines, normalizeRecipe } = __test

// ── Pure helpers ─────────────────────────────────────────────────────────────
const good = [
  { role: 'user', text: 'I have eggs and spinach' },
  { role: 'chef', text: 'Let us make a spinach omelette. Crack two eggs.' },
]
check('valid conversation accepted', validateCookLines(good).lines?.length === 2)
check('missing lines rejected', !!validateCookLines(undefined).error)
check('empty array rejected', !!validateCookLines([]).error)
check('unknown role rejected', !!validateCookLines([{ role: 'system', text: 'x' }, ...good]).error)
check('non-string text rejected', !!validateCookLines([{ role: 'user', text: 5 }, ...good]).error)
check('one-sided conversation rejected', !!validateCookLines([{ role: 'user', text: 'hi' }]).error)
check('too many lines rejected', !!validateCookLines(Array.from({ length: 301 }, (_, i) => good[i % 2])).error)
check('oversized conversation rejected',
  !!validateCookLines(Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'chef' : 'user', text: 'a'.repeat(2000) }))).error)
check('blank lines dropped', validateCookLines([{ role: 'user', text: '   ' }, ...good]).lines?.length === 2)
check('long line trimmed to 2000 chars',
  validateCookLines([{ role: 'user', text: 'b'.repeat(5000) }, good[1]]).lines?.[0].text.length === 2000)

const n = normalizeRecipe({ title: 'Omelette', ingredients: ['2 eggs'], steps: ['Whisk.'], cook_time_minutes: '10', servings: 'x', tags: ['a', 'b', 'c', 'd', 'e', 'f'] })
check('normalizeRecipe keeps the shape', n.title === 'Omelette' && n.cook_time_minutes === 10 && n.servings === null && n.tags.length === 5 && n.nutrition === '' && n.tip === '')

// ── HTTP guards ──────────────────────────────────────────────────────────────
__test.setCookUserVerifier(async (t) => (t === 'good-token' ? { id: '11111111-1111-1111-1111-111111111111' } : null))
const srv = app.listen(3112)
await sleep(100)
const post = async (body, token) => {
  const res = await fetch('http://127.0.0.1:3112/api/recipe/from-cook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  return res.status
}
check('no token → 401', (await post({ lines: good })) === 401)
check('bad token → 401', (await post({ lines: good }, 'nope')) === 401)
check('signed in, bad lines → 400', (await post({ lines: [] }, 'good-token')) === 400)
check('signed in, one-sided → 400', (await post({ lines: [good[0]] }, 'good-token')) === 400)
srv.close()

const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
