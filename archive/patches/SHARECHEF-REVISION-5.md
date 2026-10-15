SHARECHEF PHASE 1 ANALYTICS — REVISION 5

STATUS: ACCOUNT-BOUND OUTBOX COMPLETE

FILES CHANGED: src/lib/events.ts (auth-context provider, requiredUserId account binding, full restore-sanitization), src/App.tsx (registers the auth-context provider: token + userId), tests/client-events.test.mjs (account-binding suite). Database migration and all unrelated analytics behavior UNCHANGED.

ACCOUNT-BINDING METHOD: the token provider is replaced by an authentication-context provider returning { accessToken, userId }. Every authenticated queue item persists needsAuth:true + requiredUserId (the account that performed the action) + typed body + attempts + optional validated guard key — never a token. requiredUserId is captured AT CREATION: for track() calls from the JWT sub of the exact token used for the action; for identity_linked from its explicit original user id. At every retry the CURRENT fresh context is fetched; delivery requires a valid token AND currentUserId === requiredUserId; a different signed-in account never receives the event — it stays pending within the 5-attempt policy, delivers if the original account returns, and is never reassigned. An authenticated dispatch whose acting account cannot be resolved is never queued at all. The identity_linked guard key must equal sc_evt_linked_<requiredUserId> and is set only by delivery under that exact account.

SANITIZATION (every restored item): item-level keys restricted to {body, needsAuth, attempts, requiredUserId, guardKey} — any extra field (e.g. a token) rejects the item; approved client event names only; approved property keys only; valid UUID event id, anon_id, session_id; strict x.y.z app_version; attempts within 0–5; valid UUID requiredUserId REQUIRED when needsAuth; guardKey must match sc_evt_linked_<requiredUserId> exactly. Rejected items are discarded safely and never sent.

TEST RESULTS: client events 38/38 PASSED, including all eight requested proofs: User A's queued event never sent with User B's token; event stays pending while User B is signed in; event delivers when User A returns (with a fresh token); identity_linked cannot link the anonymous identity to the wrong account (no delivery, no guard set); authenticated stored item without requiredUserId discarded; tampered/unexpected persisted properties discarded; no access token present in storage; anonymous events continue to retry without authentication. Plus session 18/18 and endpoint+unit 32/32 — TOTAL 88/88. Build clean (tsc + vite; node --check server.js).

MIGRATION STATUS: NOT APPLIED
DEPLOYMENT STATUS: NOT DEPLOYED — kill switches default OFF; nothing committed, configured, or pushed.

================================================================
TARGETED DIFF — App.tsx (tracked):
```diff
diff --git a/src/App.tsx b/src/App.tsx
index 059ce1c..842cd6d 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1,5 +1,8 @@
+import { useEffect } from 'react'
 import { Navigate, Route, Routes } from 'react-router-dom'
 import { useAuth } from './hooks/useAuth'
+import { startAnalyticsSession, foregroundBoundary, linkIdentityOnce, setAuthContextProvider } from './lib/events'
+import { supabase } from './lib/supabaseClient'
 import { Layout } from './components/Layout'
 import { ProtectedRoute } from './components/ProtectedRoute'
 import { LoginPage } from './pages/Login'
@@ -16,6 +19,27 @@ import { PricingPage } from './pages/Pricing'
 export default function App() {
   const { authed, session, loading } = useAuth()
 
+  // Phase 1 events (no-ops unless VITE_EVENTS_ENABLED='true'): cold launch
+  // always starts a new session; foreground return rotates only after the
+  // 30-minute inactivity window; plus one-time anon→account linkage.
+  useEffect(() => {
+    // Fresh AUTH CONTEXT (token + user id) for authenticated retries, fetched
+    // at flush time and never persisted — retries deliver only under the exact
+    // account that performed the action.
+    setAuthContextProvider(async () => {
+      const { data } = await supabase.auth.getSession()
+      const s = data.session
+      return s?.access_token && s.user?.id ? { accessToken: s.access_token, userId: s.user.id } : null
+    })
+    startAnalyticsSession()
+    const onVisible = () => { if (document.visibilityState === 'visible') foregroundBoundary() }
+    document.addEventListener('visibilitychange', onVisible)
+    return () => document.removeEventListener('visibilitychange', onVisible)
+  }, [])
+  useEffect(() => {
+    if (session?.user?.id) linkIdentityOnce(session.user.id, session.access_token ?? null)
+  }, [session])
+
   if (loading) {
     return (
       <div className="boot">
```

