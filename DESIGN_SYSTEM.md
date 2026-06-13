# Naad Backstage — Design System

This is the single source of truth for how the product looks. Every value here
already exists as a CSS variable in `app/assets/css/tailwind.css` (tokens) and
`app/assets/css/cream-glass.css` (surface depth). **Never hardcode a hex color
or a shadow in a component — use the token.**

The aesthetic in one sentence: **a warm, paper-and-bronze monochrome — like an
expensive printed royalty statement, not a glowing tech dashboard.**

---

## 1. Color Palette

The system is deliberately *monochrome + one accent*. Black-on-cream in light
mode, ivory-on-charcoal in dark mode, with bronze/gold reserved for the things
that matter (primary actions, active states, focus). That restraint is what
makes it feel expensive — when everything glows, nothing does.

### Light mode (default)

| Token | Value | Use for |
|---|---|---|
| `--background` | `#f1ede4` (warm platinum canvas) | Page background |
| `--card` | `#faf6ee` | Cards, panels |
| `--popover` | `#fff9f0` | Menus, dialogs, tooltips |
| `--foreground` | `#0a0a0a` | Headings, primary text |
| `--muted-foreground` | `#5f5548` | Secondary text, labels, captions |
| `--muted` / `--accent` | `#e4dccd` / `#eadfcd` | Subtle fills, hover fills |
| `--primary` | `#0a0a0a` (dark-on-light) | Filled controls, selected states |
| `--priority` | `#8a6a28` (bronze) | THE accent: CTAs, active tab underline, pagination active |
| `--priority-hover` | `#b08d3a` | Bronze hover shift |
| `--destructive` | `#c43b32` | Errors, dangerous actions |
| `--status-success` / `-warning` / `-info` | `#047857` / `#b45309` / `#2563eb` | Status badges only |
| `--border` | `rgba(45,39,31,.14)` | Hairlines (warm-tinted, never pure gray) |
| `--ring` | `#9a7a2f` | Focus ring |

### Dark mode (`.dark`)

