# 07 — Design Guidelines

> Product design rules for Naad Backstage.
> This document complements `DESIGN.md` (tokens/specs) with behavioral design rules
> rooted in Laws of UX and the product register established in our design research.

---

## 1. Product Register

Naad Backstage is **Product UI** — an operational dashboard for royalty management.
It is NOT a marketing site, portfolio, or brand showcase.

### What this means:
- Design **serves the data**, not the other way around.
- Every element must help an operator **monitor, decide, or act**.
- Headings must be **utility copy**: describe what the section IS or what the user can DO.
  - ✅ "Earnings Overview", "Active Releases", "Import Queue", "Recent Payouts"
  - ❌ "Unleash Your Potential", "Your Journey Starts Here", "Welcome to the Future"
- No hero sections on dashboard pages.
- No marketing banners unless the system is communicating a genuine product notice.

---

## 2. Laws of UX — Applied to Naad Backstage

| Law | Application | Screen |
|-----|-------------|--------|
| **Hick's Law** | Reduce choices in artist view. One primary CTA per page. Admin can have more, but artist sees only what they can act on. | All artist-facing pages |
| **Miller's Law** | Sidebar navigation: max 7±2 visible items. Group related items into collapsible sections. | AppShell sidebar |
| **Fitts's Law** | Primary CTAs are large (`h-10 px-5`) and positioned near the user's active focus area. Destructive actions are smaller and distant. | All forms, dialogs |
| **Aesthetic-Usability Effect** | Beautiful interfaces are perceived as more usable. Invest in typography, spacing, and color discipline — it directly impacts user trust in financial data. | Every page |
| **Doherty Threshold** | System must acknowledge user action within 400ms. Show skeleton/spinner immediately on navigation. Toast confirmation on form submit. | All async operations |
| **Peak-End Rule** | Make success states memorable. Payout confirmation, statement publishing, and import completion should have polished, confident feedback. | Payout, Import, Statements |
| **Von Restorff Effect** | The one accent-colored element on screen is the most important action. Don't dilute it with multiple accent elements. | All pages |
| **Serial Position Effect** | In navigation, most-used items go first and last. "Dashboard" first, "Settings" last. | Sidebar nav ordering |
| **Jakob's Law** | Users spend most time on OTHER SaaS dashboards. Follow established dashboard patterns (sidebar nav, top metrics, data tables below). Don't reinvent layout conventions. | Layout structure |
| **Postel's Law** | Be liberal in what you accept (flexible CSV parsing), conservative in what you display (strict, validated financial data). | Import pipeline, Statements |

---

## 3. Visual Hierarchy Rules

### Heading Hierarchy (per page)
1. **One `<h1>`** — the page title. Always. No exceptions.
2. **Section headings `<h2>` or `<h3>`** — describe the section's purpose. One per section.
3. **Eyebrow labels** — uppercase, 12px, muted. Above the heading, not after it.
4. No heading should be louder than the page title.

### Information Density
- **Admin pages**: dense layout is acceptable. Multiple stat cards, tables, and panels.
- **Artist pages**: simplified. Max 4 stat cards, one primary table or chart, clear CTA.
- **Five-Second Rule**: A first-time user should understand the page purpose within 5 seconds by reading only the page title and stat labels.

### Color Discipline
- Max 1 accent color per viewport (the primary action).
- Status colors are semantic only — green=success, amber=warning, red=danger, blue=info.
- Never use status colors decoratively (e.g., colored card backgrounds for non-status purposes).

---

## 4. Component Usage Rules

### When to Use a Card
Cards are structural containers with visual weight. Use them ONLY when:
1. The unit is **independently interactive** (clickable, expandable, or actionable).
2. The unit needs **visual separation** from siblings that are functionally different.
3. The content is a **self-contained summary** that may be scanned independently.

Do NOT use cards for:
- Simple label-value pairs (use a description list or summary row).
- Wrapping a single paragraph of text.
- Adding visual "weight" to make a page look fuller.

### When to Use a DataPanel
DataPanel is the primary container for grouped content — a titled section with body content.
Use it for chart containers, form groups, and data tables.

### Stat Cards vs Inline Metrics
- Use StatCard when the metric is a **KPI** that stands alone (e.g., Total Revenue, Active Releases).
- Use inline text when the metric is **contextual** to a paragraph or table row.

### Money Display
- Always use `MoneyValue` component for financial amounts.
- Never display money as plain text without the superscript currency/decimal treatment.
- Right-align money columns in tables.

---

## 5. Accessibility Requirements

- WCAG AA compliance minimum (4.5:1 text contrast, 3:1 UI element contrast).
- All interactive elements must be keyboard-focusable.
- Focus indicator: 2px accent-color ring, visible in both light and dark modes.
- `prefers-reduced-motion: reduce` disables all non-essential animations.
- `prefers-color-scheme` is respected — dark mode is not forced on users.
- All form inputs have associated labels (never placeholder-only labels).
- Error messages are announced to screen readers (`role="alert"`).
- Touch targets: 44×44px minimum on mobile.

---

## 6. Content Rules (Utility Copy)

### Do
- "Earnings Overview" — names what the section shows
- "3 unresolved exceptions" — quantifies the state
- "Last synced 2 hours ago" — gives operational context
- "Request Payout" — imperative verb, clear action

### Don't
- "Welcome back, Artist! 🎵" — marketing fluff
- "Your music empire awaits" — aspirational nonsense
- "Powered by AI-driven insights" — tech marketing
- "Explore your data journey" — vague, un-actionable

### Loading States
- Never show bare "Loading..." text.
- Use skeleton placeholders that mirror the final layout shape.
- If load takes >3 seconds, show a progress indicator or contextual message.

---

## 7. Dark/Light Mode Parity

- Both modes must be equally readable and usable.
- Test every component in both modes before shipping.
- In dark mode, depth comes from surface-color layering, not shadows.
- In light mode, depth comes from subtle shadows plus white-card-on-gray-background.
- The accent color may shift slightly between modes (lighter in dark, richer in light) but must remain recognizably the same hue.