src/lib/events.ts is a new untracked file; its COMPLETE current content:
```ts
// Phase 1 funnel events — client emitter (revision 3).
// KILL SWITCH: VITE_EVENTS_ENABLED must be exactly 'true' or nothing is sent OR
// queued. Fire-and-forget; never throws; never blocks UI or the audio path.
// App version comes from build metadata (__APP_VERSION__ = package.json version).
//
// Delivery semantics: a server "duplicate" response means the event already
// exists — that IS successful delivery. Transient failures (network, 429, 5xx)
// go to a bounded in-memory retry queue (max 50, max 5 attempts each, original
// event UUID preserved so retries can never double-count). Validation/auth 4xx
// are never retried. The queue flushes on app start and on foreground return.

import { API_BASE } from './apiBase'
import {
  getAnonId, getSessionId, touchActivity, initIdentity, identityReady,
  resumeBoundary, makeUuid, kvGet, kvSet, __setPlatformForTests,
} from './session'

function flag(name: 'VITE_EVENTS_ENABLED' | 'VITE_EVENTS_DEBUG'): boolean {
  try { return import.meta.env[name] === 'true' } catch { return false }
}
let ENABLED = flag('VITE_EVENTS_ENABLED')
const DEBUG = flag('VITE_EVENTS_DEBUG')
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' && /^\d+\.\d+\.\d+$/.test(__APP_VERSION__) ? __APP_VERSION__ : '0.0.0'

type EventName =
  | 'app_opened'
  | 'account_created'
  | 'identity_linked'
  | 'ingredients_submitted'
  | 'dish_proposed'
  | 'dish_saved'
  | 'dish_shared'

const ALLOWED_PROPS: Record<EventName, string[]> = {
  app_opened: [],
  account_created: [],
  identity_linked: [],
  ingredients_submitted: ['ingredient_count'],
  dish_proposed: ['ingredient_count'],
  dish_saved: [],
  dish_shared: ['channel'],
}

type EventBody = Record<string, unknown>
// Persistent outbox item. NEVER contains a token. needsAuth marks that delivery
// requires a fresh session token AT FLUSH TIME, and requiredUserId binds the
// event to the account that performed the action: it can only ever be delivered
// under that exact account, never reassigned. guardKey (identity_linked only)
// must match requiredUserId and is set only after delivery under that account.
type QueueItem = { body: EventBody; needsAuth: boolean; attempts: number; requiredUserId?: string; guardKey?: string }

const OUTBOX_KEY = 'sc_evt_outbox'
const MAX_QUEUE = 50
const MAX_ATTEMPTS = 5
let retryQueue: QueueItem[] = []
let outboxLoaded = false
let flushing = false
// Serialized persistence: concurrent writers append to this chain so no write
// overwrites another within this context (cross-tab remains last-writer-wins,
// documented as best-effort like the rest of web storage).
let persistChain: Promise<void> = Promise.resolve()

// Authentication-context provider, registered by the app shell. Returns the
// CURRENT session's token AND user id at flush time. Tokens are NEVER persisted.
export type AuthContext = { accessToken: string; userId: string } | null
let authContextProvider: () => Promise<AuthContext> = async () => null
export function setAuthContextProvider(fn: () => Promise<AuthContext>): void { authContextProvider = fn }

// Derives the acting account from the token used AT CREATION TIME (JWT `sub`).
// Unverified decode is fine here: it only BINDS the retry; the server re-verifies
// the actual token on every delivery.
function userIdFromToken(token: string | null): string | null {
  try {
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const sub = payload?.sub
    return typeof sub === 'string' && UUID_RE.test(sub) ? sub.toLowerCase() : null
  } catch { return null }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const APP_VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,4}$/
const ITEM_KEYS = new Set(['body', 'needsAuth', 'attempts', 'requiredUserId', 'guardKey'])
const BODY_STANDARD_KEYS = new Set(['id', 'event', 'anon_id', 'session_id', 'app_version', 'reported_client_ts'])

// Full validation of every RESTORED queue item — tampered, unexpected, or
// account-unbound entries are rejected safely and never sent.
function sanitizeItem(raw: unknown): QueueItem | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  for (const k of Object.keys(raw)) if (!ITEM_KEYS.has(k)) return null // no token, no unexpected fields
  const it = raw as Partial<QueueItem>
  if (typeof it.needsAuth !== 'boolean') return null
  if (!Number.isInteger(it.attempts) || (it.attempts as number) < 0 || (it.attempts as number) > MAX_ATTEMPTS) return null
  const body = it.body
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const event = (body as EventBody).event
  if (typeof event !== 'string' || !(event in ALLOWED_PROPS)) return null // approved client events only
  const allowed = ALLOWED_PROPS[event as EventName]
  for (const k of Object.keys(body)) {
    if (!BODY_STANDARD_KEYS.has(k) && !allowed.includes(k)) return null // approved properties only
  }
  const b = body as Record<string, unknown>
  if (!UUID_RE.test(String(b.id)) || !UUID_RE.test(String(b.anon_id)) || !UUID_RE.test(String(b.session_id))) return null
  if (!APP_VERSION_RE.test(String(b.app_version))) return null
  let requiredUserId: string | undefined
  if (it.needsAuth) {
    if (!UUID_RE.test(String(it.requiredUserId))) return null // authenticated items MUST carry a valid account binding
    requiredUserId = String(it.requiredUserId).toLowerCase()
  }
  let guardKey: string | undefined
  if (it.guardKey !== undefined) {
    // identity_linked guard must be bound to the exact required account.
    if (typeof it.guardKey !== 'string' || !requiredUserId || it.guardKey !== `sc_evt_linked_${requiredUserId}`) return null
    guardKey = it.guardKey
  }
  return { body: body as EventBody, needsAuth: it.needsAuth, attempts: it.attempts as number, requiredUserId, guardKey }
}

async function loadOutbox(): Promise<void> {
  if (outboxLoaded) return
  outboxLoaded = true
  try {
    const raw = await kvGet(OUTBOX_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const items = parsed.map(sanitizeItem).filter((i): i is QueueItem => i !== null)
      // Merge storage + memory, deduped by event UUID (memory copy wins) — a
      // persisted twin of an in-memory item must never double-send.
      const seen = new Set(retryQueue.map((i) => String(i.body.id)))
      retryQueue = items.filter((i) => !seen.has(String(i.body.id))).concat(retryQueue).slice(0, MAX_QUEUE)
    }
  } catch { /* corrupted outbox: start clean */ }
}

function persistOutbox(): void {
  persistChain = persistChain.then(async () => {
    try { await kvSet(OUTBOX_KEY, JSON.stringify(retryQueue.slice(0, MAX_QUEUE))) } catch { /* ignore */ }
  })
}

// Events fired before async identity init completes are held (bounded), then
// flushed with the settled identity — identifiers never leave pre-init.
const preInitQueue: Array<() => void> = []

let fetchImpl: typeof fetch = (...args) => fetch(...args)

type SendResult = 'delivered' | 'retriable' | 'rejected'
async function sendOnce(body: EventBody, authToken: string | null): Promise<SendResult> {
  try {
    const res = await fetchImpl(`${API_BASE}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(body),
      keepalive: true,
    })
    if (res.status === 429 || res.status >= 500) return 'retriable'
    if (!res.ok) return 'rejected' // validation/auth 4xx: never retried
    const json = await res.json().catch(() => null)
    if (json?.stored === true) return 'delivered'
    if (json?.reason === 'duplicate') return 'delivered' // already in the database
    return 'rejected' // e.g. kill switch off server-side: no retry loop
  } catch {
    return 'retriable' // network failure
  }
}

