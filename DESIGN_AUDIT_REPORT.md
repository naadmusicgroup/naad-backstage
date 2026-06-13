# Naad Backstage Design Audit

Date: 2026-05-20  
Scope: compare the SaaS UI in this repo against the design skills and guideline sources collected by `maxbogo/awesome-ai-tools-for-ui`, then identify visual overwork, duplicated components, and code paths that make the product harder to keep consistent.

Note: the findings below describe the audit snapshot that led to the cleanup. The safe core cleanup has now implemented the high-priority deletions and migrations called out in the plan.

## Implementation Addendum

The safe core pass is complete for the shared design layer:

- Warm black/gold is now documented as the design canon in `DESIGN.md`.
- The generated-looking `main.css` import was removed and `app/assets/css/main.css` was deleted.
- Broad glass styling was replaced with explicit surface primitives in `app/assets/css/cream-glass.css`.
- Shared layout/display classes now live in readable source CSS at `app/assets/css/components.css`.
- `SectionCard`, `MetricCard`, and `CollapsibleSection` were migrated away and deleted.
- `DspSelect` now has one visible dropdown layer plus a hidden native `<select>` sentinel for form validity/change behavior.
- `CreditRoleMultiSelect` now uses a single searchable popover without a local `z-index: 220`.
- Shared overlays use a consistent z-index scale for dropdowns, popovers, native selects, tooltips, sheets, dialogs, and alert dialogs.
- Shared `Card`, `Button`, and `Badge` defaults were quieted, and `transition-all` was removed from production UI code.
- Old shared `premium-button-flat`, `premium-icon-shell`, `icon-motion-*`, and `icon-motion.ts` code was removed.
- Status-like badges in the touched release/upload/admin surfaces now route through `StatusBadge`.
- The login mascot code path and behavior were preserved.

## Executive Verdict

Naad Backstage was not under-designed. It was over-designed at the surface layer.

The core product shape is good: Nuxt, Tailwind, shadcn-style primitives, lucide icons, a shared app shell, reusable table and metric components, clear operational workflows, and a serious domain. The problem in the initial audit was that the visual system was being applied in too many overlapping places:

- `DESIGN.md` says the product should be matte-black, restrained, data-dense, and card-sparse.
- `app/assets/css/tailwind.css` currently defines a warm platinum, gold, bronze, and glass-heavy theme.
- `app/assets/css/cream-glass.css` applied the same glass treatment to a long list of cards, rows, charts, menus, and panels.
- `app/assets/css/main.css` was a 118.8 KB generated-looking CSS bundle imported as source.
- Many pages still added page-local gradients, shadows, wrappers, motion, and formatting helpers.

The app has a strong enough foundation to simplify without losing quality. The first cleanup pass removed layers instead of adding polish.

## Sources Studied

The `awesome-ai-tools-for-ui` repository lists 16 skill/design sources in its Skills section. I treated them as a practical review lens rather than as one single rigid rulebook.

