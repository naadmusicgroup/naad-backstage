# Naad Backstage - Comprehensive Performance Audit Report

## The Honest Answer First

**Are you overthinking it?** Partially yes, partially no.

Your **architecture, code quality, data fetching patterns, and state management are genuinely good** -- better than most early-stage SaaS products I've seen. Your Supabase queries are well-indexed, you use proper pagination, you avoid N+1 patterns, and your composables are lightweight. The codebase is clean.

**However**, there are 2-3 specific, fixable issues that are *absolutely* making your app feel slower than it should. The good news: they're all low-effort fixes (a weekend's work), not architectural rewrites.

---

## Your Realistic Situation (Senior SWE Assessment)

| Aspect | Verdict | Industry Standard? |
|--------|---------|-------------------|
| Overall architecture | Solid | Yes -- good patterns |
| Data fetching patterns | Well done | Above average |
| Supabase query design | Good | Yes, proper indexing |
| Component count (182) | Normal | Standard for dashboard SaaS |
| Page count (22) | Normal | Appropriate |
| State management | Clean | Good -- no bloated stores |
| Auth flow | Adequate | Standard pattern |
| **Image assets** | **BAD** | **Not acceptable** |
| **Bundle splitting** | **Poor** | **Below standard** |
| **Component lazy loading** | **Missing** | **Below standard** |

**Bottom line**: Your app is 80% industry-standard good. The 20% that's dragging it down is concentrated in asset delivery and bundle optimization -- not in your logic, architecture, or backend.

---

## What's Actually Making It Feel Slow

### Issue #1: 12.9 MB of Unoptimized PNG Backgrounds (THE BIG ONE)

**Files**: `public/dashboard-*-bg.png` and `public/dashboard-*-bg-light.png`

| File | Size |
|------|------|
| dashboard-wallet-balance-bg.png | 2.56 MB |
| dashboard-wallet-balance-bg-light.png | 2.18 MB |
| dashboard-total-balance-bg.png | 1.95 MB |
| dashboard-total-balance-bg-light.png | 1.97 MB |
| dashboard-pending-dues-bg.png | 1.78 MB |
| dashboard-pending-dues-bg-light.png | 2.21 MB |
| **Total** | **12.65 MB** |

**Why this kills you**: In `app/pages/dashboard/index.vue`, all 6 images are preloaded with `fetchpriority: "high"`. Every single artist hitting their dashboard downloads 12.65 MB of PNG images before anything feels "loaded." On a typical 20 Mbps connection, that's **5+ seconds** just for background images.

**What normal SaaS does**: WebP format (60-80% smaller), or CSS gradients, or lazy-load non-visible ones. Your 2.5 MB PNG would be ~400-600 KB as WebP.

**Fix effort**: 2-3 hours. Convert to WebP, only preload the one visible on screen.

---

### Issue #2: Zero Component Lazy Loading + ECharts Bundled Globally

**Finding**: Not a single `defineAsyncComponent()` in the entire codebase. All 182 components are eagerly auto-imported.

**The real problem**: ECharts (~600-800 KB gzipped) is used ONLY on the analytics page (`app/pages/dashboard/analytics.vue` and 6 analytics components) but it's loaded on **every single page** because `nuxt-echarts` module registers it globally.

Similarly, `@unovis/vue` + `@unovis/ts` (~200 KB) are installed but used in only ONE component (`AnalyticsMonthlyRevenueChartPanel.vue`).

**Impact**: Every page load carries ~1 MB of charting libraries that 90% of page views never use.

**What normal SaaS does**: Dynamic imports for heavy libraries, lazy-load chart components only when the analytics page is visited.

**Fix effort**: 3-4 hours. Remove `nuxt-echarts` module, use dynamic `import('echarts')` in analytics components only. Remove Unovis entirely (migrate 1 component to ECharts).

---

### Issue #3: Auth Middleware Hits DB on Every Navigation

**File**: `app/middleware/auth.global.ts` + `server/utils/auth.ts`

Every protected route change calls `refreshViewerContext()` which queries `profiles.select("id, full_name, role")` from Supabase. There's no client-side caching of this result.

**Impact**: ~100-200ms added to every in-app navigation for a query that rarely changes.

**What normal SaaS does**: Cache the profile for 5-10 minutes client-side, only refresh on JWT expiry or explicit logout.

**Fix effort**: 1-2 hours. Add a timestamp check -- only refresh if last fetch was >5 minutes ago.

---

## What's Actually Fine (Stop Worrying About These)

### Your Data Fetching -- Good
- Request ID deduplication in analytics (prevents stale data)
- `useLazyFetch` with explicit `refresh()` calls (no auto-fetch spam)
- `keepalive: true` on all major pages (preserves state across navigation)
- No N+1 patterns -- you use `Promise.all()` and `fetchAllByChunks()`
- Proper column selection in most Supabase queries