function enqueueRetry(item: QueueItem): void {
  if (!ENABLED) return // kill switch OFF: no new entries (existing storage untouched)
  if (retryQueue.length >= MAX_QUEUE) return // bounded: drop, never grow
  retryQueue.push(item)
  persistOutbox()
}

function setGuard(guardKey?: string): void {
  if (!guardKey) return
  try { window.localStorage.setItem(guardKey, '1') } catch { /* ignore */ }
}

async function flushRetryQueue(): Promise<void> {
  if (!ENABLED || flushing) return // kill switch OFF: never flushes, queue left as-is
  flushing = true
  try {
    await loadOutbox()
    const batch = retryQueue; retryQueue = []
    for (const item of batch) {
      let token: string | null = null
      if (item.needsAuth) {
        let ctx: AuthContext = null
        try { ctx = await authContextProvider() } catch { ctx = null } // fresh context at flush time, never persisted
        // Delivery requires BOTH a valid token AND the exact original account.
        // A different signed-in account must never receive this event: keep it
        // pending (within the attempt policy) until the original account
        // returns — events are never reassigned.
        if (!ctx || !ctx.accessToken || ctx.userId?.toLowerCase() !== item.requiredUserId) {
          if (item.attempts + 1 < MAX_ATTEMPTS) retryQueue.push({ ...item, attempts: item.attempts + 1 })
          continue
        }
        token = ctx.accessToken
      }
      const result = await sendOnce(item.body, token) // same UUID: retries can never duplicate
      if (result === 'delivered') setGuard(item.guardKey)
      else if (result === 'retriable' && item.attempts + 1 < MAX_ATTEMPTS) {
        retryQueue.push({ ...item, attempts: item.attempts + 1 })
      } // delivered / duplicate / rejected / exhausted: removed from storage below
    }
  } finally {
    persistOutbox() // storage reflects survivors only
    flushing = false
  }
}

