# ShareChef Analytics Phase 1 — app_events Validation Report

Date: 2026-08-15 (night), America/New_York
Checkpoint: local commit `1dc159d` (NOT pushed, push would deploy)
Kill switches: client `VITE_EVENTS_ENABLED` absent from .env (OFF, verified); server `EVENTS_ENABLED` unset on Railway (OFF by code default)
Environment: production Supabase, project ShareChef3

## What was run

`scripts/validate-app-events.sql` — the full self-cleaning validation battery — pasted whole into the Supabase SQL editor and run once against the live production database, after the migration pair (`create_app_events` + `revoke_app_events_client_access`) had been applied.

## Results — 14/14 PASS

| seq | test | result | detail |
|-----|------|--------|--------|
| 1 | valid service-role insert succeeds | PASS | |
| 2 | duplicate event UUID rejected | PASS | unique_violation as expected |
| 3 | duplicate identity link rejected | PASS | unique_violation as expected |
| 4 | duplicate intro per user rejected | PASS | unique_violation as expected |
| 5 | invalid event name rejected | PASS | check_violation as expected |
| 6 | invalid UUID rejected | PASS | invalid uuid syntax as expected |
| 7 | invalid app_version rejected | PASS | check_violation as expected |
| 8 | anon cannot read | PASS | permission denied as expected |
| 9 | anon cannot insert | PASS | permission denied as expected |
| 10 | authenticated cannot read | PASS | permission denied as expected |
| 11 | authenticated cannot insert | PASS | permission denied as expected |
| 12 | privileged insert still works after role tests | PASS | |
| 13 | FINAL: app_events row count must be 0 | PASS | rows=0 |
| 14 | FINAL: existing tables unchanged | PASS | profiles=5 recipes=5 shares=0 cook_sessions=4 micheli_memory=4 |

## Interpretation

- Service-role write path works; all four uniqueness/idempotency constraints enforce correctly (event UUID, identity link per anon/user pair, Micheli intro per user).
- Schema checks reject invalid event names, malformed UUIDs, and non-semver app versions.
- Client lockdown is total: both `anon` and `authenticated` roles are denied SELECT and INSERT. Only the privileged server path can touch the table.
- The script cleaned up after itself: `app_events` back to 0 rows, all five existing tables untouched at their known counts (5/5/0/4/4). Zero residue in production.

## Current state after validation

- Nothing pushed, nothing deployed, no env vars changed.
- Both kill switches remain OFF.
- Worktree note: `scripts/validate-app-events.sql` is untracked — it will be committed with the next checkpoint.

## Request to reviewer

Validation battery passed 14/14 against production. Requesting approval to proceed to the next gated step: adding `SUPABASE_SERVICE_KEY` to Railway (switches stay OFF; no deploy until its own Go). Flag anything in the results or interpretation that blocks approval.
