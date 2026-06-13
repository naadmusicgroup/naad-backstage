# DESIGN.md - Naad Backstage

> Design system source of truth. All AI-generated code must follow these rules.
> Register: product UI for an operational music royalty dashboard, not a marketing site.
> Aesthetic: Apple-inspired product restraint, warm black/ivory surfaces, expressive gold priority accents, data-dense calm.

## 1. Color

### Palette Philosophy

Naad Backstage uses warm monochrome surfaces with gold/bronze as the priority accent. The app should feel serious, financial, Apple-polished, and music-operations focused. Avoid decorative gradients, colorful bento decoration, and generic AI product styling.

Accent color is used only for primary actions, active states, focus states, key chart series, and genuine priority signals. Status colors are reserved for semantic meaning.

### Dark Mode Default

```css
--background: #0a0a0a;
--foreground: #f2f3ea;
--card: #161615;
--popover: #161615;
--secondary: #1e1e1c;
--muted: #1e1e1c;
--muted-foreground: #8a8b84;
--border: rgba(242, 243, 234, 0.1);
--input: rgba(242, 243, 234, 0.1);
--primary: #f2f3ea;
--priority: #e8c028;
--priority-hover: #f0d028;
--destructive: #e54d4d;
--status-success: #34d399;
--status-warning: #f0d028;
--status-info: #60a5fa;
```

### Light Mode

```css
--background: #f7f5ef;
--foreground: #181713;
--card: #fffdf8;
--popover: #fffefb;
--secondary: #ece7dc;
--muted: #ece7dc;
--muted-foreground: #625d52;
--border: rgba(38, 32, 23, 0.14);
--input: rgba(38, 32, 23, 0.18);
--primary: #181713;
--priority: #8a6a28;
--priority-hover: #b08d3a;
--destructive: #c43b32;
```

### Color Rules

- Never use gradient text.
- Never use purple-to-blue gradients on generic surfaces.
- Never use status colors as decoration.
- Do not make every section gold-accented; one or two priority accents per viewport is enough.
- Use CSS variables for product colors. Hardcoded colors are allowed only inside token definitions or third-party chart adapters.

## 2. Typography

```css
--font-app-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, "Geist", system-ui, sans-serif;
--font-app-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, "Geist", system-ui, sans-serif;
--font-app-body: var(--font-app-sans);
--font-app-mono: "SF Mono", "SFMono-Regular", "Geist Mono", "Cascadia Code", "Segoe UI Mono", Consolas, "Liberation Mono", ui-monospace, monospace;
```

| Role | Size | Weight | Tracking | Notes |
| --- | --- | --- | --- | --- |
| Display | 40px | 760-800 | 0 | Rare product moments only. |
| Page title | 28-32px | 740-780 | 0 | Use `text-wrap: balance`. |
| Section title | 16-18px | 650-700 | 0 | One clear idea per section. |
| Body | 15px | 400-500 | 0 | Use `text-wrap: pretty`. |
| Label | 13px | 600-700 | 0 | Form and field labels. |
| Table text | 13px | 500-650 | 0 | Keep dense rows readable. |
| Button | 14px | 600-700 | 0 | Compact, precise controls. |
| Caption | 12px | 600-700 | 0 | Uppercase is allowed, wide tracking is not. |
| Metrics/financial | 32-34px | 700-760 | 0 | Always `tabular-nums`. |

Typography rules:

- Put Apple system fonts first. Geist and Geist Mono remain fallback fonts only.
- Do not bundle Apple proprietary font files and do not add new font packages for typography.
- Financial values and table numbers must use tabular numbers.
- Do not use font sizes below 12px for readable labels.
- Shared headings, labels, table headers, buttons, badges, and metrics use `letter-spacing: 0`.
- Use type, spacing, and dividers before adding cards or shadows.

## 3. Surfaces And Depth

Default UI should be quiet. Cards are not the default way to group information.

Surface rules:

- Use cards for interactive units, stat tiles, release items, upload previews, wallet actions, and modal-like decisions.
- Use unframed layout, dividers, and headings for simple page sections, filters, and table surroundings.
- Do not nest card-looking elements inside card-looking elements unless the inner item is a repeated interactive unit.
- Shared surface classes are opt-in: `surface-card`, `surface-panel`, `surface-menu`, `surface-modal`, and `surface-field`.
- `glass-*` aliases exist only for compatibility with existing primitives and should not be added to new feature code.

Depth rules:

- Resting cards use `--surface-card-shadow` or `--shadow-sm`.
- Hoverable cards may use `--surface-card-shadow-hover`; avoid positional lift so dense dashboards stay stable.
- Dialogs and menus may use `--shadow-lg`.
- In dark mode, depth should mostly come from surface contrast, not heavy shadows.

## 4. Layout And Spacing

Gap system:

```text
Tight:    4px   gap-1
Compact:  8px   gap-2
Standard: 12px  gap-3
Relaxed:  16px  gap-4
Spacious: 20px  gap-5
Section:  24px  gap-6
Page:     32px  gap-8
```

Spacing rules:

- Touch targets are at least 44px on mobile and 36px on desktop.
- Form controls default to 44px height.
- Card padding is usually 20px to 24px.
- Avoid pill/tag clusters longer than four items unless they are in a dedicated list.

## 5. Uploader Pattern Contract

The uploader is Naad Backstage's design source of truth. Other pages should inherit its product language, not copy its exact layout onto every screen.

### Source Patterns

- Use a workbench rhythm: one primary canvas, optional sticky readiness/action rail, and compact section breaks.
- Use the release summary card as the premium card reference: quiet border, warm surface, subtle top glint, 20px to 24px padding, and no heavy glow.
- Use uploader fields as the control reference: 44px form controls, 34px compact table/actions, 10px to 12px radius, visible gold focus rings, and calm hover states.
- Use uploader status/readiness as the state reference: compact status pills, progress bars, checklist rows, disabled/read-only opacity, and direct next-action copy.
- Use uploader tables as the dense data reference: 44px rows, ellipsis for long text, semantic badges, visible row hover, and mobile rows that become readable card-like blocks.
- Use uploader empty/upload states as the action reference: clear target area, primary action, file/progress feedback, and no decorative filler.

### Product-Wide Application

- Shell, dashboards, auth, tables, forms, wallet, releases, publishing, and admin pages should look like they belong beside the uploader.
- Apple-inspired polish means system typography, restraint, spacing precision, and clarity; it must not override the uploader language.
- Naad gold is reserved for primary CTAs, active navigation, focus, readiness, progress, premium emphasis, and important product moments.
- Old dashboard screenshots are anti-reference. Do not reintroduce older glow, glass, bento, or decorative dashboard styling.

### Protected Behavior

- Do not touch upload XHR, signed storage URL handling, progress math, release submission payloads, auth, routing, Supabase calls, table contracts, or form data contracts during visual passes.
- Uploader final polish happens only after the rest of the app has caught up, and it must preserve the uploader's workflow soul.

## 6. Components

### Buttons

- Primary product CTAs use Naad gold/priority with `text-priority-foreground`.
- Active navigation, focus rings, readiness, progress, and premium product moments may use gold.
- Secondary/outline buttons stay quiet; they may pick up a subtle gold border/ring on hover or focus.
- Active state uses `scale(0.98)` and subtle brightness reduction.
- Do not use `transition-all`; transition exact properties.

### Inputs And Selects

- Use `NativeSelect` for normal selects.
- Use purpose-built popover/dropdown controls only when richer item content or multi-select behavior is needed.
- Never stack a full hidden dropdown component under another dropdown. A hidden native sentinel is acceptable for form validity.
- Focus states must be visible and use the product ring color.

### Cards And Panels

- `Card` is a quiet primitive.
- `DataPanel` is for real panel sections that need a heading and contained content.
- Do not create wrapper components that only forward props and slots.
- Tables and filters should not automatically be wrapped in card surfaces.

### Badges

- Use `StatusBadge` for status semantics.
- Use `Badge` only for non-status labels, counts, and decorative metadata.
- Status badges are informational and use `cursor: default`.

### Login Mascot

- The login mascot code path, state behavior, and interaction model are protected.
- Login page redesigns may simplify surrounding layout, gradients, and panel CSS, but must preserve the mascot behavior as-is.

## 7. Motion

Motion should clarify state or confirm action.

```css
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
--ease-in-out: cubic-bezier(0.45, 0, 0.55, 1);
--duration-fast: 150ms;
--duration-standard: 200ms;
--duration-moderate: 300ms;
```

Motion rules:

- Common control hover/focus transitions: 120ms to 220ms.
- Larger user-initiated state changes: up to 300ms.
- Avoid decorative hover animation on repeated operational controls.
- Respect `prefers-reduced-motion`.
- Do not animate width or height in new code; prefer transform or opacity.

## Anti-Slop Checklist

| # | Check |
| --- | --- |
| 1 | Warm black/gold canon is followed. |
| 2 | No generated-looking CSS imported as source. |
| 3 | No old component left underneath a new component. |
| 4 | No purple-to-blue generic gradients. |
| 5 | No gradient text. |
| 6 | No nested cards unless the inner item is a real repeated unit. |
| 7 | Financial numbers use `tabular-nums`. |
| 8 | Clickable elements use `cursor-pointer`; display-only badges use `cursor-default`. |
| 9 | Focus states are visible. |
| 10 | `prefers-reduced-motion` is respected. |
| 11 | Status colors are semantic only. |
| 12 | Page sections have one dominant idea. |
| 13 | No `transition-all` in shared primitives. |
| 14 | Dropdowns, popovers, selects, dialogs, and sheets have one visible overlay layer. |