function dispatch(body: EventBody, authToken: string | null, needsAuth: boolean, requiredUserId?: string, guardKey?: string): void {
  void sendOnce(body, authToken).then((result) => {
    if (result === 'delivered') setGuard(guardKey)
    else if (result === 'retriable') {
      // Authenticated events without a resolvable acting account are never
      // queued: a retry that can't be account-bound must not exist.
      if (needsAuth && !requiredUserId) return
      enqueueRetry({ body, needsAuth, attempts: 1, requiredUserId, guardKey })
    }
  })
}

function buildBody(event: EventName, props?: { ingredient_count?: number; channel?: string }): EventBody {
  const body: EventBody = {
    id: makeUuid(),
    event,
    anon_id: getAnonId(),
    session_id: getSessionId(),
    app_version: APP_VERSION,
    reported_client_ts: new Date().toISOString(),
  }
  for (const key of ALLOWED_PROPS[event]) {
    const v = props?.[key as keyof typeof props]
    if (v !== undefined) body[key] = v
  }
  return body
}

export function track(event: EventName, props?: { ingredient_count?: number; channel?: string }, authToken?: string | null): void {
  try {
    if (!ENABLED) { if (DEBUG) console.log('[events:off]', event, props); return }
    if (!ALLOWED_PROPS[event]) return
    const emit = () => {
      const body = buildBody(event, props)
      if (DEBUG) console.log('[events]', body)
      touchActivity()
      // If the original call was authenticated, retries must stay authenticated
      // AND stay bound to the account that performed the action (JWT sub).
      dispatch(body, authToken ?? null, !!authToken, userIdFromToken(authToken ?? null) ?? undefined)
    }
    if (!identityReady()) {
      if (preInitQueue.length < 20) preInitQueue.push(emit)
      return
    }
    emit()
  } catch { /* analytics must never break the app */ }
}

/** Cold start: init identity (rotates session), emit app_opened, then load the
 *  PERSISTED outbox and flush — queued events genuinely survive termination. */
export function startAnalyticsSession(): void {
  if (!ENABLED) return
  void initIdentity().then(async () => {
    track('app_opened')
    for (const emit of preInitQueue.splice(0)) emit()
    await loadOutbox()
    void flushRetryQueue()
  }).catch(() => { /* ignore */ })
}

/** Foreground return: rotate past the inactivity window; retained sessions
 *  still register activity (handled inside resumeBoundary); flush retries. */
export function foregroundBoundary(): void {
  if (!ENABLED || !identityReady()) return
  if (resumeBoundary()) track('app_opened')
  void flushRetryQueue()
}

/** Voice lifecycle activity marker — called at low-frequency lifecycle points
 *  (connect, completed turns, deliberate end), NEVER from the audio loop. */
export function voiceActivity(): void {
  if (!ENABLED) return
  touchActivity()
}

/** identity_linked requires a verified JWT (server enforces 401). The local
 *  once-guard is set only after confirmed delivery — where a database
 *  "duplicate" IS confirmation. DB unique (anon,user) index backs it all. */
export function linkIdentityOnce(userId: string, authToken: string | null): void {
  try {
    if (!ENABLED || !userId || !authToken) return
    const guard = `sc_evt_linked_${userId.toLowerCase()}`
    let already: string | null = null
    try { already = window.localStorage.getItem(guard) } catch { /* ignore */ }
    if (already) return
    const run = () => {
      const body = buildBody('identity_linked')
      // identity_linked binds to its EXPLICIT original user id: it can only
      // deliver under that account, and its guard can only be set by that
      // delivery — the anonymous identity can never link to the wrong account.
      dispatch(body, authToken, true, userId.toLowerCase(), guard)
    }
    if (identityReady()) run()
    else if (preInitQueue.length < 20) preInitQueue.push(run)
  } catch { /* ignore */ }
}

// ── Test seams (production-harmless) ─────────────────────────────────────────
export const __test = {
  init: initIdentity, // same single-flight promise this module's emitters observe
  setPlatform: __setPlatformForTests, // this module's session instance
  setEnabled(v: boolean) { ENABLED = v },
  setFetch(f: typeof fetch) { fetchImpl = f },
  queueSize() { return retryQueue.length },
  queueIds() { return retryQueue.map((i) => i.body.id) },
  clearQueue() { retryQueue.length = 0 },
  flush: flushRetryQueue,
  loadOutbox,
  persistChainDone: () => persistChain,
  dispatch,
  buildBody,
}
```

=== COMPLETE TEST FILE: tests/client-events.test.mjs ===
```js
// Client event delivery/retry/identity tests. Run: node tests/client-events.test.mjs
// Compiles session.ts + events.ts + apiBase.ts, then drives events via __test
// seams with a mocked fetch — no network, no storage side effects.
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const OUT = new URL('./.compiled-events/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
execSync(`npx tsc src/lib/session.ts src/lib/events.ts src/lib/apiBase.ts src/vite-env.d.ts --outDir ${OUT} --module esnext --target es2020 --moduleResolution bundler --skipLibCheck --types vite/client`, { stdio: 'inherit' })
// Node ESM needs explicit .js extensions on relative imports (tsc keeps them bare).
for (const f of readdirSync(OUT).filter((f) => f.endsWith('.js'))) {
  const p = `${OUT}/${f}`
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '(\.\/[^']+)'/g, (m, spec) => spec.endsWith('.js') ? m : `from '${spec}.js'`))
}

