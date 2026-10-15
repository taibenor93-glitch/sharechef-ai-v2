# ShareChef — Production Deletion Schema Check (Read-Only)

Date: 2026-08-16 morning, America/New_York
Method: metadata-only queries run by Tai in the Supabase SQL editor (project ShareChef3, production), results read from screen. No user records read; nothing created or modified.

STATUS: DELETION SCHEMA VERIFIED

## SHARES SCHEMA (production — migration absent from repo)

| Column | Definition |
|---|---|
| id | uuid NOT NULL DEFAULT gen_random_uuid() — PRIMARY KEY [shares_pkey] |
| user_id | uuid NOT NULL DEFAULT auth.uid() — FK [shares_user_id_fkey] → auth.users ON DELETE CASCADE |
| recipe_id | text (nullable) — plain text, NOT a foreign key to recipes |
| channel | text NOT NULL DEFAULT 'native' |
| created_at | timestamptz NOT NULL DEFAULT now() |

## AUTH-USER FOREIGN KEYS (production, complete list — 6 total)

| Table | Constraint | ON DELETE |
|---|---|---|
| app_events | app_events_user_id_fkey | SET NULL |
| cook_sessions | cook_sessions_user_id_fkey | CASCADE |
| micheli_memory | micheli_memory_user_id_fkey | CASCADE |
| profiles | profiles_id_fkey | CASCADE |
| recipes | recipes_user_id_fkey | **CASCADE** |
| shares | shares_user_id_fkey | CASCADE |

## PRODUCTION / REPO DRIFT

1. **recipes.user_id — GOOD drift:** repo migration has no ON DELETE clause (NO ACTION), production has CASCADE. The previously flagged deletion blocker does not exist in production. Repo migration is stale; production was evidently corrected outside the repo.
2. **shares — missing from repo:** table exists in production with the schema above; no migration file exists. recipe_id is text, so shares never block recipe deletion.
3. **Verified-engine FKs absent in production:** recipe_verifications / recipe_audits / recipe_badges (repo migrations, FKs to recipes) do not appear in production's FK list — those tables likely were never applied to production. Not a deletion blocker; flag for repo hygiene later.

## RECIPES CONSTRAINT
`recipes_user_id_fkey` — ON DELETE CASCADE (production).

## APP_EVENTS CONSTRAINT
`app_events_user_id_fkey` — ON DELETE SET NULL (matches repo migration exactly).

## PG_CRON
- AVAILABLE: yes — version 1.6.4 offered on this instance.
- ENABLED: **no** — extension not installed; cron schema does not exist (consistent).
- EXISTING CRON JOBS: none (schema absent).

## 12-MONTH PURGE FEASIBILITY
FEASIBLE. pg_cron is available and can be enabled via a migration (`create extension pg_cron;`) or the dashboard's Extensions page, then one scheduled job: daily `delete from app_events where occurred_at < now() - interval '12 months'`. To be installed only with the approved implementation — nothing installed now.

## SAFE DELETION SEQUENCE (retry-safe, per reviewer's privacy-first correction)

1. Verify JWT → User A. Require fresh re-authentication + typed confirmation.
2. Collect A's anon_ids: `select distinct anon_id from app_events where user_id = A` (covers identity_linked and all attributed rows).
3. Delete analytics: `delete from app_events where user_id = A or anon_id in (<collected>)` — removes ALL rows for those installation ids, including other household members' analytics rows on shared devices (reviewer-approved: privacy over preservation; functional data of others untouched by design since it is keyed by their user_id).
4. `auth.admin.deleteUser(A)` — production CASCADEs handle everything functional in one step: profiles, cook_sessions, micheli_memory, recipes, shares.
5. Client local reset: clear account-bound outbox entries, sign out, rotate anon_id + session_id, clear identity-link guard.

Retry safety: steps 2–3 are idempotent (re-running deletes nothing new); if step 4 fails, retry it alone — analytics already gone, which is the correct failure mode (privacy-safe). No ordering hazard remains because recipes CASCADE in production.

## BLOCKERS
None remaining for the deletion feature itself. Two hygiene notes (not blockers): repo needs a catch-up migration documenting recipes CASCADE + shares schema; verified-engine tables absent from production.

NEXT SAFE ACTION: reviewer sign-off on this report → then build the deletion flow locally (server endpoint + Settings UI + local reset + tests), still without touching production.
