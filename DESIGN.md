# Design System — foreman

## 1. Visual Theme & Atmosphere

Professional construction-industry aesthetic. Dark navy base with warm amber accents — evoking blueprint paper and construction safety. Dense information layout (dashboards, Gantt charts, financial tables). Default: dark mode. The interface should feel authoritative and data-rich, not playful.

## 2. Color Palette & Roles

### Background Surfaces
| Token | Hex | Role |
|-------|-----|------|
| `--bg-primary` | `#0f1117` | Main page background |
| `--bg-surface` | `#1a1f2e` | Cards, panels, sidebars |
| `--bg-elevated` | `#242938` | Modals, dropdowns, tooltips |
| `--bg-input` | `#1e2330` | Form inputs |

### Text & Content
| Token | Hex | Role |
|-------|-----|------|
| `--text-primary` | `#e8eaf0` | Default body text |
| `--text-secondary` | `#8b92a5` | Muted/secondary text, labels |
| `--text-disabled` | `#4a5168` | Disabled states |

### Brand & Accent
| Token | Hex | Role |
|-------|-----|------|
| `--accent-primary` | `#f59e0b` | CTAs, active states, highlights (amber) |
| `--accent-hover` | `#d97706` | Hover variant |
| `--accent-secondary` | `#3b82f6` | Links, info indicators (blue) |

### Status Colors
| Token | Hex | Role |
|-------|-----|------|
| `--status-success` | `#22c55e` | Task complete, budget on track |
| `--status-error` | `#ef4444` | Over budget, blocked tasks |
| `--status-warning` | `#f59e0b` | At-risk tasks, price changes |
| `--status-info` | `#3b82f6` | AI suggestions, neutral info |

### Phase / Priority Colors
| Token | Hex | Role |
|-------|-----|------|
| `--phase-foundation` | `#8b5cf6` | Foundation phase |
| `--phase-structure` | `#f59e0b` | Structure phase |
| `--phase-finish` | `#22c55e` | Finishing phase |

## 3. Typography Rules

### Font Family
- **Primary**: `Inter, system-ui, -apple-system, sans-serif`
- **Monospace**: `JetBrains Mono, Menlo, Consolas, monospace`

### Hierarchy
| Role | Font | Size | Weight | Line Height | Notes |
|------|------|------|--------|-------------|-------|
| Display | Inter | 2rem | 700 | 1.2 | Hero headlines, project names |
| Heading 1 | Inter | 1.5rem | 600 | 1.3 | Page titles |
| Heading 2 | Inter | 1.25rem | 600 | 1.4 | Section headings |
| Body | Inter | 0.875rem | 400 | 1.5 | Standard text, table cells |
| Caption | Inter | 0.75rem | 400 | 1.4 | Metadata, timestamps, labels |
| Code | JetBrains Mono | 0.8125rem | 400 | 1.5 | Cost formulas, IDs |

## 4. Component Stylings

### Buttons
- **Primary**: bg `--accent-primary`, text `#0f1117`, radius `6px`, font-weight 600
- **Secondary**: bg transparent, border 1px `--accent-primary`, text `--accent-primary`
- **Ghost**: bg transparent, text `--text-secondary`, hover bg `--bg-elevated`
- **Danger**: bg `--status-error`, text white
- All buttons: padding `8px 16px`, transition 150ms

### Cards & Containers
- Background: `--bg-surface`
- Border: `1px solid rgba(255,255,255,0.06)`
- Border radius: `8px`
- Padding: `16px`
- Hover: border `rgba(245,158,11,0.3)` (accent glow)

### Inputs & Forms
- Background: `--bg-input`
- Text: `--text-primary`
- Border: `1px solid rgba(255,255,255,0.1)`
- Focus border: `--accent-primary`
- Padding: `8px 12px`
- Border radius: `6px`

### Navigation
- Sidebar: `--bg-surface`, width 240px, collapsible on tablet
- Top nav: `--bg-elevated`, height 56px, project breadcrumb
- Active nav item: left border 3px `--accent-primary`, bg `--bg-elevated`
- Mobile: bottom tab bar with 5 icons

### Gantt Chart
- Row height: 40px
- Task bar: `--accent-primary` with 60% opacity, text on bar in dark
- Critical path bars: `--status-error` highlight
- Weekend shading: subtle `rgba(255,255,255,0.02)`
- Today line: 2px solid `--accent-primary`

## 5. Layout Principles

- **Spacing scale**: 4px base — 4, 8, 12, 16, 24, 32, 48, 64
- **Max content width**: 1440px (dashboard fills available width)
- **Grid**: 12-column CSS grid for dashboard layouts; flexbox for components
- **Sidebar**: 240px fixed; main content fills remainder
- **Whitespace**: Dense — construction dashboards must show a lot of data

## 6. Depth & Elevation

| Level | Shadow | Use |
|-------|--------|-----|
| Level 0 | none | Flat table rows |
| Level 1 | `0 1px 3px rgba(0,0,0,0.3)` | Cards, buttons |
| Level 2 | `0 4px 12px rgba(0,0,0,0.4)` | Dropdowns, popovers |
| Level 3 | `0 8px 32px rgba(0,0,0,0.5)` | Modals, dialogs |

## 7. Do's and Don'ts

### Do
- Use amber (`--accent-primary`) sparingly — only for primary actions and critical info
- Show monetary values with explicit currency symbol (€) and formatted with thousands separator
- Display AI reasoning inline with the suggestion (collapsible, not hidden)
- Use color-coded phase labels consistently across all views
- Show loading skeletons for async store price fetches

### Don't
- Use red for anything except errors and over-budget states
- Truncate project names without a tooltip showing the full name
- Show raw API data without formatting (dates, prices, quantities)
- Use more than 3 accent colors in a single card
- Block the UI while waiting for AI planning agent responses — stream results

## 8. Responsive Behavior

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Mobile | < 640px | Single column; bottom nav; Gantt scrolls horizontally |
| Tablet | 640–1024px | Sidebar collapses to icon rail; 2-column grid |
| Desktop | > 1024px | Full sidebar + main content; 3-column dashboard |

## 9. Agent Prompt Guide

Quick reference for AI agents generating UI for this galaxy:

- **Primary bg**: `#0f1117` (near-black navy)
- **Surface**: `#1a1f2e`
- **Accent**: `#f59e0b` (amber) — use for primary buttons and highlights only
- **Font**: `Inter` for UI, `JetBrains Mono` for code/formulas
- **Border radius**: `6px` for inputs/buttons, `8px` for cards
- **Tone**: professional, data-dense, construction-industry — dark mode default
- **Money format**: always euro cents internally; display as `€1.234,56` (Dutch locale)
- **Dates**: ISO 8601 stored; display as `dd-MM-yyyy` (Dutch locale)
