// Shared recipe page (/r/:id) tests. Run: node tests/share-page.test.mjs
// Offline: the database is a fake injected through an in-process seam.
import { setTimeout as sleep } from 'node:timers/promises'

const results = []
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

process.env.SC_TEST_NO_LISTEN = '1'
process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_ANON_KEY = ''
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-offline'
const { app, __test } = await import('../server.js')
const APP = 'https://apps.apple.com/app/sharechef-ai-hands-free-chef/id6787142176'

const ID = 'AbCdEfGhIjKlMnOpQrSt'
const share = {
  title: 'Orange <Lentil> Wraps', description: 'Warm & "spiced"', ingredients: ['1 cup lentils', '<script>x</script>'],
  steps: ['Simmer.', 'Roll.'], nutrition: '~420 kcal', image_path: `user-1/${ID}.jpg`,
}
const fakeDb = (row) => ({
  from: () => ({ select: () => ({ eq: (_c, v) => ({ maybeSingle: async () => ({ data: v === ID ? row : null, error: null }) }) }) }),
})

const html = __test.renderSharePage(share, `https://host/r/${ID}`)
check('page escapes HTML in recipe text', !html.includes('<script>x</script>') && html.includes('&lt;script&gt;') && html.includes('Orange &lt;Lentil&gt; Wraps'))
check('page has App Store link', html.includes(APP))
check('page has Smart App Banner', html.includes('name="apple-itunes-app" content="app-id=6787142176"'))
check('preview card tags present', html.includes('property="og:title"') && html.includes('property="og:image" content="https://example.supabase.co/storage/v1/object/public/share-cards/user-1/') && html.includes('summary_large_image'))
check('page shows ingredients, steps, nutrition', html.includes('1 cup lentils') && html.includes('Simmer.') && html.includes('~420 kcal'))
check('ShareChef logo on page', html.includes('/sharechef-logo.png'))

__test.setShareDbProvider(() => fakeDb(share))
const srv = app.listen(3113)
await sleep(100)
const get = (p) => fetch(`http://127.0.0.1:3113${p}`, { redirect: 'manual' })
{
  const r = await get(`/r/${ID}`)
  const body = await r.text()
  check('known link → 200 page', r.status === 200 && body.includes('Orange &lt;Lentil&gt; Wraps'))
}
{
  const r = await get('/r/ZZZZZZZZZZZZZZZZZZZZ')
  check('unknown link → App Store', r.status === 302 && r.headers.get('location') === APP)
}
{
  const r = await get('/r/bad!id')
  check('malformed id → App Store', r.status === 302 && r.headers.get('location') === APP)
}
check('ready probe → 204 with a database', (await get('/r/_ready')).status === 204)
__test.setShareDbProvider(() => null)
check('ready probe → 503 without a database', (await get('/r/_ready')).status === 503)
srv.close()

const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
