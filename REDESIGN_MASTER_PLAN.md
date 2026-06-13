# NAAD BACKSTAGE — REDESIGN MASTER PLAN
### Codename: "The Label Desk" · v2 (definitive)

**What this is:** the complete, reviewable specification for taking Naad Backstage
to top-tier premium quality — every token, component, page (artist + admin + auth),
animation, library decision, and the order to build it in. Written against the real
codebase (file paths included), so any reviewer can verify each claim.

**The one-sentence direction:** *Naad Backstage is the back office of a prestige
record label — paper, ink, and bronze foil; ledgers and liner notes — never glass,
neon, or sci-fi.*

**The anti-goal (read first):** no AI-slop. Concretely banned: purple/teal gradients,
glassmorphism on light surfaces, colored glow halos, floating particles, 3D blob
illustrations, looping ambient animations, confetti, emoji-as-icons, generic
hero-with-gradient-text. Premium = restraint + craft + real information.

---

## 0. How to review this plan

Each section ends with **✓ Done-when** criteria. A reviewer (human or Codex) should
check: (a) the spec is internally consistent with §2 tokens, (b) implementation
matches the named files, (c) nothing violates the anti-goal list.

Current ground truth this plan builds on:
- Tokens: `app/assets/css/tailwind.css` · component CSS: `app/assets/css/components.css`
- Depth/surface system: `app/assets/css/cream-glass.css`
- Primitives: `app/components/ui/*` (reka-ui/shadcn-vue, 26 families)
- App components: `app/components/*` (StatCard, DataTable, OperationsRing, SignalHeatmap,
  PremiumAudioPlayer, DashboardBento, WorkspaceFolderGrid, MoneyValue, StatusBadge…)
- Artist pages: `app/pages/dashboard/{index,analytics,releases,uploaded,statements,wallet,publishing,notifications,settings}.vue`
- Admin pages: `app/pages/admin/{index,analytics,artists,releases,earnings,payouts,dues,invites,ingestion,publishing,settings}.vue`
- Auth: `app/pages/login.vue`, `app/pages/auth/{admin-mfa,callback,reset-password}.vue`
- Error/404: `app/error.vue`, `app/pages/[...slug].vue`

---

# PART I — FOUNDATIONS

## 1. Color system

Keep the warm monochrome + single bronze accent. Formalize it so no future change
can drift.

### 1.1 Ink scale (replaces ad-hoc foreground opacities)
Define once in `tailwind.css`, use everywhere instead of `color-mix` improvisation:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ink-1` | `#0a0a0a` | `#f4eedf` | Headings, primary figures |
| `--ink-2` | 78% ink | 78% ivory | Body text |
| `--ink-3` | `#5f5548` | `#a49b8b` | Secondary text, labels |
| `--ink-4` | 38% ink | 38% ivory | Placeholders, disabled text |
| `--line-1` | 14% ink | 12% ivory | Standard hairlines (`--border`) |
| `--line-2` | 8% ink | 7% ivory | Sub-hairlines inside tables |

### 1.2 Bronze (the only accent)
| Token | Light | Dark |
|---|---|---|
| `--priority` | `#8a6a28` | `#d8ad25` |
| `--priority-hover` | `#b08d3a` | `#e7bf35` |
| `--priority-soft` (new) | bronze 10% on card | gold 12% on card |
| `--priority-edge` (new) | bronze 40% | gold 50% |

**Accent law (enforceable):** bronze may appear as (1) the primary button, (2) the
active nav/tab indicator, (3) focus ring, (4) progress fills, (5) one highlighted
chart series, (6) `kbd` keycap borders. Nowhere else. Max one filled-bronze element
per viewport. Status colors (`--status-success/warning/info`, `--destructive`)
appear **only** inside `StatusBadge`/`Badge`/inline alerts — never as panel borders,
icon tints, or backgrounds.

### 1.3 Canvas depth (new, subtle)
- Light: `background: linear-gradient(180deg, #f3efe6 0%, #f1ede4 240px)` on body.
- Dark: `linear-gradient(180deg, #14130f 0%, #12110f 240px)` — lamplight-on-desk warmth.
- Paper grain: one body-level pseudo-element, tiled SVG turbulence, **2.5% opacity,
  canvas only, never on cards** (a card-level noise layer previously broke the glint
  system — see git history).

