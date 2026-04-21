# Naad Backstage

Nuxt 3 + Supabase foundation for the Naad Backstage royalty dashboard.

## Current scope

This first implementation pass includes:

- Nuxt 3 app scaffold with public, admin, and artist route shells
- Supabase auth wiring and route middleware
- Viewer context API for role-aware redirects
- Initial Supabase SQL migration for schema, helper functions, views, indexes, and core RLS

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Copy the environment template:

```bash
cp .env.example .env
```

3. Fill in your Supabase project values in `.env`.

4. Apply the SQL migration in `supabase/migrations/20260417214500_initial_schema.sql`.
   Then apply the later migrations in order, including `20260419010000_auth_security_hardening.sql`.

5. Start the app:

```bash
pnpm dev
```

## Useful commands

```bash
pnpm typecheck
pnpm build
pnpm test:guardrails
pnpm test:smoke
pnpm test:auth
```

## Auth regression checks

This project now has two auth/navigation regression layers:

- `pnpm test:guardrails`
  Verifies the repo-level invariants that protect SSR auth and route rendering.
- `pnpm test:smoke:install`
  Downloads the Chromium binary used by the smoke suite.
- `pnpm test:smoke:prepare`
  Creates or updates dedicated smoke admin/artist users through the Supabase service key.
- `pnpm test:smoke`
  Runs Playwright against artist/admin tab navigation and hard refresh behavior.

For the full flow, keep these values in `.env`:

- `SMOKE_ARTIST_EMAIL`
- `SMOKE_ARTIST_PASSWORD`
- `SMOKE_ADMIN_EMAIL`
- `SMOKE_ADMIN_PASSWORD`
- `SUPABASE_SECRET_KEY`
- optional `SMOKE_BASE_URL` if you want to target an already-running server instead of the default dedicated smoke server on `http://localhost:3100`

Recommended workflow while developing protected routes:

1. Run `pnpm test:guardrails` after middleware/composable/config edits.
2. Run `pnpm test:smoke:prepare` once after resetting or switching Supabase projects.
3. Run `pnpm test:smoke` before calling auth/navigation work done.
4. Run `pnpm test:auth` before merging larger dashboard/admin changes.

## Auth policy

These settings are intentionally split between Supabase and the app:

- Supabase owns:
  - JWT expiry: `1 hour`
  - Session lifetime: `7 days`
  - Password recovery email delivery
- The app owns:
  - role-aware redirects and route guards
  - 30-minute inactivity logout

Required manual Supabase dashboard settings for this repo:

1. Set JWT expiry to `1 hour`.
2. Set session lifetime to `7 days`.
3. Keep the site URL and redirect URLs aligned with `NUXT_PUBLIC_SITE_URL` and the smoke base URL you use.

Relevant env defaults already wired in repo:

- `NUXT_PUBLIC_INACTIVITY_TIMEOUT_MS=1800000`

## Next implementation slice

1. Add admin account provisioning routes.
2. Build the direct-to-storage CSV upload handshake.
3. Implement the ingestion review and commit transaction flow.
4. Wire wallet and payout actions to the ledger rules.
