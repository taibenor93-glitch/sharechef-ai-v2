// Deep link parsing tests. Run: node tests/deep-link.test.mjs
//
// parseDeepLink() is the whole security boundary for sharechef:// links: any
// app, web page or QR code can fire one at us, so the function must only ever
// return one of the four literals in DEEP_LINK_TARGETS (or null for "not ours
// — don't move the user"). These tests exist to catch a regression where a
// path, query string or traversal from the URL leaks through to the router.
//
// Compiles the real source; no React, no Capacitor, no simulator.
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const OUT = new URL('./.compiled-deeplink/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
execSync(
  `npx tsc src/lib/deepLink.ts ` +
  `--outDir ${OUT} --module esnext --target es2020 --moduleResolution bundler --strict --skipLibCheck`,
  { stdio: 'inherit' }
)

const { parseDeepLink, deepLinkFor, startDeepLinkRouting, DEEP_LINK_TARGETS, DEEP_LINK_FALLBACK } =
  await import(pathToFileURL(`${OUT}deepLink.js`).href)

const results = []
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
function eq(name, actual, expected) {
  check(name, actual === expected, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
}

// ── The allowlist itself ─────────────────────────────────────────────────────
{
  eq('four screens are linkable', DEEP_LINK_TARGETS.join(','), '/,/saved,/preferences,/pricing')
  eq('unknown links fall back to home', DEEP_LINK_FALLBACK, '/')
}

// ── Valid paths ──────────────────────────────────────────────────────────────
{
  eq('sharechef://open/saved → /saved', parseDeepLink('sharechef://open/saved'), '/saved')
  eq('sharechef://open/preferences → /preferences', parseDeepLink('sharechef://open/preferences'), '/preferences')
  eq('sharechef://open/pricing → /pricing', parseDeepLink('sharechef://open/pricing'), '/pricing')
  eq('sharechef://open/ → /', parseDeepLink('sharechef://open/'), '/')
  eq('a trailing slash still resolves', parseDeepLink('sharechef://open/saved/'), '/saved')
  eq('the scheme is case-insensitive', parseDeepLink('ShareChef://open/saved'), '/saved')
  eq('the path is case-insensitive', parseDeepLink('sharechef://OPEN/Saved'), '/saved')
  eq('surrounding whitespace is tolerated', parseDeepLink('  sharechef://open/saved \n'), '/saved')
  eq('a single authority slash still resolves', parseDeepLink('sharechef:/open/saved'), '/saved')
  eq('no authority slashes still resolves', parseDeepLink('sharechef:open/saved'), '/saved')
}

// ── Missing path ─────────────────────────────────────────────────────────────
{
  eq('sharechef://open → /', parseDeepLink('sharechef://open'), '/')
  eq('bare sharechef:// → /', parseDeepLink('sharechef://'), '/')
  eq('bare sharechef: → /', parseDeepLink('sharechef:'), '/')
}

// ── Unknown paths land on home, never on the requested path ──────────────────
{
  eq('an unknown screen → /', parseDeepLink('sharechef://open/admin'), '/')
  eq('a deeper saved route is not linkable → /', parseDeepLink('sharechef://open/saved/42'), '/')
  eq('/login is not linkable → /', parseDeepLink('sharechef://open/login'), '/')
  eq('a wrong host → /', parseDeepLink('sharechef://launch/saved'), '/')
  eq('an almost-right path → /', parseDeepLink('sharechef://open/saved-recipes'), '/')
}

// ── Hostile input: nothing from the URL may reach the router ─────────────────
{
  eq('a query string is dropped', parseDeepLink('sharechef://open/saved?next=/admin'), '/saved')
  eq('a fragment is dropped', parseDeepLink('sharechef://open/saved#/admin'), '/saved')
  eq('a query on an unknown path → /', parseDeepLink('sharechef://open/?r=https://evil.test'), '/')
  eq('path traversal → /', parseDeepLink('sharechef://open/../../etc/passwd'), '/')
  eq('an absolute URL as the path → /', parseDeepLink('sharechef://open/https://evil.test'), '/')
  eq('a protocol-relative path → /', parseDeepLink('sharechef://open///evil.test'), '/')
  eq('an encoded separator → /', parseDeepLink('sharechef://open/%2Fevil.test'), '/')
  eq('an encoded path does not match', parseDeepLink('sharechef://open/%73aved'), '/')

  const everyResult = [
    'sharechef://open/saved', 'sharechef://open/admin', 'sharechef://open/../x',
    'sharechef://open/saved?a=1', 'sharechef://open', 'sharechef://x/y/z',
  ].map((u) => parseDeepLink(u))
  check('every ShareChef link resolves to an allowlisted literal',
    everyResult.every((r) => DEEP_LINK_TARGETS.includes(r)), everyResult.join(' '))
}

// ── Junk and foreign links are ignored entirely (null, not home) ─────────────
// Returning "/" here would let any unrelated link yank the user off their page.
{
  eq('another app\'s scheme is ignored', parseDeepLink('sharechefx://open/saved'), null)
  eq('https is ignored', parseDeepLink('https://sharechef.ai/saved'), null)
  eq('a Supabase-style scheme is ignored', parseDeepLink('com.sharechef.app://open/saved'), null)
  eq('the empty string is ignored', parseDeepLink(''), null)
  eq('the web getLaunchUrl() shim value is ignored', parseDeepLink({ url: '' }.url), null)
  eq('whitespace is ignored', parseDeepLink('   '), null)
  eq('a schemeless path is ignored', parseDeepLink('/saved'), null)
  eq('garbage is ignored', parseDeepLink('¯\\_(ツ)_/¯'), null)
  eq('null is ignored', parseDeepLink(null), null)
  eq('undefined is ignored', parseDeepLink(undefined), null)
  eq('a number is ignored', parseDeepLink(42), null)
  eq('an object is ignored', parseDeepLink({ url: 'sharechef://open/saved' }), null)
}

// ── The links we hand to App Store Connect round-trip ────────────────────────
{
  eq('deepLinkFor(/saved)', deepLinkFor('/saved'), 'sharechef://open/saved')
  eq('deepLinkFor(/)', deepLinkFor('/'), 'sharechef://open')
  check('every advertised link parses back to its own screen',
    DEEP_LINK_TARGETS.every((t) => parseDeepLink(deepLinkFor(t)) === t))
}

// ── Routing: the real wiring, driven by a fake @capacitor/app ───────────────
// Covers what the iOS simulator would show. (The simulator run itself needs a
// tap on iOS 26's "Open in ShareChef?" confirmation; see the notes in the PR.)
const tick = () => new Promise((r) => setTimeout(r, 0))

function fakeApp({ launchUrl, listenerFails = false, launchFails = false } = {}) {
  const fake = {
    listeners: [],
    removed: 0,
    async addListener(eventName, fn) {
      if (listenerFails) throw new Error('unimplemented on web')
      fake.listeners.push({ eventName, fn })
      return { remove: () => { fake.removed += 1 } }
    },
    async getLaunchUrl() {
      if (launchFails) throw new Error('unimplemented on web')
      return launchUrl === undefined ? undefined : { url: launchUrl }
    },
    emit(url) {
      for (const l of fake.listeners) l.fn({ url })
    },
  }
  return fake
}

// A link while the app is running.
{
  const app = fakeApp()
  const went = []
  startDeepLinkRouting(app, (t) => went.push(t))
  await tick()
  check('a running app subscribes to appUrlOpen',
    app.listeners.length === 1 && app.listeners[0].eventName === 'appUrlOpen')
  app.emit('sharechef://open/pricing')
  app.emit('sharechef://open/saved')
  eq('...and each link navigates', went.join(','), '/pricing,/saved')
  app.emit('sharechef://open/nope')
  eq('...an unknown screen lands on home', went.join(','), '/pricing,/saved,/')
  app.emit('https://sharechef.ai/saved')
  eq('...a foreign link moves nobody', went.join(','), '/pricing,/saved,/')
}

// The link that cold-started a closed app.
{
  const app = fakeApp({ launchUrl: 'sharechef://open/saved' })
  const went = []
  startDeepLinkRouting(app, (t) => went.push(t))
  await tick()
  eq('a cold launch URL navigates once', went.join(','), '/saved')
}

// A plain launch with no deep link must not move anyone.
{
  const noUrl = fakeApp()
  const wentA = []
  startDeepLinkRouting(noUrl, (t) => wentA.push(t))
  await tick()
  eq('a launch with no URL navigates nowhere', wentA.length, 0)

  const web = fakeApp({ launchUrl: '' })          // the web getLaunchUrl() shim
  const wentB = []
  startDeepLinkRouting(web, (t) => wentB.push(t))
  await tick()
  eq('the web shim navigates nowhere', wentB.length, 0)
}

// The launch URL is consumed once per app process, not once per mount.
{
  const app = fakeApp({ launchUrl: 'sharechef://open/preferences' })
  const went = []
  let handled = false
  const claim = () => (handled ? false : ((handled = true), true))
  startDeepLinkRouting(app, (t) => went.push(t), claim)
  await tick()
  startDeepLinkRouting(app, (t) => went.push(t), claim)   // a remount
  await tick()
  eq('a remount does not re-fire the launch URL', went.join(','), '/preferences')
}

// A mount thrown away before the URL arrives must not burn the claim.
{
  const app = fakeApp({ launchUrl: 'sharechef://open/saved' })
  const went = []
  let handled = false
  const claim = () => (handled ? false : ((handled = true), true))
  const stop = startDeepLinkRouting(app, (t) => went.push(t), claim)
  stop()                                           // cancelled before it resolves
  await tick()
  eq('a cancelled mount navigates nowhere', went.length, 0)
  check('...and leaves the launch URL unclaimed', handled === false)
  startDeepLinkRouting(app, (t) => went.push(t), claim)   // StrictMode remount
  await tick()
  eq('...so the remount still delivers it', went.join(','), '/saved')
}

// Cleanup.
{
  const app = fakeApp()
  const went = []
  const stop = startDeepLinkRouting(app, (t) => went.push(t))
  await tick()
  stop()
  eq('cleanup removes the listener', app.removed, 1)
  app.emit('sharechef://open/saved')
  eq('...and a late link navigates nowhere', went.length, 0)
}

// A plugin that is not there (plain browser) must not throw or navigate.
{
  const app = fakeApp({ listenerFails: true, launchFails: true })
  const went = []
  let threw = null
  try {
    startDeepLinkRouting(app, (t) => went.push(t))
    await tick()
    await tick()
  } catch (e) {
    threw = e
  }
  check('a missing plugin is survivable', threw === null, String(threw))
  eq('...and navigates nowhere', went.length, 0)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