| Source | Relevant lesson for Naad Backstage |
| --- | --- |
| [Impeccable](https://impeccable.style/) | Tight hierarchy, spacing, typography, and layout correction beats more decoration. |
| [UserInterface.wiki Skill](https://github.com/raphaelsalaja/userinterface-wiki/blob/main/skills/SKILL.md) | Use consistent motion timing, chunk information, preserve predictable controls, use tabular numbers, and keep visual rhythm stable. |
| [UI UX Pro Max Skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Production UI should be coherent, legible, and behaviorally complete, not just visually busy. |
| [Anthropic Frontend Design Skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | Pick a clear aesthetic and make typography, color, motion, and spatial composition intentional. Avoid generic AI-looking surfaces. |
| [Make Interfaces Feel Better](https://github.com/jakubkrehel/make-interfaces-feel-better) | Micro-interactions should reduce friction and signal state, not compete with repeated workflows. |
| [shadcn/ui Skills](https://ui.shadcn.com/docs/skills) | Use primitives consistently; avoid wrapping wrappers unless they encode real product behavior. |
| [Vercel Web Design Guidelines Skill](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) and [guidelines command](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) | Audit interfaces against a shared, concrete interface standard instead of subjective polish. |
| [Emil Kowalski Skill](https://github.com/emilkowalski/skill) | Every animation needs a reason. Frequent actions should have no or reduced animation. Avoid `transition: all`. |
| [Taste Skill](https://www.tasteskill.dev/) | Taste comes from restraint, alignment, contrast, and the details users repeatedly touch. |
| [Designer Skills Collection](https://github.com/Owl-Listener/designer-skills) | Treat design critique as a set of repeatable checks, not one-off decoration. |
| [TypeUI Design Skills](https://www.typeui.sh/design-skills) | Typography and information density matter especially in operational SaaS. |
| [YC Web Design Strategy Skill](https://github.com/maxbogo/yc-web-design-strategy-skill) | Avoid default AI-site patterns: generic gradients, bento overload, fake depth, and style soup. Make the value obvious quickly. |
| [Swiss Design System](https://swiss.ziki.boo/) | Grids, typographic discipline, and clear hierarchy are more durable than effects. |
| [Bencium Marketplace](https://github.com/bencium/bencium-marketplace) | Marketplace-style examples are useful, but Naad should not inherit a generic showcase visual language. |
| [Three.js Skills](https://github.com/CloudAI-X/threejs-skills) | 3D is not relevant to this SaaS surface unless it carries real product meaning. |
| [Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md/) | A design source of truth only works if implementation actually follows it. |

## Guideline Fit

| Area | Result | Evidence |
| --- | --- | --- |
| Product aesthetic | Fails current source of truth | `DESIGN.md` calls for restrained matte black and accent `#7C6BF0`, while `app/assets/css/tailwind.css` uses platinum, bronze, and gold tokens. |
| Operational SaaS density | Mixed | Pages are data-rich and workflow-focused, but too many sections are framed as cards, which weakens scan hierarchy. |
| Cards and surfaces | Fails | `DESIGN.md` says default no cards. The app has 82 `<Card` usages, 62 `<SectionCard` usages, 24 `<MetricCard` usages, plus broad glass CSS selectors. |
| Typography | Mostly good | Geist, Inter-style metrics, uppercase eyebrows, and tabular financial numbers are present. The issue is not type choice; it is visual competition around the type. |
| Color | Mixed to failing | The app avoids the obvious purple-blue AI gradient trap, but it now has a warm gold/platinum system that conflicts with the documented matte-black/purple canon. |
| Motion | Mixed to failing | Reduced-motion handling exists, but `transition-all`, 520ms sidebar/login animations, looping login sheets, and generated premium icon animation are heavier than the guidelines recommend. |
| Component reuse | Fails | Several components are aliases around aliases rather than behavior-bearing abstractions. |
| Accessibility | Mixed | Login labels and aria labels are in decent shape. The next pass should audit every `outline-none`, focus state, and custom control path. |
| Loading states | Mixed | Skeletons exist, but many buttons and flows still use text states like `Saving...`/`Working...`; `DESIGN.md` asks for skeletons/spinners instead of visible loading copy. |
| Maintainability | Fails | Several pages exceed 40 KB; `admin/releases.vue`, `dashboard/uploaded.vue`, and `login.vue` carry large page-local UI systems. |

## Main Findings

### 1. The Design Canon And The Implemented Theme Disagree

`DESIGN.md` describes the source of truth:

- dark matte SaaS
- single restrained accent
- no generic purple-to-blue gradients
- no nested cards
- no default cards
- tabular financial numbers

The actual imported CSS tells a different story:

- `nuxt.config.ts:69` imports three global CSS files: `tailwind.css`, `main.css`, and `cream-glass.css`.
- `app/assets/css/tailwind.css:121-190` defines the light theme around `--platinum-*` tokens.
- `app/assets/css/tailwind.css:205-273` defines dark mode around black, warm foregrounds, and gold priority tokens.
- `app/assets/css/cream-glass.css` then turns many UI groups into glass panels with gradients, blur, and shadows.

Recommendation: decide which brand canon wins. If the current warm-black/gold direction is intentional, update `DESIGN.md`. If `DESIGN.md` is still correct, retokenize the implementation to match it. Right now future agents and engineers will keep producing inconsistent UI because the source of truth and the code disagree.

### 2. There Are Three Surface Systems Competing

The same visual job is being done in three layers:

- Component default: `app/components/ui/card/Card.vue` always renders `glass-card flex flex-col gap-6 rounded-xl border py-6`.
- Global glass layer: `app/assets/css/cream-glass.css` applies glass styling to `.glass-card`, `.glass-panel`, `.chart-card`, `.catalog-item`, `.quick-report-card`, `.activity-row`, `.statement-row`, and many more.
- Page-local styling: large pages add their own gradients, shadows, wrappers, and row/card classes.

This creates a premium effect by default, even when the UI element is just a filter group, table wrapper, or list row.

Recommendation: keep only a small opt-in surface vocabulary:

- `surface-panel` for major page zones that genuinely need containment.
- `surface-card` for repeated interactive units.
- `surface-field` for form controls.
- `surface-menu` for popovers and dropdowns.

Everything else should use spacing, type, dividers, and background contrast.

### 3. Card Usage Is Too Broad For A Data-Dense SaaS

The dashboard screenshots show clear workflows, but nearly every major thing is framed: metrics, filters, tables, activity blocks, list sections, and grouped controls. That makes the page feel more expensive visually while also making it harder to know what matters first.

Evidence:

- 82 `<Card` usages.
- 62 `<SectionCard` usages.
- 24 `<MetricCard` usages.
- The global card class itself is already a glass card.

Recommendation: preserve cards for the places `DESIGN.md` already names: interactive units, drill-down stats, release items, wallet actions, upload previews, and modal-like decisions. Flatten filter bars, table shells, page sections, and simple rows.

### 4. Several Components Are Pass-Through Duplicates

These wrappers add naming surface but no meaningful behavior:

- `app/components/SectionCard.vue` only passes props and slots to `DataPanel`.
- `app/components/MetricCard.vue` only passes props to `StatCard`.

There are also duplicate concepts:

- `CollapsiblePanel.vue` and `CollapsibleSection.vue` both implement collapsible panel/card behavior.
- `StatusBadge.vue` exists, but raw `<Badge>` is still used widely for status-like UI.
- Repeated action clusters appear as `flex flex-wrap gap-2` 49 times.

Recommendation:

- Keep `DataPanel`; deprecate `SectionCard`.
- Keep `StatCard`; remove or alias-migrate `MetricCard`.
- Merge the collapsible components into one product-level component.
- Route all status semantics through `StatusBadge`.
- Add one `ActionRow` or `ButtonCluster` component for repeated action groups.

### 5. The Generated-Looking `main.css` Should Not Be A Source File

`app/assets/css/main.css` is 118.8 KB, appears minified/generated, and contains many component classes and compiled Tailwind output. It is imported directly by Nuxt.

That makes design governance difficult because the team now has to reason about:

- Tailwind source utilities.
- Generated-looking CSS.
- `cream-glass.css`.
- Component classes.
- Page-scoped styles.

Recommendation: identify whether `main.css` is an accidental build artifact. If it is, remove it from `nuxt.config.ts` and restore only the few human-authored classes that are still needed. If it is intentional, split it into named, source-level files by responsibility.

### 6. Motion Is Doing Too Much In Repeated UI

Positive signs:

- There is reduced-motion handling.
- Buttons have active press feedback.
- ECharts components appear to check reduced motion.

Problems:

- `app/components/ui/button/index.ts:7` uses `transition-all duration-300` on every button.
- Several controls use `transition-all`.
- Sidebar and login animation timings reach 520ms and 620ms.
- Login has looping decorative background animation and a large page-local motion system. The mascot behavior itself is a protected product detail and should stay unchanged.
- Generated premium icon CSS includes many hover animations.

The reviewed guidelines converge on this: frequent actions should be calm, exact, and fast. Motion should clarify state, not ask for attention on every hover.

Recommendation:

- Replace `transition-all` with exact properties.
- Keep most control transitions between 120ms and 220ms.
- Reserve 300ms for larger user-initiated state changes.
- Reduce or remove decorative motion in repeated operational workflows.
- Keep the login mascot and its code behavior as-is. If the login page is simplified, simplify the surrounding layout, gradients, and panel CSS around that protected interaction.

### 7. Formatting And Data Display Logic Is Repeated In Pages

There are many page-local `formatMoney`, `formatDate`, `formatDateTime`, and `Intl.NumberFormat` definitions across admin and dashboard pages. Some reusable display components exist, such as `MoneyValue.vue`, but the pages still carry their own formatters.

Recommendation:

- Add shared `app/utils/format.ts` helpers for money, counts, month labels, dates, and date-time.
- Use `MoneyValue.vue` consistently for financial values.
- Keep tabular numbers by default in money/count components.

### 8. The Login Page Is Polished But Heavy

The live `/login` page is visually distinctive and mostly accessible at the form level: it has labeled email/password inputs, a show-password control, OAuth button, forgot-password action, and brand alt text.

Protected constraint: the login mascot and its current behavior should remain as-is. It is part of the desired product personality, so any login redesign should preserve that code path and interaction model.

The cost is size and complexity:

- `app/pages/login.vue` is 55.2 KB.
- It contains a large custom visual and motion system.
- It uses decorative gradients, panel effects, custom animation, and many responsive height rules.

Recommendation: keep the mascot behavior and the best interaction details, but move reusable form/auth primitives out of the page and reduce decorative CSS around them. A sign-in page can feel premium through confidence, layout, copy, and focus handling without carrying a separate mini design system.

## What Is Being Overdone

- Glass panels as a default surface.
- Premium reflections and animated icon treatment on common controls.
- Card framing for sections that could be layout groups.
- Multiple wrappers for the same card/stat/panel concepts.
- Page-local CSS systems inside large pages.
- Repeated button/action clusters.
- Repeated date and money formatters.
- Gradients and shadows competing with operational content.
- Decorative login effects around the protected mascot interaction.

## What Is Already Good

- The application is workflow-first, not a marketing page.
- The sidebar/topbar shell gives the product a stable frame.
- There are reusable primitives for buttons, cards, badges, tables, metrics, skeletons, and dialogs.
- Lucide icons are already available and used.
- Typography choices are appropriate for SaaS.
- Many financial values use tabular numeric treatment.
- Reduced-motion support is present in important areas.
- Login form labeling and main actions are clear.

## Recommended Simplification Plan

### Phase 1: Pick The Canon

Choose one:

1. Matte-black plus purple accent as documented in `DESIGN.md`.
2. Warm-black plus gold/bronze as currently implemented.

Then update either the tokens or the document so there is one source of truth.

### Phase 2: Remove Surface Duplication

- Audit `app/assets/css/main.css`. Remove it from `nuxt.config.ts` if it is a generated artifact.
- Reduce `cream-glass.css` from broad selectors to opt-in surface classes.
- Make `Card.vue` visually neutral by default. Let product-level components opt into stronger treatment.

### Phase 3: Collapse Duplicate Components

- Replace `SectionCard` usages with `DataPanel` or unframed layout sections.
- Replace `MetricCard` usages with `StatCard`.
- Merge `CollapsiblePanel` and `CollapsibleSection`.
- Standardize status rendering through `StatusBadge`.
- Introduce one action-row component.

### Phase 4: Flatten The Main Dashboards

Start with:

- `app/pages/dashboard/index.vue`
- `app/pages/dashboard/statements.vue`
- `app/pages/admin/index.vue`
- `app/pages/admin/analytics.vue`

Remove card wrappers from filters, simple tables, row lists, and page section containers. Keep cards for interactive release/stat/wallet units.

### Phase 5: Motion And Accessibility Pass

- Replace `transition-all`.
- Shorten common control transitions to 120ms-220ms.
- Keep focus-visible rings on every custom control.
- Confirm all `outline-none` paths have replacement focus states.
- Replace text-only loading states with width-stable buttons, inline spinners, or skeletons.

### Phase 6: Extract Shared Display Utilities

- Centralize money, count, date, date-time, and month formatting.
- Use shared money/count components for alignment-sensitive values.
- Remove repeated per-page formatter functions as pages are touched.

## Priority Files

Highest priority:

- `nuxt.config.ts`
- `DESIGN.md`
- `app/assets/css/main.css`
- `app/assets/css/tailwind.css`
- `app/assets/css/cream-glass.css`
- `app/components/ui/card/Card.vue`
- `app/components/ui/button/index.ts`

Component cleanup:

- `app/components/SectionCard.vue`
- `app/components/DataPanel.vue`
- `app/components/MetricCard.vue`
- `app/components/StatCard.vue`
- `app/components/CollapsiblePanel.vue`
- `app/components/CollapsibleSection.vue`
- `app/components/StatusBadge.vue`

Page cleanup:

- `app/pages/dashboard/uploaded.vue`
- `app/pages/admin/releases.vue`
- `app/pages/login.vue`
- `app/components/AppShell.vue`
- `app/pages/admin/analytics.vue`
- `app/pages/dashboard/index.vue`

## Final Recommendation

Do not start by redesigning every screen. Start by deleting duplication and making the default UI quieter.

The product will look more premium if fewer things claim to be premium. The design skills all point in the same direction: pick a clear aesthetic, apply it consistently, keep motion purposeful, make repeated workflows calm, and let typography plus spacing do more work than glass, gradients, and shadows.
