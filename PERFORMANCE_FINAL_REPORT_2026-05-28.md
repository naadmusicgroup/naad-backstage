# Performance Final Report - 2026-05-28

## Executive Summary

The site was not "perfect already", and you were not imagining everything. There were real performance risks in the architecture:

- Wallet totals previously depended on raw earnings scans.
- Some admin/artist pages were returning heavier payloads than the screen needed.
- Analytics charts were carrying chart-library cost that was larger than necessary.
- Some smoke coverage did not prove that both dashboard shells and safe controls still worked after optimization.

After the optimization pass, the local production build is in a much healthier place:

- The wallet path now uses the ledger-oriented view contract instead of repeatedly deriving wallet totals from raw earnings.
- Multiple API payloads were narrowed or moved toward rollups.
- ECharts is no longer shipped in the app bundle.
- Analytics charts now render through Unovis/SVG/local chart code.
- Guardrails now protect against accidentally reintroducing ECharts or unsafe financial query patterns.
- Artist and admin navigation/control smoke tests pass against the production preview.

The realistic remaining truth: authenticated SaaS dashboards with Supabase auth, SSR, data APIs, tables, and charts will not feel like a static landing page. A 2-4 second authenticated dashboard transition can be normal depending on network, cold starts, and database response. The goal should be "predictable and responsive", not "every private route loads in 300ms from every location."

Your current Vercel $20 plan and Supabase $25 plan are reasonable for this stage. I would not upgrade plans before real users prove a capacity problem. Keep measuring query timings, server timing, and route readiness after deployment.

## Latest Local-Only Verification

This latest check intentionally measured only the local production build. No hosted/Vercel verification was continued in this pass.

Local target:

- URL: `http://127.0.0.1:3117`
- Server: `.output/server/index.mjs`
- Local process: running and listening on port `3117`

Fast server ping:

- `/login` status: `200`
- `/login` local TTFB: `0.011796s`
- `/login` local total response: `0.011932s`

Dashboard smoke checks:

- Artist authenticated navigation: passed.
- Admin authenticated navigation: passed.
- Artist safe dashboard controls: passed.
- Admin safe dashboard controls: passed.
- Result: `4 passed`.

Fresh local authenticated timing:

- Artist login page ready: `651ms`.
- Artist sign-in to dashboard ready: `2119ms`.
- Artist analytics ready: `2432ms`.
- Artist analytics chart render: `2` chart-sized SVGs, `239` chart primitives.
- Admin login page ready: `650ms`.
- Admin sign-in to dashboard ready: `1867ms`.
- Admin analytics ready: `2172ms`.
- Admin analytics chart render: `6` chart-sized SVGs, `311` chart primitives.

Local code-health checks:

- `pnpm test:guardrails`: passed.
- `pnpm typecheck`: passed.
- ECharts runtime search: no matches in app/package/build paths, excluding the intentional guardrail script that blocks ECharts from coming back.
- Dashboard card art network check: Chrome downloaded `3` AVIF dashboard images totaling about `357.3KB`, and downloaded `0` dashboard PNG files.

Local interpretation:

- The local production build is responding quickly at the server level.
- Authenticated dashboard readiness is now around `1.9-2.4s` locally, which is normal/healthy for a private SaaS dashboard with auth, SSR, API calls, hydration, tables, and charts.
- The current local state does not look like a broken or unusually slow SaaS dashboard.
- The old `12.65MB` dashboard PNG concern is not currently happening in modern local Chrome. The large PNG files remain only as compatibility fallbacks; the actual local browser path uses optimized AVIF images.

## What Was Finished In This Slice

### 0. Dashboard Background Image Delivery

Status: verified and protected.

What the older audit claimed:

- Six dashboard PNG backgrounds could total around `12.65MB`.
- Those images were described as all being eagerly/high-priority loaded.

What the current local app actually does:

- Uses `<picture>` with AVIF first, WebP second, and PNG only as fallback.
- Marks only the primary wallet card image as eager/high priority.
- Keeps the other dashboard card art lazy/normal priority.
- In local Chrome, the dashboard downloaded `0` dashboard PNG files on initial artist dashboard load.
- Actual dashboard card art downloaded: about `357.3KB` total AVIF.

What changed now:

- Added `scripts/check-performance-guardrails.mjs`.
- Added it to `pnpm test:guardrails`.
- The guardrail prevents losing AVIF/WebP dashboard assets, prevents oversized optimized dashboard art, and prevents reintroducing preload-all/eager-all dashboard art behavior.

