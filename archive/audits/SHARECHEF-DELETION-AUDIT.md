# ShareChef — Account Deletion Audit (Read-Only)

Date: 2026-08-15 (late night), America/New_York
Scope: read-only account-deletion audit per reviewer instruction after privacy inventory approval.
Reviewer decisions already locked: raw app_events retention 12 months; Tracking NO; ATT NO; analytics must not be enabled until account deletion also removes associated analytics data; no unverified platform-log retention claims.
No files, SQL, Supabase, Railway, App Store Connect, or privacy-policy changes made.

## 1. Search results

- Delete-account UI: NONE (no hits in src/)
- Deletion routes/endpoints: NONE (no hits in server.js)
- Supabase Auth user deletion (`admin.deleteUser` or similar): NONE
- Email-only deletion instructions: YES — privacy.html: "To delete your account and all associated data, contact us at taibenor93@gmail.com and we will process your request within 30 days."
- Sign in with Apple: NOT OFFERED — auth is email/password via Supabase only. SIWA token-revocation requirement does not apply. Apple's in-app account-deletion requirement applies regardless.

## 2. Can users initiate full deletion inside ShareChef?

NO. The only path is email. Because ShareChef supports account creation and is live on the App Store, this is an Apple guideline 5.1.1(v) compliance gap that exists TODAY, independent of analytics.

## 3–4. Deletion behavior map + foreign keys (from repo migrations)

| Table | FK to auth.users | Behavior if auth user deleted |
|---|---|---|
| profiles | id → ON DELETE CASCADE | deleted |
| cook_sessions | user_id → ON DELETE CASCADE | deleted |
| micheli_memory | user_id → ON DELETE CASCADE | deleted |
| recipes | user_id → references auth.users(id), NO on-delete clause (= NO ACTION) | **BLOCKS the auth deletion while recipes exist** |
| recipe_verifications / recipe_audits / recipe_badges | recipe_id → recipes ON DELETE CASCADE | follow recipes only |
| shares | **migration NOT in repo** — table exists in production, code inserts into it | FK behavior UNKNOWN; verify against production |
| app_events | user_id → ON DELETE SET NULL | rows REMAIN (user_id nulled) — insufficient under reviewer rule |
| Storage files | no Supabase Storage usage anywhere in client or server | nothing to delete |

## 5. Safe analytics deletion procedure

1. Delete all `app_events` rows where `user_id = <deleted user>`.
2. Collect anon_ids from that user's `identity_linked` rows (before step 1, or from a prior select).
3. For each collected anon_id, delete the anonymous rows (`user_id IS NULL`) ONLY IF that anon_id has no `identity_linked` row pointing to a different, still-existing user.

Shared-device safety: the schema deliberately allows one anon_id to link to multiple accounts (unique index is per anon+user pair). Step 3's guard preserves User B's pre-login history when User A deletes on a shared device. Rows carrying B's user_id are never candidates.

## 6. Required local reset after deletion

- Clear persistent outbox `sc_evt_outbox` entries whose requiredUserId is the deleted account (a `clearQueue()` test seam already exists in events.ts).
- `supabase.auth.signOut()` — clear stored session (web localStorage / iOS Capacitor Preferences).
- ROTATE anon_id — the old one is server-linked to a deleted account; generate fresh.
- Rotate session_id.
- Clear the local identity-link guard so a future account on this installation links cleanly.

## 7. Service-role key exposure

Deletion must run entirely server-side behind JWT verification — the same pattern as /api/events. The key never appears in any response, log, or client path. Nothing in the proposed design exposes it; confirmed nothing existing does either.

## 8. Re-authentication / confirmation

None exists today (no deletion exists). Proposed requirement: valid JWT + fresh re-authentication (recent sign-in or password re-entry) + explicit typed confirmation in the UI before the destructive call.

## 9. Proposed implementation (NOT implemented)

A. In-app flow: Settings → "Delete my account" → explanation screen (what is deleted, irreversible) → typed confirmation → POST /api/account/delete with Bearer JWT → success → full local identity reset (item 6) → goodbye screen.

B. Server/database procedure (ordered to sidestep the recipes FK blocker without a migration):
1. Verify JWT → user X.
2. Delete app_events per the 3-step procedure above.
3. Delete shares where user_id = X (verify FK first — see blockers).
4. Delete recipes where user_id = X (cascades verifications/audits/badges).
5. `auth.admin.deleteUser(X)` (cascades profiles, cook_sessions, micheli_memory).
Alternative: a migration adding ON DELETE CASCADE to recipes.user_id simplifies ordering; app_events still needs explicit deletion either way.

C. 12-month purge: Supabase pg_cron daily job — `delete from app_events where occurred_at < now() - interval '12 months'`. Fallback if pg_cron unavailable on plan: scheduled Edge Function.

D. Privacy policy is updated only AFTER the deletion feature ships, so the policy never promises what the app cannot do.

## 10. Test plan (proposed)

- Endpoint: 401 without/invalid token; valid deletion removes every row class including analytics; User A's deletion preserves User B's user rows AND B-linked anon history (shared-device case); recipes-FK ordering verified; service key absent from all responses and logs.
- Purge: rows backdated >12 months removed; recent rows kept; run is idempotent.
- Client: account-bound outbox entries cleared; anon_id and session_id rotated; identity-link guard cleared; session signed out; UI blocks deletion without typed confirmation.

## Blockers

1. recipes.user_id FK is NO ACTION — auth deletion fails while recipes exist. Fix via ordered deletion (B above) or FK migration.
2. shares schema absent from repo — FK behavior must be verified against production before finalizing the procedure.
3. The in-app deletion feature itself must be built and shipped — it gates BOTH Apple compliance and the analytics enable (reviewer rule: analytics off until deletion removes associated analytics data).

STATUS: ACCOUNT DELETION AUDIT COMPLETE
NEXT SAFE ACTION: reviewer decides implementation order — the deletion feature is now on the critical path ahead of the privacy-policy publish and the analytics enable.