const results = []
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function makeStorage() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _raw: store,
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// JWT-shaped test token whose sub is the acting account (unverified decode target).
const makeJwt = (uuid) => `h.${Buffer.from(JSON.stringify({ sub: uuid })).toString('base64url')}.s`

let n = 0
let prevEvents = null
async function freshModules() {
  // Quiesce the previous instance so its in-flight async work (dispatches,
  // persist chain) cannot bleed into the next test's fresh storage.
  if (prevEvents) {
    prevEvents.__test.setEnabled(false)
    prevEvents.__test.setPlatform(null) // events.js shares ONE cached session module — clear native override
    prevEvents.__test.clearQueue()
    prevEvents.__test.setFetch(async () => ({ ok: true, status: 201, json: async () => ({ stored: true }) }))
    await prevEvents.__test.persistChainDone()
    await sleep(30)
  }
  globalThis.window = { localStorage: makeStorage(), location: { protocol: 'https:', host: 'test.local' } }
  globalThis.location = globalThis.window.location
  n++
  const session = await import(`${pathToFileURL(`${OUT}/session.js`).href}?n=${n}`)
  const events = await import(`${pathToFileURL(`${OUT}/events.js`).href}?n=${n}`)
  prevEvents = events
  return { session, events }
}

function mockFetch(script) {
  // script: array of responses or 'network-error'; repeats last entry when exhausted.
  let calls = 0
  const bodies = []
  const fn = async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    const step = script[Math.min(calls++, script.length - 1)]
    if (step === 'network-error') throw new Error('offline')
    return {
      ok: step.status < 400,
      status: step.status,
      json: async () => step.json ?? null,
    }
  }
  return { fn, bodies, calls: () => calls }
}

// 1. APP_VERSION fallback is strict '0.0.0' when build metadata is absent
{
  const { events } = await freshModules()
  check("missing build metadata → APP_VERSION '0.0.0'", events.APP_VERSION === '0.0.0', events.APP_VERSION)
}

// 2. Native platform selects Capacitor Preferences, never localStorage
{
  const { session } = await freshModules()
  const prefStore = new Map()
  let getCalls = 0, setCalls = 0
  session.__setPlatformForTests({
    isNative: true,
    prefs: {
      get: async ({ key }) => { getCalls++; return { value: prefStore.get(key) ?? null } },
      set: async ({ key, value }) => { setCalls++; prefStore.set(key, value) },
    },
  })
  await session.initIdentity()
  const anon = session.getAnonId()
  check('native: Preferences storage used (get+set called)', getCalls >= 1 && setCalls === 1)
  check('native: anon id stored in Preferences, not localStorage',
    prefStore.get('sc_anon_id') === anon && globalThis.window.localStorage._raw.get('sc_anon_id') === undefined)
  check('native: id is a valid UUID', UUID_RE.test(anon))
}

// 3. Duplicate response counts as successful delivery (identity guard sets)
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  const m = mockFetch([{ status: 202, json: { stored: false, reason: 'duplicate' } }])
  events.__test.setFetch(m.fn)
  events.linkIdentityOnce('user-guard-test', 'tok')
  await sleep(50)
  check('duplicate response sets identity_linked local guard',
    globalThis.window.localStorage._raw.get('sc_evt_linked_user-guard-test') === '1')
  check('duplicate delivery leaves queue empty', events.__test.queueSize() === 0)
}

// 4. Transient failure queues the ORIGINAL event id; retry succeeds, no duplicate id
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  const m = mockFetch(['network-error', { status: 201, json: { stored: true } }])
  events.__test.setFetch(m.fn)
  events.track('dish_saved')
  await sleep(50)
  const queuedIds = events.__test.queueIds()
  check('network failure queues exactly one event', queuedIds.length === 1 && UUID_RE.test(queuedIds[0]))
  await events.__test.flush()
  await sleep(20)
  check('retry sends the ORIGINAL id (no duplicate identity)',
    m.bodies.length === 2 && m.bodies[0].id === m.bodies[1].id)
  check('successful retry drains the queue', events.__test.queueSize() === 0)
}

