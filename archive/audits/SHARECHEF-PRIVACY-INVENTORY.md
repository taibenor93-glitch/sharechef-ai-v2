# ShareChef Analytics Phase 1 — Privacy Inventory (Read-Only)

Date: 2026-08-15 (late night), America/New_York
Scope: exact data inventory for privacy disclosure, per reviewer instruction after local verification approval.
Source of truth: `supabase/migrations/20260815180000_create_app_events.sql` + `server.js` validation + `src/lib/events.ts` / `session.ts`. Nothing classified by guesswork.
No production, policy, or App Store Connect changes made.

## Data inventory — every field that can reach app_events

| Field | Fake example | Events | Identifies | Linked to signed-in user | Purpose | Apple data type |
|---|---|---|---|---|---|---|
| id (event UUID) | b3f2a1c0-4d5e-4f60-8a71-2b3c4d5e9c1d | all | one event row only | via row's user_id | Analytics (dedupe) | — (not personal) |
| event | dish_saved | all (12 fixed names, DB CHECK) | nothing | via row | Analytics | Product Interaction |
| anon_id | 7e41b2d3-55f6-4a78-9b01-c2d3e4f522aa | all | INSTALLATION — per-install UUID; web localStorage, iOS Capacitor Preferences | YES once identity_linked fires; same anon_id then coexists with user_id rows | Analytics | Identifiers → Device ID (app-scoped) |
| user_id | f09a8b7c-6d5e-4f30-a201-b3c4d5e677bc | any event from a signed-in client | ACCOUNT — Supabase auth UUID | YES by definition | Analytics | Identifiers → User ID |
| session_id | c2d83e4f-1a2b-4c5d-8e9f-0a1b2c3d41ef | all | session (rotates after 30 min idle) | via row | Analytics | Product Interaction |
| app_version | 1.6.0 | all (strict x.y.z; 0.0.0 = explicit unknown) | nothing | via row | Analytics + App Functionality | — (not personal) |
| occurred_at (server ts) | 2026-08-15T22:10:00Z | all (DB default now(), server-authoritative) | when | via row | Analytics | Product Interaction |
| reported_client_ts | 2026-08-15T22:09:58Z | optional, all | when (client clock) | via row | Analytics | Product Interaction |
| ingredient_count | 4 | ingredients_submitted, dish_proposed | nothing (0–99) | via row | Analytics | Product Interaction |
| channel | whatsapp | dish_shared | nothing (8 fixed values) | via row | Analytics | Product Interaction |
| turn_count | 12 | voice_session_ended / _disconnected | nothing (0–999) | via row | Analytics | Product Interaction |
| duration_seconds | 480 | voice_session_ended / _disconnected | nothing (0–86400) | via row | Analytics | Product Interaction |
| close_code | 1006 | voice_session_disconnected | nothing (raw WS code) | via row | Analytics (reliability) | Diagnostics → Other Diagnostic Data |

## Fields audited that do NOT exist

- "Dish source" — no such column or event property anywhere.
- Campaign / referral / UTM fields — none (only grep hits were HTML rel="noreferrer" attributes).
- Advertising ID (IDFA), vendor ID (IDFV), push-notification tokens, device fingerprints — none in client or server code.
- Content: no recipe text, ingredient names, messages, or voice content can enter app_events — counts and fixed enums only, enforced by DB CHECK constraints ("No content data by schema design" per table comment).

## Summary classifications

- APPLE DATA TYPES: Identifiers (User ID; Device ID for app-scoped anon_id), Usage Data (Product Interaction), Diagnostics (Other Diagnostic Data — conservative for close_code/duration).
- LINKED TO USER: YES — must be declared "Data Linked to You." The system is designed to link anonymous activity to accounts via identity_linked. anon_id must never be described as anonymous — pseudonymous-until-linked.
- TRACKING (Apple definition): NO — no third-party ad combination, no data brokers, no cross-app/site tracking. First-party analytics only.
- ATT REQUIRED: NO — ATT applies only to Apple-defined tracking, which does not occur.
- PROCESSORS: Supabase (stores app_events + auth; sees connection metadata/IPs in its own infra logs), Railway (hosts server; edge sees client IPs and request metadata under platform log retention), OpenAI (voice/chat content only — receives NO app_events data).

## Retention / deletion / infrastructure logging

- RETENTION: none implemented — no TTL, no purge job; rows persist indefinitely. Disclosure gap until a window is chosen.
- DELETION: partial — user_id is `on delete set null`: deleting the Supabase account unlinks user_id but rows remain keyed by anon_id. Policy offers manual account deletion by email (30 days); no automated app_events deletion exists.
- INFRASTRUCTURE LOGGING: console.error writes short error messages to Railway logs; voice logs include auth-state lines. IPs are never stored in app_events; req.ip is only an in-memory rate-limit fallback key (resets on restart). Railway/Supabase see IPs at their edges under their own retention — periods UNKNOWN (platform-side, not controlled by ShareChef code).

## Current disclosures

- PRIVACY POLICY: repo `public/privacy.html`, served at `/privacy.html` on the production domain. Last updated July 5, 2026.
  Sections requiring analytics updates (quoted):
  - "What we collect": "When you create an account, we collect your email address and login credentials… If you use voice features, your speech is transmitted to OpenAI… ShareChef does not permanently store your voice recordings." → no mention of usage analytics.
  - "How we use your data": "Your data is used only to provide ShareChef's features: generating recipes, powering voice conversations, saving your collection, and community sharing." → no longer fully accurate once analytics is enabled.
- APP STORE DECLARATIONS: UNKNOWN — not documented in the repo; must be read directly from App Store Connect before editing.

## Proposed changes — NOT published

Privacy policy, new "Usage analytics" section (draft):

> When analytics is enabled, we collect usage events about how the app is used — such as when the app is opened, a recipe is generated or saved, or a voice session starts and ends — together with a random installation identifier, a session identifier, your account ID when you are signed in, the app version, and timestamps. These events never contain your ingredients, recipes, messages, or voice content. We use them solely to understand and improve ShareChef; we do not use them for advertising and never share them with data brokers. They are stored with Supabase and processed on Railway.

Plus one retention sentence once the retention window is decided.

App Store Connect selections (draft):
- Data Linked to You → Identifiers: User ID ✓, Device ID ✓
- Data Linked to You → Usage Data: Product Interaction ✓
- Data Linked to You → Diagnostics: Other Diagnostic Data ✓ (conservative option)
- Purposes: Analytics ✓, App Functionality ✓
- Data Used to Track You: none. Tracking: No.

## Unresolved questions blocking accurate disclosure

1. Retention window for app_events — undefined; must be chosen (e.g., 24 months) before the policy sentence is written.
2. Deletion semantics — should account deletion hard-delete that user's app_events rows instead of only nulling user_id? Current set-null leaves linked-history rows keyed by anon_id.
3. Railway / Supabase platform log retention periods — verify before asserting anything in the policy.
4. Actual current ASC privacy selections — must be read from App Store Connect.

STATUS: PRIVACY INVENTORY COMPLETE
NEXT SAFE ACTION: reviewer rules on the four unresolved questions; only then finalize policy text and ASC selections. No external changes authorized or made.