**✓ Done-when:** zero raw hex in any `.vue` file (grep `#[0-9a-f]{6}` in `app/pages`
returns only token definitions); bronze-filled elements ≤1 per screen; status colors
confined to badge components.

## 2. Typography — the three-voice system

| Voice | Font | Where | Never |
|---|---|---|---|
| **Display** | **Fraunces** (variable, self-hosted, `soft` axis high) | Page titles, hero money figure, dialog titles, empty-state headlines, auth headline | body text, buttons, tables |
| **UI** | Geist (existing) | Everything interactive and structural | — |
| **Figures** | Geist Mono (existing) | All money, counts, dates-in-tables, IDs, ISRC/UPC | prose |

### 2.1 Scale (lock these; delete any other size)
| Token | Font/size/line/weight | Tracking | Use |
|---|---|---|---|
| `display-xl` | Fraunces 44/1.05/600 | −0.01em | Hero balance, auth headline |
| `display` | Fraunces 30/1.15/580 | −0.01em | Page titles (`.page-title` migrates) |
| `title` | Geist 19/1.3/650 | −0.02em | Dialog titles, card heroes |
| `section` | Geist 16/1.35/650 | −0.015em | `.section-title` |
| `body` | Geist 14/1.6/450 | 0 | Default |
| `label` | Geist 13/1.45/600 | 0 | Form labels, table headers |
| `caption` | Geist 12/1.5/500 | 0 | Footnotes, helper text |
| `eyebrow` | Geist 11/1.2/650 CAPS | +0.08em | Kickers (keep existing) |
| `figure-lg` | Mono 26/1.1/620 tabular | −0.01em | Stat values |
| `figure` | Mono 13/1.4/560 tabular | 0 | Table numbers |

Implementation: `@font-face` for Fraunces in `tailwind.css` (woff2, `font-display: swap`,
subset latin); expose as `--font-display`; apply via `.page-title`, `.hero-number`,
`DialogTitle`, `EmptyTitle`. Fraunces usage budget ≈ 5 elements per screen max.

### 2.2 Numeric craft (the product IS numbers)
- `MoneyValue.vue` keeps raised small cents/currency; add `font-feature-settings: "ss01"`
  check for Geist Mono zero style.
- **Rolling numbers:** integrate `@number-flow/vue` inside `MoneyValue` and `StatCard`
  so figures roll like a mechanical counter on load/change (≤600ms, ease-out, respects
  `prefers-reduced-motion` automatically).
- Negative money: ink, parentheses `(₹1,240.50)` ledger-style — not red (red only in
  badges per accent law).

**✓ Done-when:** every text node maps to a scale token; Fraunces appears on exactly
title/hero/dialog/empty/auth; all aligned numerals are tabular mono.

## 3. Spacing, grid, density

- Base-4 grid. Page gap 32 · panel gap 16 · card padding 20 (sm) / 24 (default) ·
  dense row padding 12–14. Kill any 5/7/9/13px one-offs found during build.
- Content max-width 1280px centered; analytics may stretch to 1440.
- **Density modes (new):** `:root { --density: 1 }`, admin layout sets `--density: .85`;
  table row heights, cell padding, and pill sizes multiply by it. Artist stays airy,
  admin gets ~20% more rows per screen. One variable, two personalities.
- Sticky behaviors: table headers stick under the topbar (`top: var(--topbar-h)`);
  uploader section anchors get `scroll-margin-top`.

**✓ Done-when:** paddings/gaps are 4-multiples; admin tables visibly denser than artist
tables with no separate components.

## 4. Shape, borders, elevation

- Radii ladder (already coherent — enforce): checkbox 5 · buttons/controls 8 · tooltips 10 ·
  cards/rows 14 · inputs 16 · dialogs 18 · pills/avatars/rings 999.
- Borders: hairlines from ink scale only; dashed reserved for drop-targets and
  "draft/placeholder" semantics.
- Elevation: keep the `cream-glass.css` role system (`hero/standard/quiet/data/edge/slab/
  control-inset/pressed`) as the **only** shadow source. Law: shadows are monochrome;
  hover may deepen one role step; nothing glows.
- Dark-mode menus/dialogs may use backdrop blur (existing); light mode surfaces stay opaque.

**✓ Done-when:** zero raw `box-shadow` in page files; every surface names a role.

## 5. Iconography

- Keep Lucide at stroke 1.75 for utility icons (chevrons, table actions).
- Finish the bespoke set in `app/components/icons/` (12 total): sidebar nav ×~8,
  wallet, statements, publishing, sign-out. Style: 1.75 stroke, rounded joins, one
  fine "engraved" interior line per glyph; mono-color `currentColor`.