// 5. 429 and 5xx are retriable
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  const m = mockFetch([{ status: 429 }, { status: 503 }])
  events.__test.setFetch(m.fn)
  events.track('dish_saved')
  await sleep(50)
  check('429 queues for retry', events.__test.queueSize() === 1)
}

// 6. Validation/auth 4xx are NEVER retried
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  const m = mockFetch([{ status: 400, json: { error: 'bad' } }])
  events.__test.setFetch(m.fn)
  events.track('dish_saved')
  await sleep(50)
  check('400 is not retried', events.__test.queueSize() === 0 && m.calls() === 1)
  const m2 = mockFetch([{ status: 401, json: { error: 'auth' } }])
  events.__test.setFetch(m2.fn)
  events.track('dish_saved', undefined, 'bad-token')
  await sleep(50)
  check('401 is not retried', events.__test.queueSize() === 0 && m2.calls() === 1)
}

// 7. Queue never exceeds 50
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  const m = mockFetch(['network-error'])
  events.__test.setFetch(m.fn)
  for (let i = 0; i < 80; i++) events.track('dish_saved')
  await sleep(200)
  check('retry queue bounded at 50', events.__test.queueSize() <= 50, `size ${events.__test.queueSize()}`)
}

// 8. Kill switch prevents queueing entirely
{
  const { events } = await freshModules()
  events.__test.setEnabled(false)
  await events.__test.init()
  const m = mockFetch(['network-error'])
  events.__test.setFetch(m.fn)
  events.track('dish_saved')
  await sleep(30)
  check('kill switch OFF: nothing sent, nothing queued', m.calls() === 0 && events.__test.queueSize() === 0)
}

// 9. App events and voice-frame identity share identical ids after init
{
  const { session } = await freshModules()
  const p1 = session.initIdentity()
  const p2 = session.initIdentity() // "voice" consumer awaits the same single-flight init
  await Promise.all([p1, p2])
  const appAnon = session.getAnonId(); const appSess = session.getSessionId()
  const voiceAnon = session.getAnonId(); const voiceSess = session.getSessionId()
  check('voice + app consumers share identical anon_id and session_id',
    appAnon === voiceAnon && appSess === voiceSess && UUID_RE.test(appAnon) && UUID_RE.test(appSess))
}

// ── Persistent outbox suite ──────────────────────────────────────────────────

// 10. A queued event survives a simulated cold start (web/localStorage)
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  const m = mockFetch(['network-error'])
  events.__test.setFetch(m.fn)
  events.track('dish_saved')
  await sleep(50)
  await events.__test.persistChainDone()
  const persisted = globalThis.window.localStorage._raw.get('sc_evt_outbox')
  check('web outbox persisted to localStorage', typeof persisted === 'string' && persisted.includes('dish_saved'))
  const originalId = JSON.parse(persisted)[0].body.id
  // Simulated cold start: NEW module instance, SAME storage.
  n++
  const events2 = await import(`${pathToFileURL(`${OUT}/events.js`).href}?n=${n}`)
  events2.__test.setEnabled(true)
  await events2.__test.init()
  const m2 = mockFetch([{ status: 201, json: { stored: true } }])
  events2.__test.setFetch(m2.fn)
  await events2.__test.loadOutbox()
  await events2.__test.flush()
  await events2.__test.persistChainDone()
  check('queued event survives cold start and delivers with ORIGINAL id',
    m2.bodies.length >= 1 && m2.bodies.some((b) => b.id === originalId))
  check('delivered event removed from persistent storage',
    !(globalThis.window.localStorage._raw.get('sc_evt_outbox') || '[]').includes(originalId))
}

// 11. Native queue uses Capacitor Preferences
{
  const { events } = await freshModules()
  const prefStore = new Map()
  events.__test.setPlatform({
    isNative: true,
    prefs: {
      get: async ({ key }) => ({ value: prefStore.get(key) ?? null }),
      set: async ({ key, value }) => { prefStore.set(key, value) },
    },
  })
  events.__test.setEnabled(true)
  await events.__test.init()
  const m = mockFetch(['network-error'])
  events.__test.setFetch(m.fn)
  events.track('dish_saved')
  await sleep(50)
  await events.__test.persistChainDone()
  check('native outbox persisted via Capacitor Preferences',
    (prefStore.get('sc_evt_outbox') || '').includes('dish_saved'))
  check('native outbox NOT in localStorage',
    globalThis.window.localStorage._raw.get('sc_evt_outbox') === undefined)
}

