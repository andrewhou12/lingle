# Lingle Design System

Reference spec for sizing, color, typography, and component conventions across the web app.

---

## Color Palette

### Backgrounds

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#fefefe` | Primary background |
| `--bg-pure` | `#ffffff` | Cards, elevated surfaces |
| `--bg-secondary` | `#f9f9f9` | Sidebar, secondary panels |
| `--bg-hover` | `#f3f3f3` | Hover states |
| `--bg-active` | `#ececec` | Active/pressed states |

### Text

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#1a1a1a` | Headings, primary content |
| `--text-secondary` | `#6b6b6b` | Labels, descriptions |
| `--text-muted` | `#9b9b9b` | Helper text, timestamps |
| `--text-placeholder` | `#b8b8b0` | Input placeholders |

### Borders

| Token | Value | Usage |
|-------|-------|-------|
| `--border` | `#e9e9e7` | Standard borders, dividers |
| `--border-subtle` | `#efefef` | Light card borders |
| `--border-strong` | `#d4d4d1` | Prominent borders |

### Accents

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-brand` | `#2f2f2f` | Primary buttons, logo, brand elements |
| `--accent-warm` | `#c8572a` | Alerts, stretch goals, warm highlights |

### Mastery Tiers

| Token | Value | Stage |
|-------|-------|-------|
| `--tier-new` | `#e8862a` | New/unseen items |
| `--tier-app` | `#3b6ec2` | Apprentice |
| `--tier-jour` | `#8b5cf6` | Journeyman |
| `--tier-exp` | `#22a355` | Expert |
| `--tier-master` | `#9b9b9b` | Master/stable |

### Semantic Colors

Each has three variants: base, `-soft` (8% opacity bg), `-med` (15% opacity bg).

| Name | Base | Usage |
|------|------|-------|
| Green | `#22a355` | Success, correct answers |
| Blue | `#3b6ec2` | Info, apprentice tier |
| Red | `#dc3545` | Errors, incorrect |
| Purple | `#8b5cf6` | Journeyman tier, grammar |
| Warm | `#c8572a` | Warnings, stretch challenges |

---

## Typography

### Font Families

| Token | Font | Fallbacks |
|-------|------|-----------|
| `--font-sans` | Geist Sans | -apple-system, BlinkMacSystemFont, Segoe UI |
| `--font-mono` | Geist Mono | SF Mono, Menlo, Monaco, Consolas |
| `--font-serif` | Fraunces | Georgia, serif |
| `--font-jp` | Noto Serif JP | Noto Serif JP, serif |

Fraunces is used for the logo and italic display text. Noto Serif JP covers Japanese content at weights 300-700.

### Text Size Scale

#### Minimum sizes (never go below these)

| Context | Minimum | Notes |
|---------|---------|-------|
| Body text / descriptions | **13px** | Anything a user reads for content |
| Labels, nav links | **14px** | Interactive text |
| Small badges / tags | **11px** | Pill labels like "Grammar", "Stretch" |
| Muted metadata | **12px** | Timestamps, level indicators |
| Section headers (caps) | **11px** | Uppercase with letter-spacing |

#### Size reference by role

| Role | Size | Weight | Example |
|------|------|--------|---------|
| Page title | `28px` | bold | "Ready to practice?" |
| Large focal heading | `26px` | bold | Planning page heading |
| Section heading | `20px` (`text-xl`) | semibold | Review card answer |
| Body text | `15px` | normal | Page descriptions, button labels |
| Chat text | `14.5px` | normal | Conversation messages |
| Nav links / card titles | `14px` | medium | Sidebar nav, breadcrumb, card headings |
| Labels / list items | `13px` | medium | Settings labels, challenge items, widget text |
| Sub-labels / metadata | `12px` | normal | Level text, stat descriptions |
| Tags / section labels | `11px` | medium | Uppercase sidebar labels, badges |
| Japanese display | `44px` | bold | Review card front (kanji) |
| Japanese answer | `28px` | bold | Review card back |
| Sensei avatar | `28px` | bold | 先 character |