| Token | Value | Use for |
|---|---|---|
| `--background` | `#12110f` | Page background |
| `--card` | `#1a1815` | Cards |
| `--popover` | `#211f1a` | Menus, dialogs |
| `--foreground` | `#f4eedf` (warm ivory, never pure white) | Primary text |
| `--muted-foreground` | `#a49b8b` | Secondary text |
| `--primary` | `#f4eedf` (ivory-on-dark) | Filled controls |
| `--priority` | `#d8ad25` (gold — brighter than light mode's bronze) | The accent |
| `--ring` | `#d6ad2b` | Focus ring |

### Charts
Warm five-color set, no purple/neon: `--chart-1` (bronze/gold), `--chart-2`
(olive), `--chart-3` (terracotta), `--chart-4` (teal-slate), `--chart-5` (dusty rose).

### Rules
- **One accent.** Bronze (`--priority`) is the only color allowed to draw
  attention. Status colors appear only inside `StatusBadge`/`Badge` variants.
- **Bronze is not a small-text color in light mode.** `#8a6a28` on the canvas
  measures 4.31:1 — fine for borders, fills, icons, and large/bold text, but
  marginally below the 4.5:1 AA bar for small body text. Use ink for small text.
- **No new hex codes in components.** If a color isn't a token, it doesn't exist.
- **Never pure `#fff` / pure gray borders** — everything is warm-tinted.

---

## 2. Typography

Three voices, all self-hosted variable fonts (loaded in `tailwind.css`):

- **Fraunces** (`--font-app-display`, `font-display` utility) — display voice only:
  page titles, dialog/alert titles, empty-state titles, auth & error headlines.
  Budget: ≤5 elements per screen. Never body text, buttons, or tables.
- **Geist** (`--font-app-sans`) — all UI.
- **Geist Mono** (`--font-app-mono`) — numbers, money, IDs, table figures, kbd hints.

### Scale (classes in `components.css`)

| Class / context | Size | Weight | Notes |
|---|---|---|---|
| `.hero-number` | clamp(28–48px) | 750 | Dashboard hero figures, tabular-nums |
| `.page-title` | 1.5rem (24px) | 700 | One per page; letter-spacing −0.02em |
| `.section-title` | 1rem (16px) | 650 | Panel headings |
| Body / table text | 0.875rem (14px) | 400–500 | |
| `.field label` | 0.8125rem (13px) | 650 | Form labels |
| `.eyebrow`, `.meta-label` | 0.75rem (12px) | 650 | UPPERCASE, +0.08em tracking, muted |
| `.field-note`, captions | 0.75rem (12px) | 400 | Muted |

### Rules
- All headings get `letter-spacing: -0.02em` and `text-wrap: balance` (global).
- **All numbers that line up vertically** (money, counts, dates in tables) use
  `font-variant-numeric: tabular-nums` — via `.mono`, `.tabular-nums`, or `[data-money]`.
- Weight does hierarchy, color does de-emphasis. Don't shrink text below 12px.

---

## 3. Spacing

4px base grid. The standing values:

| Value | Use |
|---|---|
| 4 / 8px | Icon↔label gaps, badge rows (`gap: 8px`) |
| 12px | List item gaps, dense row padding (`14px` for rows is the one exception) |
| 16px | Card grids, form grids, panel padding (`.stack`, `.form-grid`) |
| 18px | `.catalog-item` internal padding |
| 24px | Large stacks (`.stack-lg`) |
| 32px | Between page sections (`.page` gap) |

Breakpoints: `640` / `768` / `1024` / `1280` (Tailwind defaults). Grids go
1-col → 2-col at 768, metrics go 4-col at 1280.

---

## 4. Corners (border-radius)

`--radius: 0.75rem (12px)` is the anchor. Smaller things are squarer, bigger
things are rounder:

| Element | Radius |
|---|---|
| Checkbox | 5px |
| Buttons | 8px (`rounded-lg`) |
| Tooltips, chart popovers | 10px |
| Cards, rows, panels | 14px (`calc(var(--radius) + 2px)`) |
| Inputs | 16px (`rounded-xl`) |
| Dialogs | 18px (`--dialog-morph-radius`) |
| Pills: badges-as-pills, pagination, avatars, progress bars | 999px |

Rule: never invent a radius. If two sibling elements have different corner
rounding for no size reason, that's a bug.

---

## 5. Shadows & Depth

Depth comes from `cream-glass.css` — soft dual-direction "warm neomorphic"
shadows (a light inset top edge + a long, very transparent drop). Pick by
**role**, not by taste:

| Token | Role |
|---|---|
| `--surface-depth-hero` | The one hero card per view (wallet balance, primary snapshot) |
| `--surface-depth-standard` | Default cards (`Card` / `glint="standard"`) |
| `--surface-depth-quiet` | Supporting panels |
| `--surface-depth-data` | Tables, chart frames (flattest — data shouldn't float) |
| `--surface-depth-edge` | Dense rows (releases, statements, queue) |
| `--surface-depth-control-inset` | Inputs (pressed-in look) |
| `--surface-depth-pressed` | Active/pressed buttons |
| `--surface-depth-slab` | Stat slabs |

Every role has a `-hover` twin that's *slightly* deeper — hover lifts, it never
glows. In dark mode the same tokens swap to inner-highlight + black drop
automatically.

The `glint` system (top-edge light line on cards) is set via the `Card`
component's `glint` prop: `hero | standard | quiet | data | edge | slab | flat | none`.

### Rules
- **No colored glows.** No `0 0 40px gold` halos around cards or buttons. This
  was removed deliberately — it reads as cheap AI-generated UI. Depth is
  monochrome; *color* is reserved for the accent border/underline.
- Don't write raw `box-shadow` values in components; use a depth token.

---

## 6. Motion

| Token | Value | Use |
|---|---|---|
| `--duration-instant` | 100ms | Color/opacity ticks |
| `--duration-fast` | 150ms | Hover color, border shifts |
| `--duration-standard` | 200ms | Shadows, transforms — the default |
| `--duration-moderate` | 300ms | Larger reveals |
| Dialog open / close | 360ms / 230ms | The morph animation (`cream-glass.css`) |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Almost everything |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Rare playful moments |

Patterns that exist — reuse, don't reinvent:
- `.page-enter` / `.stagger-enter` — fade-up page/card entrances (60ms stagger).
- `.skeleton-shimmer` (+ `-card`, `-text`, `-avatar`, `-chart`) — loading states.
  Loading is always a skeleton, never a spinner.
- Dialog morph: dialogs grow out of their trigger (origin-aware), with backdrop blur.
- `prefers-reduced-motion` collapses everything to ~0ms — already global, keep it.

Rule: hovers move things **at most 1px** (`translateY(-1px)`). Nothing loops,
nothing bounces, nothing animates longer than ~400ms.

---

## 7. Component States

### Buttons (`Button` variants)
- `default` / `destructive` — gold (or red) gradient "premium box" face with a
  bright top inset edge and dark bottom edge. Hover: lifts 1px, gradient
  brightens. Active: presses flat, inset shadow. Disabled: 52% opacity, no motion.
- `secondary` / `outline` — raised card-toned face, bronze-tinted border on hover.
- `ghost` — invisible until hover (gains border + raised face).
- `neo-raised` / `neo-inset` / `neo-subtle` — neomorphic alternates for toolbars.
- Heights: xs 28 / sm 32 / default 36 / lg 40px.

### Focus (one rule, everywhere)
A single 2px bronze ring: `outline: 2px solid color-mix(--ring 70%)`,
offset 2px, **only on `:focus-visible`** (keyboard). Inputs instead show their
own bronze border + inset ring. Never stack ring + outline + glow.

### Inputs (`.surface-field`)
Inset (pressed-in) face, 44px tall, 16px radius. Hover: border darkens.
Focus: bronze border + soft 3px ring (`--surface-depth-control-inset-focus`).
Error: `aria-invalid` → destructive border + 20% red ring.

### Rows & cards
- Cards (`.catalog-item`): hover = deeper shadow + 1px lift + bronze-tinted border.
- Dense rows (`.release-row` etc.): hover = tinted background + **3px bronze
  inset bar on the left (via `box-shadow: inset 3px 0 0`, never a real border —
  borders change layout and make the row jump)**. No lift; lists stay calm.
- Tables: header row tinted, row hover via background + inset bar, numbers
  right-aligned in mono.

### Empty / error states
`AppEmptyState` + the `Empty` ui kit: muted icon in a soft tile, one-line title,
muted description, optional action button. Never a bare "No data" string.

---

## 8. Polish inventory (already implemented — don't regress)

- Custom scrollbars: thin, pill-shaped, foreground-tinted, hover-darkening (both engines).
- Text selection: bronze-tinted (`::selection` in `tailwind.css`).
- Canvas depth: lamplight gradient + 2.4% paper grain on the body only (`--canvas-gradient`, `--canvas-grain`).
- Rolling money: `MoneyValue` with `animate` uses `@number-flow/vue` odometer digits.
- Ink scale: `--ink-1…4`, `--line-1/2` — the only allowed text/hairline colors.
- Engraved empty states: `EmptyEngraving` plates (sleeve/tonearm/drawer/envelope/rolodex/compass).
- ⌘K command palette (`CommandPalette.vue`), fed by the sidebar's NavItem registry.
- Admin density: `.app-density-compact` on the admin shell (~20% tighter tables/rows).
- Release journey: `PipelineDots` (Draft → In review → Delivering → Live).
- Theme switch cross-fades via the View Transitions API (260ms, falls back to instant).
- Print stylesheet: statements print as typeset documents (chrome hidden, ink on white).
- Favicon set: `.ico` + 16/32/48 PNG + apple-touch icon.
- Dark/light logo variants (`logo.png` / `logo-light.png`).
- Tabular numerals on all money (`MoneyValue`, `[data-money]`).
- Reduced-motion support, `text-wrap: balance/pretty`, antialiasing, `color-scheme`.

## 9. Hard "don'ts"

1. No new colors, fonts, or radii outside this document.
2. No colored glow shadows. No noise/grain overlays. No translucent
   glassmorphism on light-mode surfaces (dark-mode menus may blur — that's the
   only place).
3. No hover effects that change an element's size or padding (layout shift).
4. No second focus ring on a component — the global one already exists.
5. No spinners — skeletons only.
6. Don't add CSS outside `@layer` in `components.css`; unlayered rules
   silently override everything in layers and caused most of the bugs that
   were just cleaned out.