// 12-13. No token persisted; fresh context at retry; never anonymous; ACCOUNT-BOUND
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  const userA = '11111111-1111-4111-8111-111111111111'
  const userB = '22222222-2222-4222-8222-222222222222'
  const tokenA = makeJwt(userA)
  const m = mockFetch(['network-error'])
  events.__test.setFetch(m.fn)
  events.track('dish_saved', undefined, tokenA) // User A performs the action
  await sleep(50)
  await events.__test.persistChainDone()
  const persisted = globalThis.window.localStorage._raw.get('sc_evt_outbox') || ''
  check('no token appears in persisted queue data', persisted.length > 0 && !persisted.includes(tokenA))
  check('requiredUserId (User A) persisted with the authenticated item', persisted.includes(userA))
  // No session at all: stays pending, never anonymous.
  events.setAuthContextProvider(async () => null)
  const m2 = mockFetch([{ status: 201, json: { stored: true } }])
  events.__test.setFetch(m2.fn)
  await events.__test.flush()
  check('authenticated event never sent anonymously (no send without session)', m2.calls() === 0)
  check('authenticated event kept pending while auth may return', events.__test.queueSize() === 1)
  // USER B signs in: User A's event must NOT be sent with B's token.
  events.setAuthContextProvider(async () => ({ accessToken: 'token-of-user-B', userId: userB }))
  const mB = mockFetch([{ status: 201, json: { stored: true } }])
  events.__test.setFetch(mB.fn)
  await events.__test.flush()
  check("User A's queued event is NEVER sent using User B's token", mB.calls() === 0)
  check("event stays pending while User B is signed in", events.__test.queueSize() === 1)
  // USER A returns: fresh context fetched, delivery proceeds under A only.
  events.setAuthContextProvider(async () => ({ accessToken: 'fresh-token-of-A', userId: userA }))
  let seenAuth = null
  const m3 = { calls: 0 }
  events.__test.setFetch(async (_url, init) => {
    m3.calls++
    seenAuth = init.headers.Authorization ?? null
    return { ok: true, status: 201, json: async () => ({ stored: true }) }
  })
  await events.__test.flush()
  await events.__test.persistChainDone()
  check('event delivers when User A returns, with a FRESH token', m3.calls === 1 && seenAuth === 'Bearer fresh-token-of-A')
  check('storage cleared after account-bound delivery',
    !(globalThis.window.localStorage._raw.get('sc_evt_outbox') || '').includes('dish_saved'))
}

// 13b. identity_linked cannot link the anonymous identity to the wrong account
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  const userA = '33333333-3333-4333-8333-333333333333'
  const userB = '44444444-4444-4444-8444-444444444444'
  events.__test.setFetch(mockFetch(['network-error']).fn)
  events.linkIdentityOnce(userA, makeJwt(userA))
  await sleep(50)
  await events.__test.persistChainDone()
  // User B signs in: the queued link must not deliver, and A's guard must not set.
  events.setAuthContextProvider(async () => ({ accessToken: 'token-B', userId: userB }))
  const mB = mockFetch([{ status: 201, json: { stored: true } }])
  events.__test.setFetch(mB.fn)
  await events.__test.flush()
  check('identity_linked never delivered under a different account', mB.calls() === 0)
  check('identity_linked guard NOT set after foreign-account flush',
    globalThis.window.localStorage._raw.get(`sc_evt_linked_${userA}`) === undefined)
}

// 13c. Restored authenticated item WITHOUT requiredUserId is discarded safely
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  const orphan = { body: { id: '55555555-5555-4555-8555-555555555555', event: 'dish_saved', anon_id: '66666666-6666-4666-8666-666666666666', session_id: '77777777-7777-4777-8777-777777777777', app_version: '1.6.0' }, needsAuth: true, attempts: 1 }
  globalThis.window.localStorage.setItem('sc_evt_outbox', JSON.stringify([orphan]))
  const m = mockFetch([{ status: 201, json: { stored: true } }])
  events.__test.setFetch(m.fn)
  events.setAuthContextProvider(async () => ({ accessToken: 't', userId: '99999999-9999-4999-8999-999999999999' }))
  await events.__test.loadOutbox()
  await events.__test.flush()
  check('authenticated stored item without requiredUserId discarded, never sent',
    m.calls() === 0 && events.__test.queueSize() === 0)
}