---

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.04), 0 1px 4px rgba(0,0,0,.03)` | Cards, subtle elevation |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,.06), 0 1px 4px rgba(0,0,0,.04)` | Buttons on hover, modals |
| `--shadow-pop` | `0 4px 24px rgba(0,0,0,.1), 0 2px 8px rgba(0,0,0,.06)` | Popovers, dropdowns |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Small elements |
| `--radius-md` | 6px | Badges, inputs |
| `--radius-lg` | 8px | Buttons, cards |
| `--radius-xl` | 12px | Large cards |
| `--radius-2xl` | 16px | Hero cards, prominent surfaces |
| `rounded-full` | 9999px | Avatars, pills, progress bars |

---

## Layout

### Sidebar

| Property | Value |
|----------|-------|
| Width | `240px` (fixed) |
| Background | `bg-bg-secondary` |
| Border | `border-r border-border` |

**Logo**: `w-8 h-8` icon, `18px` italic serif text, `px-3.5 pt-4 pb-3` padding.

**Section labels**: `11px` uppercase, `tracking-[.07em]`, `pt-5 pb-2` spacing.

**Nav links**: `14px` text `font-medium`, `15px` emoji in `w-5` container, `py-1.5 px-3`, `gap-3`, `rounded-md`. Active state: `bg-bg-active text-text-primary`. Inactive: `text-text-secondary hover:bg-bg-hover`.

**Progress widget**: `13px` labels, `12px` sub-text, `h-2` progress bar, `p-4` padding, `rounded-xl`.

**User footer**: `w-9 h-9` avatar, `14px` name, `12px` level, `gap-3`.

### Top Bar

| Property | Value |
|----------|-------|
| Height | `48px` (fixed) |
| Breadcrumb size | `14px` |
| Background | `bg-bg` |
| Border | `border-b border-border` |

### Content Area

- Padding: `p-6`
- Background: `calligraphy-grid` (faint grid pattern fading downward)
- Content wrapped in `relative z-[1]` to sit above the grid

---

## Components

### Buttons

**Primary (large)**:
`rounded-xl bg-accent-brand px-8 py-3 text-[15px] font-semibold text-white`
Hover: `shadow-md scale-[1.02]`. Active: `scale-[0.98]`.

**Secondary (inline)**:
`rounded-lg px-3 py-1.5 text-[13px] font-medium`

**Danger / End session**:
`bg-warm-soft text-accent-warm hover:bg-warm-med`

### Badges & Pills

Standard: `rounded-full px-2 py-0.5 text-[11px] font-medium`
Nav badge: `min-w-[20px] h-[20px] rounded-full bg-accent-warm text-white text-[10.5px] font-bold`

### Cards

**Info cards**: `p-5 rounded-xl bg-bg-pure border border-border-subtle`. Title `14px medium`, body `13px muted`.

**Challenge card**: `p-4 rounded-lg bg-bg-pure border border-border-subtle shadow-sm`. Title `13px semibold`.

**Review card**: `p-8 rounded-xl max-w-[500px] min-h-[300px]`. Front `44px bold`, back `28px bold`, definition `text-xl`.

### Progress Bars

Height `h-1` (thin, inline) or `h-2` (widget). Always `rounded-full bg-bg-active` track with `bg-accent-brand` fill. Animate with `transition-[width] duration-300`.

### Chat Messages

Markdown body: `text-[14.5px] leading-[1.7]`. Correction cards, vocab cards, and grammar cards use structured card layouts within messages.

---

## Calligraphy Grid Background

Applied via `.calligraphy-grid` class on the content area. Uses a `::before` pseudo-element with:
- 40px grid lines using `var(--border)` color
- `opacity: .3`
- Fades out downward via `mask-image: linear-gradient(to bottom, black 0%, transparent 100%)`

---

## Conventions

1. **Never use `text-[9px]` or `text-[10px]`** for any user-facing text. Minimum is `11px` for tags/badges.
2. **Body text that users read for content should be 13px+.** If it's a description or explanation, not a label, it needs to be readable.
3. **Semantic color pattern**: Use `bg-{color}-soft` for backgrounds, `text-{color}` for text, `bg-{color}-med` for hover states.
4. **Card pattern**: `bg-bg-pure` surface, `border border-border-subtle`, `rounded-xl`, `shadow-sm` for elevation.
5. **Spacing rhythm**: Use Tailwind's scale — `gap-1` through `gap-4` for most layouts, `p-3` through `p-6` for containers.
6. **Japanese text**: Always use `font-jp` class. Display sizes are larger than equivalent English (44px for review prompts).
7. **Mastery colors**: Always use the tier tokens (`tier-new`, `tier-app`, etc.) for mastery-related UI, not raw color values.