- Icon sizing law: 16px inline with body, 18px in 36px buttons, 20px nav, 24px+ only
  in empty states/illustration contexts.

## 6. Illustration & graphics system (new)

Six single-color line engravings (SVG, `currentColor` ink at ~22% + one bronze detail
≤10% of strokes), drawn in one consistent plate style:
1. Empty record sleeve → no releases · 2. Tonearm at rest → no plays/analytics
3. Empty cash drawer → no statements/transactions · 4. Sealed envelope → no notifications
5. Rolodex card → admin empty queues · 6. Compass rose → 404/error
Used in `AppEmptyState`/`ui/empty` media slot and `error.vue`. No stock, no 3D, no mascots
(the existing "password raccoon" on auth may stay as an easter egg — it's hand-made and on-brand).

Cover art is the app's living graphic: prefer real artwork over decoration everywhere
(lists, dialogs, admin review queues). Blur-up loading (tiny inline preview → sharp,
200ms cross-fade) via the existing `sharp` pipeline.

## 7. Data-visualization style guide (Unovis themed)

- Series default `--ink-3` at 70%; the selected/hovered/primary series is bronze. One
  bronze series max per chart.
- Axes: no axis lines; 8 % hairline gridlines, horizontal only; mono 11px tick labels.
- Tooltips: existing `.analytics-chart-tooltip` (popover bg, 10px radius) everywhere.
- Area fills: 8% ink gradient→0; never multi-color stacked rainbows — split into small
  multiples instead.
- World map + heatmap: sepia/atlas treatment — land `--muted`, data ramps ink→bronze.
- Every chart: skeleton (existing shimmer) → entrance draw-in once (400ms, no loop);
  empty chart state uses engraving #2 + one helpful line.
- **Insight line (premium differentiator):** each major chart renders one computed
  sentence above it ("Streams up 14% — Germany drives most of the gain").

**✓ Done-when:** no default Unovis palette colors anywhere; all chart text mono/ink.

---

# PART II — MOTION

## 8. Motion system

Tokens (exist — enforce): 100/150/200/300/500ms · `--ease-out: cubic-bezier(.22,1,.36,1)`
· spring reserved for ≤2 moments. Choreography laws:
- Hovers move ≤1px, 150–200ms. Page/card entrance: existing `.page-enter`/`.stagger-enter`
  (40–60ms stagger, first 8 children only).
- **Nothing loops.** Replace the platform marquee on the uploader with a static,
  wrap-friendly logo row (or drift only-on-hover). Loops read as ad banners.
- `prefers-reduced-motion`: global kill switch (exists) — every new animation must pass.

### Signature moments (the only "wow" budget — 4 total)
1. **Numbers roll** — `@number-flow/vue` odometer in MoneyValue/StatCard (§2.2).
2. **Artwork travels** — Nuxt View Transitions API: cover art morphs from catalog grid
   → `ReleaseDetailDialog` → admin review. `view-transition-name` per release id.
   Also used for light/dark theme cross-fade.
3. **Living waveform** — `PremiumAudioPlayer` renders real waveforms via **wavesurfer.js**
   (lazy-loaded): ink bars, bronze progress, 2px playhead; click-to-seek.
4. **The pressing moment** — release submit: cover centered, bronze ring closes (GSAP,
   already installed, ~900ms once), then "Submitted to 30+ stores." No confetti.

### Loading & perceived performance
- Skeleton-first on every page (extend `DashboardSkeleton` pattern to analytics/tables);
  skeletons mirror real layout (no generic boxes), shimmer ≤2 cycles then static.
- Optimistic UI for toggles/renames; undo-toast instead of confirm for non-money actions.
- Tab title shows live progress during uploads: `↑ 42% — Naad Backstage`.

**✓ Done-when:** zero infinite animations (grep `infinite` yields only skeleton shimmer);
the 4 signature moments exist; everything passes reduced-motion.

---

# PART III — COMPONENTS (full pass)

Each keeps its current file; spec = target state. States required for every interactive
component: rest / hover / active / focus-visible / disabled / loading / error.

**Buttons** (`ui/button`) — keep 5-variant system (gold premium-box, secondary raised,
outline, ghost, neo-*). Add `loading` prop: label fades to 60%, inline 3-dot ink pulse
(not a spinner ring), width locked to prevent jump. Icon buttons get tooltips, always.
**Inputs/Textarea/NativeSelect** — `surface-field` inset look stays; error =
`aria-invalid` border + caption line that slides down 4px/150ms (no shake);
prefix/suffix slots (₹, .com) in `--ink-4` mono.
**Checkbox/Radio/Switch** — checkbox: bronze check draws in (SVG stroke-dash, 150ms).
Add a `Switch` primitive (reka-ui) for settings toggles — ink track, ivory thumb,
bronze when on. Radio group for option lists currently faked by buttons.
**Badge/StatusBadge** — the only home of status color; dot-prefix variant for tables
(● Live, ● In review); pill radius; 11px/650.
**Tooltip** — 150ms in / 0 out, 4px rise, popover surface, 12px text; add `kbd` slot
styled as keycap (1px ink border, 2px bottom edge — like real keys).
**DropdownMenu/Popover/Combobox** — popover surface + `--surface-depth-hero`; item
hover = `--muted` fill (no bronze); destructive items ink-red text only.
**Dialog/AlertDialog/Sheet** — keep morph-from-trigger (it's excellent). Standardize:
title = Fraunces `title`, content `body`, footer right-aligned [ghost ·primary].
Money-destructive admin actions (payout approval, statement lock) get type-to-confirm.
**Toasts** (`vue-sonner`) — bottom-right, max 3, popover surface, ink text, bronze
left rule 2px; success uses a check that draws in; **undo pattern**: "Track removed — Undo · 6s".
**Tables** (`DataTable` + desk-tables in pages) — header: 11px caps label row, sticky;
numbers right/mono; text left; no zebra — `--line-2` hairlines; row hover = existing
tint + 3px bronze inset bar (already fixed, no layout shift); sort indicator: tiny
bronze triangle + column header turns `--ink-1`; per-table empty state (engraving) and
skeleton rows; admin tables obey `--density`.
**Pagination** (`AppPagination`) — keep the neomorphic tray (it's distinctive);
add "Page x of y" mono caption.
**Tabs** (`.section-tab`) — keep bronze underline; animate the underline sliding
between tabs (one absolutely-positioned bar, 200ms ease-out).
**Avatars** (`ArtistAvatar`) — 999px, 1px ink ring at 12%; fallback initials in mono;
stack overlap −8px for collaborator groups.
**Progress** — linear bar (exists) + extract the readiness ring into a reusable
`ProgressRing.vue` (it now appears in 3 places incl. cover upload).
**CopyableLink** — click → bronze flash on text + "Copied" tooltip 1.2s; never moves.
**CollapsiblePanel** — chevron rotates 200ms; height animation exists, keep.
**StatCard** — value uses `figure-lg` + number roll; delta chip (▲ 12% in success badge
colors, inside-badge only); slab variant for hero money.
**PremiumAudioPlayer** — waveform (§8.3), time in mono, keyboard: space/←→; the player
is a flagship: treat its visual QA like a feature.
**DspLogo/CountryFlag** — already strong; enforce consistent corner radius + grayscale-
at-rest option for dense admin tables (color on hover/active row).
**OperationsRing/SignalHeatmap** — restyle per §7 (ink/bronze ramps); these two are
brand assets, feature them in marketing screenshots.
**ConfirmActionDialog** — danger tone: ink dialog, red confined to the confirm button label.
**AppAlert** — left rule 2px in semantic color, surface stays paper; icons 16px.

**New components to add:** `CommandPalette.vue` (§10), `Kbd.vue`, `Switch`, `ProgressRing`,
`InsightLine.vue` (chart sentence), `PipelineDots.vue` (release status journey),
`BulkActionBar.vue` (admin), `InspectorSheet.vue` (admin row drawer).

**✓ Done-when:** every component demos all 7 states; no component invents colors/shadows.

---

# PART IV — LAYOUT & NAVIGATION

## 9. AppShell (sidebar + topbar) — `app/components/AppShell.vue`
- Sidebar: bespoke icons (§5); active item = bronze 3px inset bar + `--ink-1` label
  (no filled pill); section dividers as hairlines with eyebrow labels ("STUDIO",
  "MONEY", "ACCOUNT"). Collapsed mode (icons only, 64px) with tooltips — persisted.
- Topbar: stays ink-black slab (distinctive); right side: ⌘K hint (Kbd), notifications
  bell with dot (not number) unless >9, avatar menu.
- **Impersonation ("View as artist") ribbon:** full-width 32px amber-on-ink strip under
  the topbar — unmistakable, with "Exit view-as" action. (State already exists in code.)
- Mobile: sheet-based drawer (exists) + bottom tab bar for artist's top 4 destinations
  (Home, Catalog, Analytics, Wallet) — thumb-reachable, 44px targets.

## 10. Command palette (⌘K) — the defining premium-tool feature
Build on existing reka-ui Combobox + Dialog + the morph animation (no new dependency):
- Artist scope: pages, releases by title, "New release", "Request payout", theme toggle.
- Admin scope: + artists by name, queues, "Approve…", recent items.
- Design: 560px, popover surface, 18px radius, results grouped with eyebrows, selected
  row = `--muted` fill + bronze left bar; footer hairline with Kbd hints (↑↓ · ↵ · esc).
- Global `/` or `⌘K`; every admin table row action also registered here.

**✓ Done-when:** every page reachable in ≤2 keystrokes + typing; palette opens <50ms.

---

# PART V — PAGE-BY-PAGE

## 11. Artist dashboard (`app/pages/dashboard/`)

**11.1 Home (`index.vue`)** — answer, in order: *How's my money → what needs me → how's
my music.* Hero = balance slab (Fraunces-adjacent figure, number roll, 30-day micro-
sparkline, one bronze "Request payout" if eligible). Second = "Needs you" spotlight
(exists as Next move — promote position 2, sole bronze button). Then: Recent movement
(ledger rows, mono amounts), Latest drop (artwork-led), Top performers (mini bar list,
bronze top item). Shortcuts demote to compact icon row under the header. First-run
(no data): full-bleed welcome with engraving #1 + 3-step checklist (upload, profile,
payout details) with `ProgressRing`.

**11.2 Analytics** — sticky toolbar (period/month picker + DSP filter); KPI strip
(4 StatCards, deltas); each panel gets InsightLine; chart theming per §7; atlas-style
world map; rank panel rows show artwork thumbnails; per-panel skeletons + empty
engravings; "Expand" keeps morph-to-dialog.

**11.3 Releases (catalog)** — artwork-first grid (cover, title, type eyebrow,
`PipelineDots`: Submitted → In review → Delivering → Live with bronze fill + date
tooltips). Click → `ReleaseDetailDialog` with view-transition of the artwork. Folder
tabs (`WorkspaceFolderGrid`) stay — they're distinctive. List/grid toggle persisted.
Takedown/edit behind overflow menu, undo-toast where reversible.

**11.4 Upload (`uploaded.vue`)** — (cover ring + audio progress-button already shipped.)
Add: left progress rail of the 5 steps, bronze fill synced to existing readiness %;
sticky summary footer (cover thumb · n tracks · date · Submit) so Submit is never lost
on long forms; per-section completion ticks; the pressing moment on submit (§8.4);
drop-target highlight = dashed bronze border + `--priority-soft` wash (cover + audio cells).

**11.5 Statements** — bank-grade ledger: statement header block (period, artist, gross/
fees/net in a mono summary row), day groups with hairlines, amounts right-mono,
running balance column on desktop. **Print stylesheet** (`@media print`: hide chrome,
serif headings, black-on-white, page numbers) so "Download/Print" yields a typeset
document. Month picker = existing `AppMonthPicker`.

**11.6 Wallet** — physical card metaphor (asset exists:
`public/wallet-card-premium-black-gold.webp`): card top-left with number-rolled balance;
optional ≤2° pointer tilt (desktop only, reduced-motion-off — cut if it feels gimmicky);
below: Available vs Pending (pending = "uncleared funds" lighter treatment), payout
method card, movement ledger reusing statement rows. Payout flow: 2-step sheet with
type-amount → review (fees explicit, mono) → confirm; success = toast + roll-down.

**11.7 Publishing** — registration journey via `PipelineDots` (Submitted → Registered →
Collecting); track cards reuse catalog row DNA; CTA panel for unregistered works with
one InsightLine ("3 tracks are earning streams but not registered for publishing").

**11.8 Notifications** — inbox: unread = `--priority-soft` left edge + bold title;
read = quiet; group headers Today/This week/Earlier (eyebrows); row action on hover;
"caught up" state = engraving #4 + "All caught up." Mark-all with undo-toast.

**11.9 Settings** — completion meter stays; sections as quiet panels with sticky
side-nav (Profile / DSP profiles / Social / Login & security / Payout details);
**profile preview card** ("How stores see you": avatar, name, links — artists are vain,
indulge them); login methods (existing `AccountLoginMethods`) with provider icons;
danger zone: hairline-separated, ink — red only on the final confirm button.

## 12. Admin dashboard (`app/pages/admin/`) — same skin, control-room soul
Global: `--density: .85`, inspector pattern, bulk bar, ⌘K everywhere, every queue
shows count + "oldest: 3d" age chip (amber via badge when >48h).

**12.1 Home (`index.vue`)** — "Control room": top = royalty-operations monitor
(OperationsRing restyled) + command dock; middle = work-queue cards (Triage, Ingestion,
Cash movement, Submissions, Locks, Payout prep) each with count, age, one-key jump;
bottom = audit trail styled as ship's log (mono timestamps, hairlines, actor → action →
object). Empty queues = engraving #5 + "Queue clear."
**12.2 Analytics** — platform-wide same chart language; cohort/DSP small-multiples
instead of rainbow stacks; exec summary strip of 4 KPIs + InsightLines.
**12.3 Artists** — roster table (avatar, name, releases, balance-mono, status badge,
joined); row → `InspectorSheet` (profile, catalog, balances, recent activity, actions);
invite CTA secondary; search-as-you-type; bulk export.
**12.4 Releases (review)** — review queue is artwork-led: 56px cover thumb leads each
row; inspector shows full art (view-transition), tracklist with inline `PremiumAudioPlayer`,
metadata checklist with per-item ✓/✗; Approve (bronze) / Reject (ghost→typed-reason
dialog); keyboard: ↑↓ rows, A approve, R reject — review 50 submissions without touching
the mouse.
**12.5 Earnings** — ingestion-to-allocation funnel strip; statements table (period,
source, gross/net mono, lock badge); lock action = type-to-confirm dialog ("LOCK MAY-2026").
**12.6 Payouts** — pipeline board (Requested → Approved → Processing → Settled) as
columns of money-cards; approve = inspector with artist balance context; settled rows
get receipt-style detail (mono, hairlines).
**12.7 Dues** — aging table with ink-bar visualization per row (no red walls of cells);
totals row pinned bottom mono.
**12.8 Invites** — issued codes as ticket-stub cards (dashed perforation edge —
on-theme, tasteful); states: unused (ink) / claimed (bronze check + claimer) /
expired (40% opacity); copy via `CopyableLink`.
**12.9 Ingestion** — runs table: status badge, counts mono, duration; failed rows
expand to show error detail in mono code block; "Re-run" ghost button; live run =
indeterminate hairline progress under the row (the one allowed loop, while active only).
**12.10 Publishing (admin)** — mirror of 11.7 with reviewer controls; same PipelineDots
vocabulary so admin and artist literally see the same journey.
**12.11 Settings** — platform config in quiet panels; destructive ops isolated in
danger section; every mutation writes to the audit log visibly ("Logged" caption).

## 13. Auth, errors, edges
**Login (`login.vue`)** — first impression page: split layout — left: ink panel with
logo-light, Fraunces headline ("The back office for your music."), subtle engraved
vinyl illustration; right: paper panel, email/Google (existing `GoogleGradientIcon`),
surface-field inputs, raccoon easter egg stays on password. No marketing fluff.
**MFA (`admin-mfa`)** — 6 individual code boxes (mono 20px), auto-advance, paste-aware;
error = caption only.
**Reset/callback** — same skeleton; callback shows skeleton shimmer not spinner.
**404 (`[...slug].vue`) / error.vue** — engraving #6 (compass), Fraunces "Side B —
nothing recorded here.", ghost "Back to dashboard"; error page adds mono error code +
"copy details" for support.

**✓ Done-when (Part V):** every page has designed loading, empty, error, and first-run
states (4 × ~22 screens — this checklist is most of the work and most of the premium).

---

# PART VI — SYSTEM-WIDE STANDARDS

## 14. Microcopy
Label-world voice: confident, brief, zero exclamation marks in operations. "Masters
received." not "Your file was uploaded successfully!" Buttons = verb+object ("Request
payout"). Errors = what happened + what to do ("Cover must be at least 3000×3000px.
Re-export and try again."). Empty states = one warm line + one action. Dates: "2h ago"
with absolute on hover (mono). Currency always via `MoneyValue` (locale-aware).

## 15. Accessibility (premium = works for everyone)
Contrast AA minimum (check `--ink-3` on `--muted` combos); single bronze focus ring
(already unified); full keyboard paths for upload, review queue, palette; `aria-live`
on progress (exists on cover ring — extend to audio buttons); touch targets ≥44px
mobile; icon-only buttons always labeled; `color-scheme` synced (exists); forms:
error summary focus-jump on submit.

## 16. Responsive
Breakpoints stay (640/768/1024/1280). Artist mobile: bottom tab bar (§9), tables
become the existing mobile cards (statement-mobile-card pattern → standardize),
uploader rail collapses to top stepper dots, hover-only affordances get always-visible
mobile equivalents (e.g. "Change cover" overlay). Admin mobile: read-only comfort —
queues/cards stack; deep actions guarded behind "best on desktop" hints rather than
broken layouts.

## 17. Performance budget (premium feels fast)
LCP < 2.0s · CLS < 0.05 · INP < 200ms. Fonts: 3 subset woff2 (~70KB total), `swap`.
Lazy: wavesurfer, world-map geojson (already separate), GSAP only on uploader.
Images: covers via sharp → avif/webp + LQIP blur-up. Charts render after skeleton
paint. No layout shift from any animation (transform/opacity only — audit with grep
for animated `width/height` outside progress fills).

## 18. Beyond the app (brand doesn't stop at the viewport)
Emails (Resend, assets exist in `public/`): same paper/ink/bronze, mono figures,
statement-style tables. OG images: ink card, Fraunces title, bronze rule (template +
generation via sharp). Print: statements + invoices (§11.5). PWA-lite: manifest +
`theme-color` per scheme so the browser chrome matches. Favicon: already multi-size ✓.

## 19. Libraries — final verdict
**Install (4):** `@number-flow/vue` (rolling figures) · `wavesurfer.js` (waveforms) ·
Fraunces font files · *(optional)* `motion-v` only if View Transitions API coverage
disappoints in Safari — try native first.
**Keep:** reka-ui + shadcn-vue, Tailwind v4, Unovis (re-themed), GSAP (one moment),
vue-sonner, Geist.
**Never:** Vuetify/PrimeVue/Quasar/Nuxt-UI (would *erase* the custom identity),
particles/parallax/tilt libraries, Lottie packs, any "AI UI kit".

---

# PART VII — EXECUTION

## 20. Roadmap (each phase ships independently)

| Phase | Scope | Key files | Effort |
|---|---|---|---|
| **1. Voice** | Fraunces + type scale + number roll + ink tokens + canvas gradient/grain | tailwind.css, MoneyValue, StatCard, PageHeader | 1–2 d |
| **2. States** | 6 engravings + every page's empty/loading/error/first-run + chart re-theme + InsightLine | icons/, AppEmptyState, analytics/* | 3–4 d |
| **3. Artist core** | Home hierarchy, PipelineDots, catalog artwork grid, statements ledger+print, wallet card page | dashboard/* | 4–5 d |
| **4. Admin ops** | Density var, ⌘K palette, InspectorSheet, BulkActionBar, queue ages, review keyboard flow | admin/*, new components | 4–5 d |
| **5. Showpieces** | View-transition artwork, wavesurfer player, pressing moment, login redesign | ReleaseDetailDialog, PremiumAudioPlayer, uploaded.vue, login.vue | 3–4 d |
| **6. Horizon** | Emails/OG/print polish, mobile bottom bar, a11y+perf audit pass | server/emails, AppShell | 2–3 d |

## 21. Review checklist (hand this to Codex)
1. Tokens: no raw hex/shadows/radii in pages; ink scale + accent law hold.
2. Type: every node on the scale; Fraunces budget respected; tabular numerals on all
   aligned figures.
3. Motion: nothing loops; 4 signature moments present; reduced-motion clean; no
   animation causes layout shift.
4. States: 22 screens × {loading, empty, error, first-run} all designed — no browser-
   default or blank states anywhere.
5. A11y: keyboard-complete flows (upload, review, palette); single focus ring; AA contrast.
6. Density: admin ≠ artist measurably (row height) with shared components.
7. Anti-slop scan: no gradients-on-text, glow halos, particles, glassmorphism-on-light,
   stock 3D, emoji icons, confetti.
8. Perf: budgets in §17 met on dashboard home + analytics (the two heaviest).

*End of plan. The aesthetic is already yours — this plan finishes the sentence.*