// 13d. Tampered / unexpected persisted properties are discarded
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  const bad = [
    { body: { id: '55555555-5555-4555-8555-555555555550', event: 'dish_saved', anon_id: '66666666-6666-4666-8666-666666666660', session_id: '77777777-7777-4777-8777-777777777770', app_version: '1.6.0', evil_prop: 'x' }, needsAuth: false, attempts: 1 },
    { body: { id: '55555555-5555-4555-8555-555555555551', event: 'not_an_event', anon_id: '66666666-6666-4666-8666-666666666661', session_id: '77777777-7777-4777-8777-777777777771', app_version: '1.6.0' }, needsAuth: false, attempts: 1 },
    { body: { id: '55555555-5555-4555-8555-555555555552', event: 'dish_saved', anon_id: '66666666-6666-4666-8666-666666666662', session_id: '77777777-7777-4777-8777-777777777772', app_version: '1.6.0' }, needsAuth: false, attempts: 1, stolenToken: 'abc' },
  ]
  globalThis.window.localStorage.setItem('sc_evt_outbox', JSON.stringify(bad))
  const m = mockFetch([{ status: 201, json: { stored: true } }])
  events.__test.setFetch(m.fn)
  await events.__test.loadOutbox()
  await events.__test.flush()
  check('tampered/unexpected persisted items all discarded, never sent',
    m.calls() === 0 && events.__test.queueSize() === 0)
}

// 13e. Anonymous events continue to retry WITHOUT authentication
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  events.setAuthContextProvider(async () => null) // no session at all
  events.__test.setFetch(mockFetch(['network-error']).fn)
  events.track('dish_saved') // anonymous
  await sleep(50)
  let sawAuthHeader = 'unset'
  const m = { calls: 0 }
  events.__test.setFetch(async (_url, init) => {
    m.calls++
    sawAuthHeader = init.headers.Authorization ?? null
    return { ok: true, status: 201, json: async () => ({ stored: true }) }
  })
  await events.__test.flush()
  check('anonymous event retries without authentication', m.calls === 1 && sawAuthHeader === null)
}

// 14. Duplicate delivery removes the event from persistent storage
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  events.__test.setFetch(mockFetch(['network-error']).fn)
  events.track('dish_saved')
  await sleep(50)
  events.__test.setFetch(mockFetch([{ status: 202, json: { stored: false, reason: 'duplicate' } }]).fn)
  await events.__test.flush()
  await events.__test.persistChainDone()
  check('duplicate delivery removes event from outbox storage',
    events.__test.queueSize() === 0 && !(globalThis.window.localStorage._raw.get('sc_evt_outbox') || '').includes('dish_saved'))
}

// 15. 400 during flush removes the event (never retried)
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  events.__test.setFetch(mockFetch(['network-error']).fn)
  events.track('dish_saved')
  await sleep(50)
  events.__test.setFetch(mockFetch([{ status: 400, json: { error: 'bad' } }]).fn)
  await events.__test.flush()
  await events.__test.persistChainDone()
  check('rejected (400) event removed from outbox, not retried',
    events.__test.queueSize() === 0 && (globalThis.window.localStorage._raw.get('sc_evt_outbox') || '[]') === '[]')
}

// 16. Persisted queue remains capped at 50
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  events.__test.setFetch(mockFetch(['network-error']).fn)
  for (let i = 0; i < 80; i++) events.track('dish_saved')
  await sleep(250)
  await events.__test.persistChainDone()
  const stored = JSON.parse(globalThis.window.localStorage._raw.get('sc_evt_outbox') || '[]')
  check('persisted outbox capped at 50', stored.length <= 50 && events.__test.queueSize() <= 50, `stored ${stored.length}`)
}

// 17. Concurrent writers do not lose events
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  events.__test.setFetch(mockFetch(['network-error']).fn)
  await Promise.all(Array.from({ length: 10 }, async () => events.track('dish_saved')))
  await sleep(100)
  await events.__test.persistChainDone()
  const stored = JSON.parse(globalThis.window.localStorage._raw.get('sc_evt_outbox') || '[]')
  check('concurrent enqueues all persisted (serialized writer)', stored.length === 10, `stored ${stored.length}`)
}

// 18. Kill switch OFF: no new entries, no flushing, existing queue untouched
{
  const { events } = await freshModules()
  events.__test.setEnabled(true)
  await events.__test.init()
  events.__test.setFetch(mockFetch(['network-error']).fn)
  events.track('dish_saved')
  await sleep(50)
  await events.__test.persistChainDone()
  const before = globalThis.window.localStorage._raw.get('sc_evt_outbox')
  events.__test.setEnabled(false)
  const m = mockFetch([{ status: 201, json: { stored: true } }])
  events.__test.setFetch(m.fn)
  events.track('dish_shared', { channel: 'copy' }) // must not enqueue
  await events.__test.flush() // must not send
  await sleep(30)
  const after = globalThis.window.localStorage._raw.get('sc_evt_outbox')
  check('kill switch OFF: no sends, no new entries, existing outbox untouched',
    m.calls() === 0 && after === before && (after || '').includes('dish_saved'))
}

const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
```