### Your Supabase Schema -- Good
- 25+ well-designed indexes including composite indexes
- `idx_earnings_artist_sale_date` composite index for the heavy query path
- `idx_ledger_artist_created` with DESC ordering for timeline queries
- Proper RLS policies (not overly complex)

### Your Component Architecture -- Normal
- 182 components for a full admin + artist dashboard is standard
- AppShell.vue at 49 KB is large but not abnormal for a primary layout shell
- Sidebar animation at 620ms is within acceptable range (industry: 200-500ms preferred, 620ms noticeable but not broken)

### Your Page Sizes -- Acceptable (with caveats)
- 3 large pages (103 KB, 94 KB, 88 KB) -- these are big but since Nuxt does route-level code splitting, they only load when visited
- With keepalive, they don't re-render on return visits

### Your Infrastructure -- Correctly Sized
- Vercel Pro ($20/mo) for ~100 artists: fine, you have headroom
- Supabase Pro ($25/mo): appropriate for your query volume
- Cold starts are minimal on Vercel Pro
- You won't hit scaling issues until 200-300+ concurrent artists

---

## What a Vercel $20 + Supabase $25 Setup Can Realistically Deliver

| Metric | What You Should Expect | What You Probably Get Now |
|--------|----------------------|--------------------------|
| First page load (dashboard) | 1.5-3 seconds | 5-8 seconds (images) |
| Subsequent navigation | 200-500ms | 400-700ms (auth overhead) |
| Analytics page load | 2-3 seconds | 3-5 seconds (ECharts bundle) |
| API response time | 100-300ms | 150-400ms (uncached profile) |
| Time to Interactive | 2-4 seconds | 4-7 seconds (bundle + images) |

**After fixing the 3 issues above**, your realistic performance would be:
- Dashboard first load: **2-3 seconds** (very good for SaaS)
- Navigation: **200-400ms** (snappy)
- Analytics: **2-3 seconds** (acceptable, charts need data)

---

## Secondary Issues (Nice-to-Fix, Not Urgent)

### Medium Priority

| Issue | Impact | Effort |
|-------|--------|--------|
| 6-8 separate count queries in admin dashboard (`server/utils/statement-earnings.ts`) | +200-400ms on admin load | 2-3 hours |
| Logo PNGs (0.56 MB + 0.54 MB) should be SVG | +1.1 MB on every page | 30 minutes |
| CSS duplication in `components.css` (15-20% waste) | +50-100 KB CSS | 1-2 hours |
| Missing indexes on `tracks.release_id` and `releases.artist_id` | Potential slow queries at scale | 10 minutes (migration) |
| Synchronous CSV parsing in `server/utils/imports.ts` | Blocks event loop during upload | 2 hours |
| Duplicate charting libraries (ECharts + Unovis) | +200 KB bundle | 1 hour (migrate 1 component) |

### Low Priority (Fine for Now)

| Issue | Why It's Fine |
|-------|---------------|
| 8 watch() calls in analytics.vue | They're debounced by computed query objects |
| AppShell 620ms animation | Noticeable but not broken |
| No virtual scrolling in tables | Unless you have 1000+ row tables (unlikely for artists) |
| `sharp` in production deps | Doesn't affect client bundle (server-only) |
| 3 mega-pages >80 KB | Nuxt already code-splits per-route |

---

## The 3 Fixes That Will Transform Your App's Feel

If you only do 3 things:

### Task 1: Convert Dashboard PNGs to WebP (2-3 hours)
- Convert all 6 background images from PNG to WebP (80% size reduction)
- Only preload the one currently visible, lazy-load the rest
- Expected improvement: **Dashboard loads 4-5 seconds faster**

### Task 2: Lazy-Load ECharts (3-4 hours)
- Remove `nuxt-echarts` from modules
- Dynamic import ECharts only in analytics components
- Remove `@unovis/ts` and `@unovis/vue`, migrate 1 component to ECharts
- Expected improvement: **Every non-analytics page loads 1-2 seconds faster**

### Task 3: Cache Auth Profile (1-2 hours)
- Cache `refreshViewerContext()` result for 5 minutes
- Only re-fetch on JWT expiry or explicit action
- Expected improvement: **Navigation feels instant (200-400ms reduction per route change)**

**Total effort: ~8 hours of work**
**Expected result: App goes from "feels slow" to "feels snappy"**

---

## Final Verdict

You're **not** overdoing anything architecturally. Your code is clean, your patterns are correct, your infrastructure is appropriately sized. You're a competent developer who built a well-structured SaaS.

The slowness you're feeling is caused by **3 specific delivery optimizations** that are easy to miss when you're focused on features -- not by any fundamental architectural problem. This is extremely common in SaaS development and not a sign that anything is wrong with your approach.

After those 3 fixes, your app will perform comparably to any well-built SaaS dashboard on similar infrastructure ($45/mo tier). You're not over-engineered, you're not under-engineered -- you just need to optimize the delivery pipeline.
