# ShareChef Analytics Phase 1 — Credential & Deployment Audit

Date: 2026-08-15 (night), America/New_York
Scope: read-only audit requested by reviewer after 14/14 validation PASS
Checkpoint: HEAD `1dc159d` (local only, NOT pushed). Kill switches OFF. No changes made during this audit.

## 1. Every code reference to SUPABASE_SERVICE_KEY

Executable code — `server.js` only:

- Line 81 — comment documenting the design ("Inserts use the service-role key so the table needs no RLS policies — clients have zero direct access").
- Line 114 — guard: `if (!EVENTS_ENABLED || !process.env.SUPABASE_SERVICE_KEY || !process.env.SUPABASE_URL) return null` — the client is never created unless the kill switch is ON and both values exist.
- Line 116 — `createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })`

Non-executable references: `tests/events.test.mjs:77` (deliberately passes empty string to test the not-configured path), `fix-log.md`, `SHARECHEF-VALIDATION-REPORT.md`, and stale diff copies under `_to_delete/`.

## 2. Server-only confirmation

Yes. All executable references are in `server.js` (Node/Express backend). `src/` (client code) contains zero references to `SERVICE_KEY`.

## 3. Exposure checks

- VITE_ variables: none involve the service key. The only analytics VITE vars are `VITE_EVENTS_ENABLED` / `VITE_EVENTS_DEBUG` (booleans).
- Client source: clean — no hits in `src/`.
- Client bundles: clean — no hits for `SERVICE_KEY` or `service_role` anywhere in `dist/`.
- Responses to users: `/api/events` returns only `{stored, reason}` or `{error: '<short message>'}`. No env values ever serialized into a response.
- Logs: all `console.error` calls log `error.message` strings from the Supabase/auth libraries, never env values. The only key-related log line is a presence check of `OPENAI_API_KEY` printed as "✓ configured / ✗ MISSING" — boolean only.

## 4. Exact database operation performed with the key

One operation: `db.from('app_events').insert(row)` inside `recordEvent()`. The row has already passed `validateEvent()` (strict allow-list; unknown properties reject the entire request). Client created with `persistSession: false`. No select, update, delete, or RPC anywhere in the analytics path.

## 5. Insert-only confirmation

In code, yes — the `eventsDb` client performs exactly one kind of operation: insert into `app_events`. Precision caveat the reviewer should note: the service-role key itself is omnipotent at the database level; the single-insert restriction is enforced by the code surface, not by the key. The code surface is one insert call behind a kill-switch guard.

## 6. Client-supplied user_id

Never accepted. `user_id` is set exclusively from `verifiedUserId`, which comes only from `supabaseAuth.auth.getUser(token)` on a server-verified JWT. A `user_id` field in the request body would fail validation as an unknown property (reject-based, nothing silently dropped). `identity_linked` without a verified token returns a hard 401.

## 7. Invalid-JWT handling

If an Authorization Bearer token is present and fails verification: `401 {error: 'invalid token'}` — request dead, no anonymous fallback. Only a completely absent token proceeds as anonymous attribution.

## 8. Railway environment-variable change effect

Not determinable from the repository — platform behavior. Known Railway behavior: the running process only sees new variables after a restart, and Railway applies variable changes via a redeploy of the service. Assume adding SUPABASE_SERVICE_KEY WILL restart/redeploy.

Blast-radius assessment if that happens:
- The redeploy builds from the pushed GitHub HEAD, which does NOT contain rev5 (checkpoint `1dc159d` is local-only). Current production code redeploys unchanged.
- Both kill switches are OFF, so no analytics code path activates.
- Net effect: one brief service restart — active voice sessions would drop and reconnect. No data exposure, no new code.

Options for the reviewer: (a) add the key now and accept one restart at a chosen low-traffic moment, or (b) bundle the key addition with the eventual planned deploy so there is a single restart total.

## 9. Validation script secrets

`scripts/validate-app-events.sql` is clean: no keys, tokens, passwords, or JWT-like strings. Only fixed test UUIDs (aaaaaaaa-…).

## 10. git status --short (nothing committed)

Modified: `fix-log.md`, `memory/projects/sharechef-ai.md`, `tsconfig.tsbuildinfo`
Untracked: `.claude/`, `DO-WITHOUT-ME.md`, `SHARECHEF-REVISION-5.md`, `SHARECHEF-VALIDATION-REPORT.md`, `_to_delete/`, `icon-backup-jul9.png`, `ipad-screenshots/`, `marketing/`, `ph-launch-screenshots/`, `scripts/validate-app-events.sql`, 2 stray vite timestamp files
Housekeeping note: a stale `.git/index.lock` exists — clear with `rm -f .git/index.lock` before the next commit.

## Verdict

STATUS: CREDENTIAL PATH SAFE
No client, bundle, response, or log exposure. user_id is JWT-derived only. Invalid JWT = hard 401. Single insert-only code path behind a kill switch. Open decision for reviewer: timing of the key addition relative to the inevitable Railway restart (option a or b above).