Interpretation:

- This issue is not an active local bottleneck anymore.
- Keeping the PNG fallbacks in `public/` is okay; what matters is that modern browsers do not download them during the normal dashboard path.

### 1. Charts / ECharts Cost

Status: done for this phase.

What changed:

- Removed ECharts dependency usage from the app runtime.
- Kept the chart UI concept intact.
- Converted analytics chart rendering to Unovis/SVG/local chart components.
- Preserved the dashboard and analytics UI instead of deleting chart sections.
- Added financial/chart guardrails so ECharts dependencies do not quietly come back.

Verification:

- Source/package/build search found no ECharts runtime code in generated client/server output.
- The only remaining `echarts` text is inside `scripts/check-financial-guardrails.mjs`, where it is intentionally used to block ECharts from returning.
- `pnpm test:guardrails` passed.
- Production build passed.
- Local chart render check found non-empty SVG charts:
  - Artist dashboard: 1 chart-sized SVG, 24 chart primitives.
  - Artist analytics: 2 chart-sized SVGs, 239 chart primitives.
  - Admin analytics: 6 chart-sized SVGs, 311 chart primitives.

Current built chart cost:

- Shared chart chunk used by dashboard/analytics: about 199.0 kB raw, 64.2 kB gzip.
- Analytics Unovis chunk: about 443.9 kB raw, 121.4 kB gzip.
- Artist dashboard route preloaded assets: about 973.6 kB raw, 309.9 kB gzip.
- Artist analytics route preloaded assets: about 1425.1 kB raw, 426.7 kB gzip.
- Admin dashboard route preloaded assets: about 827.5 kB raw, 262.0 kB gzip.
- Admin analytics route preloaded assets: about 1406.3 kB raw, 421.8 kB gzip.

Interpretation:

- The ECharts problem is handled.
- The analytics pages still have real chart-library cost, but it is now scoped to analytics-heavy pages and is acceptable for this dashboard type.
- If we later chase another chart win, the best next step is route/component lazy loading for below-the-fold analytics modules, not deleting charts or redesigning UI.

### 2. Auth/Profile Navigation Overhead

Status: fixed and verified locally.

What the older audit claimed:

- Protected navigation was repeatedly refreshing viewer/profile context.
- That could add about `100-200ms` to every route change.

What the current evidence showed before this fix:

- `/api/me` was already not being called during normal client-side artist/admin navigation.
- The outdated part of the audit was the profile DB query claim.
- The real remaining overhead was Supabase Auth verification: each protected route click made `2` `GET /auth/v1/user` calls.

What changed:

- `app/composables/useViewerContext.ts` now keeps a short, bounded client auth-user-id cache.
- It prefers already hydrated Supabase user/session state before calling `supabase.auth.getUser()`.
- It clears that cache when viewer context is cleared.
- Server-side auth and API authorization are unchanged.
- Added auth guardrails so this optimization does not silently regress.

Before/after local browser evidence:

- Before: every artist/admin protected route navigation made `2` Supabase `GET /auth/v1/user` calls.
- After: the same artist/admin route set made `0` `/api/me` calls and `0` Supabase `GET /auth/v1/user` calls during protected client navigation.

Verification:

- `pnpm test:guardrails`: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- Local production preview restarted on `http://127.0.0.1:3117`.
- Local smoke tests passed:
  - Artist authenticated navigation.
  - Admin authenticated navigation.
  - Artist safe dashboard controls.
- Admin safe dashboard controls.

### 3. Route Bundle / Visible Link Prefetch

Status: fixed and verified locally.

What was happening:

- The dashboard shells render many visible `NuxtLink` routes in sidebars and dashboard shortcut cards.
- Nuxt was still using viewport/visibility prefetch for those links.
- That meant an artist landing on `/dashboard` could also download chunks for routes they had not opened yet, including analytics-heavy code.
- The first attempted config only set `interaction: true`; Nuxt merged the default `visibility: true` back in, so it did not improve the generated build.

What changed:

- `nuxt.config.ts` now explicitly sets NuxtLink defaults to `prefetchOn: { visibility: false, interaction: true }`.
- The generated production entry was checked and now contains `prefetchOn:{visibility:!1,interaction:!0}`.
- The artist dashboard home chart is now a lazy component, so the dashboard route lists it as a dynamic import instead of a static page import.
- Admin dashboard tables are now lazy components, preserving the same UI while keeping table code out of the first route import graph.
- Added performance guardrails so these loading choices do not quietly regress.

Before/after local route bundle evidence:

| Route | Before JS | After JS | Change |
| --- | ---: | ---: | ---: |
| Artist `/dashboard` | 1,758.7 KB / 77 files | 979.5 KB / 48 files | -779.2 KB, -29 files |
| Artist `/dashboard/analytics` | 1,758.7 KB / 77 files | 1,422.2 KB / 47 files | -336.5 KB, -30 files |
| Admin `/admin` | 1,750.2 KB / 72 files | 833.5 KB / 45 files | -916.7 KB, -27 files |
| Admin `/admin/analytics` | 1,750.2 KB / 72 files | 1,392.4 KB / 39 files | -357.8 KB, -33 files |

Fresh local static route weights after this fix:

| Route | Static total | JS | CSS | Images | Fonts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Artist `/dashboard` | 1,597.2 KB | 979.5 KB | 106.2 KB | 374.4 KB | 137.1 KB |
| Artist `/dashboard/analytics` | 1,715.0 KB | 1,422.2 KB | 138.7 KB | 17.0 KB | 137.1 KB |
| Admin `/admin` | 1,057.0 KB | 833.5 KB | 69.4 KB | 17.0 KB | 137.1 KB |
| Admin `/admin/analytics` | 2,020.8 KB | 1,392.4 KB | 94.4 KB | 396.9 KB | 137.1 KB |

Interpretation:

- This was a real bottleneck, and it is now materially better.
- The normal dashboard pages no longer behave like they are preloading the analytics workspace just because the analytics link is visible.
- Analytics pages remain heavier because they actually contain charts, map data, filters, and visual summaries. That is expected for those pages.

## Local Production Timing

Measured against fresh local production preview:

- URL: `http://127.0.0.1:3117`
- Build: fresh `pnpm build`
- Server: `.output/server/index.mjs`

Raw server timing with `curl`:

- `/login` local TTFB: about 13-20 ms.
- `/login` local total response: about 13-21 ms.

Browser page load:

- `/login`: about 149 ms load.
- `/`: about 65 ms load.

Authenticated browser timing:

- Local artist login page load: about 120 ms.
- Local artist sign-in to dashboard ready: about 3233 ms.
- Local artist analytics ready: about 2273 ms.
- Local admin login page load: about 114 ms.
- Local admin sign-in to dashboard ready: about 2760 ms.
- Local admin analytics ready: about 2790 ms.

Interpretation:

- Local server rendering is fast.
- The remaining 2-3 seconds after sign-in is mostly auth, client hydration, Supabase/API calls, and rendering real dashboard state.
- This is not "broken slow" for a private SaaS dashboard, but it is worth continuing to monitor after deployment.

## Hosted Timing

Measured against current live site:

- URL: `https://naadbackstage.com`
- Important: this live site may not include the latest local optimized build, because a fresh Vercel deployment could not be created from this machine without Vercel CLI auth/token.

Raw hosted server timing with `curl`:

- `/login` hosted TTFB runs:
  - 1.480 s
  - 1.004 s
  - 0.917 s

Browser page load:

- `/login`: about 1475 ms in one run.
- `/`: about 1195 ms in one run.

Authenticated hosted timing:

- Hosted artist current deployment:
  - Login page load: about 1212 ms.
  - Sign-in to dashboard ready: about 5600 ms.
  - Analytics ready: about 5819 ms.
- Hosted admin current deployment:
  - Login page load: about 2055 ms.
  - Sign-in to admin dashboard ready: about 2567 ms.
  - Admin analytics ready: about 4723 ms.

Interpretation:

- Hosted first response is much slower than local, which is expected with remote serverless hosting, TLS, region distance, and possible cold starts.
- The current hosted deployment is the thing that can feel slow to you right now.
- The optimized local build needs to be deployed before we can honestly say the hosted site has the same improvements.

## Fresh Vercel Preview Timing

After the first report pass, Vercel CLI auth was available through `npx vercel`, so a preview deployment was created and measured.

Preview deployment:

- URL: `https://naad-backstage-9pc06my5a-naad-music-group.vercel.app`
- Vercel deployment id: `dpl_ADr1WQPcNMMcrLaAZbHANqarnQxx`
- Target: preview
- Status: ready
- Region shown by Vercel: Washington, D.C., USA (`iad1`)

Important hosted issue discovered:

- The first preview build used `NUXT_PUBLIC_SUPABASE_URL=https://auth.naadmusicgroup.com`.
- Public DNS currently returns NXDOMAIN for `auth.naadmusicgroup.com`.
- That caused browser login to fail with `ERR_NAME_NOT_RESOLVED`.
- The direct Supabase project host `https://sciakpbtgsfcosngthai.supabase.co` resolves correctly.
- I updated the Vercel Preview environment variable `NUXT_PUBLIC_SUPABASE_URL` to the canonical Supabase project URL and redeployed preview.

This is not only a performance detail. If production is still configured to use `auth.naadmusicgroup.com`, fresh user login can fail until either:

- DNS for `auth.naadmusicgroup.com` is restored correctly, or
- Production `NUXT_PUBLIC_SUPABASE_URL` is switched to `https://sciakpbtgsfcosngthai.supabase.co` and production is redeployed.

Fresh preview raw `/login` timing through Vercel authenticated curl:

- Run 1: TTFB `0.847s`, total `0.847s`
- Run 2: TTFB `0.546s`, total `0.546s`
- Run 3: TTFB `0.802s`, total `0.802s`

Fresh preview authenticated browser timing through Vercel protection bypass:

- Preview artist:
  - Login page ready: `5203ms`
  - Sign-in to dashboard ready: `11927ms`
  - Analytics ready: `6331ms`
  - Artist analytics chart render: 2 chart-sized SVGs, 239 primitives.
- Preview admin:
  - Login page ready: `2121ms`
  - Sign-in to admin dashboard ready: `3963ms`
  - Admin analytics ready: `5103ms`
  - Admin analytics chart render: 6 chart-sized SVGs, 311 primitives.

Interpretation:

- Preview is now running the optimized build and can log in after the Supabase URL fix.
- Preview first-request numbers are still slower than local because they include Vercel protection, remote serverless runtime, network distance, Supabase auth, and real dashboard API work.
- The artist sign-in run was unusually slow and should be remeasured after warmup before treating `11.9s` as the normal steady-state number.
- Admin preview timing is closer to the expected hosted SaaS range: roughly `4-5s` for authenticated dashboard/analytics readiness from this machine.

## Test Results

Passed:

- `pnpm typecheck`
- `pnpm test:guardrails`
- `pnpm build`
- `SMOKE_BASE_URL=http://127.0.0.1:3117 pnpm exec playwright test tests/smoke/auth-navigation.spec.ts tests/smoke/dashboard-controls.spec.ts --reporter=list`

Smoke test coverage now includes:

- Artist navigation routes stay authenticated after click and refresh.
- Admin navigation routes stay authenticated after click and refresh.
- Artist dashboard safe controls:
  - Theme toggle.
  - Sidebar label toggle.
  - Notification menu open.
  - Revenue chart range selector open.
  - Analytics reset filters.
  - Settings section tabs.
- Admin dashboard safe controls:
  - Theme toggle.
  - Sidebar label toggle.
  - Admin dashboard tabs.
  - Admin analytics period selector open.
  - Admin artist workspace tabs.

Warnings observed during build:

- Tailwind sourcemap warnings.
- Node `DEP0155` package export warnings from third-party packages.

These are not build failures and are not the reason for dashboard load time.

## Remaining Realistic Risks

1. Hosted deployment is not yet measured with the optimized local build.

The local build is optimized and verified. The current hosted numbers may still reflect the older deployment. Deploy first, then remeasure.

2. Analytics pages are still the heaviest pages.

This is normal because they show maps, trend charts, platform charts, leaderboards, filters, and rollups. The cost is acceptable now, but analytics remains the natural next place to lazy-load below-the-fold sections if you want another improvement.

3. Serverless cold starts and region distance can make Vercel feel slower than local.

The hosted `/login` TTFB around 0.9-1.5 seconds is not a local code-render problem. It is hosting/network/runtime behavior. Vercel Pro is still reasonable at this stage, but the app should be tested from the region where users are.

4. Dummy data was enough to expose query shape, but not enough to prove future scale.

The dummy data did not waste the work. It helped prove correctness and discover bad query shapes. But real growth should be watched with Supabase query stats and slow query logs.

## Recommendation

You are not overdoing it by asking for this audit. The app had real issues worth fixing. But after this pass, the situation is much more normal for an early SaaS dashboard.

Next practical order:

1. Deploy this optimized build to Vercel.
2. Fix production Supabase auth hostname before or during production deployment.
3. Rerun production timing on artist dashboard, admin dashboard, and analytics.
4. If hosted analytics still feels heavy, lazy-load below-the-fold analytics modules.
5. Keep the chart library as Unovis for now.
6. Do not upgrade Vercel/Supabase plans until real metrics show capacity pressure.
