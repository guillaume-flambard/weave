# Weave — Design Tokens (current)

Extracted from `apps/web/app/globals.css`. Aesthetic: **Notion** — white surfaces,
near-black ink, thin gray hairlines, generous whitespace, a single blue accent.
Feed these as the source of truth so Claude Design extends (not reinvents) the system.

## Color

### Neutrals
| Token | Hex | Role |
|-------|-----|------|
| `bg` | `#ffffff` | page background |
| `surface` | `#ffffff` | cards |
| `subtle` | `#f7f7f5` | secondary fill, hover, inset fields |
| `ink` | `#37352f` | primary text & headers |
| `ink-soft` | `#787066` | secondary text |
| `muted` | `#9b9a97` | captions / tertiary |
| `line` | `#e9e9e7` | hairline border (1px) |
| `line-soft` | `#f1f0ee` | lighter divider |

### Accent (single, restrained — Notion blue)
| Token | Hex | Role |
|-------|-----|------|
| `accent` | `#2383e2` | primary buttons, active, links |
| `accent-deep` | `#0b6bcb` | hover / pressed |
| `accent-soft` | `#e7f1fb` | tint fill, selection, active-badge bg |

### Memory-level semantic pills (desaturated)
| Level | Fg | Bg |
|-------|-----|-----|
| personal | `#5b8fb9` | `#eef4f9` |
| team | `#6a8f6a` | `#eef3ee` |
| project | `#8a6db0` | `#f2eef8` |
| organization | `#b08a3a` | `#f7f1e4` |

## Typography
- **Family:** `Inter`, then `-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. Antialiased.
- **Scale:** body 14px (`text-sm`); captions 11–12px; section titles 14px semibold; page title 18px (`text-lg`) semibold, `tracking-tight`.
- **Mono:** used for skill/agent identifiers (system mono).
- **Uppercase micro-labels:** 11px, `tracking-wide`, muted (sub-headings, tags).

## Shape & depth
- **Radius:** cards `rounded-lg` (~8px); inputs/buttons `rounded-md` (~6px); chips/pills `rounded-full`.
- **Borders:** 1px hairline `line`. Cards are flat — no drop shadow.
- **Elevation:** reserved for overlays only. Popover shadow `0 8px 28px rgba(15,15,15,0.12)`.

## Layout & spacing
- Page container: `max-width: 1360px`, padding `px-6 py-6`.
- Primary grid: 12-col, `gap-4`.
- Panels: bordered white cards, `p-4`, scrollable inner regions.

## Iconography
- **Library:** `lucide-react`. Line style, `strokeWidth 2`, sizes 13–16px, colored `ink-soft` (neutral) or `accent`.
- Panel icons: Activity (feed), Brain (memory), Sparkles (skills), Bot (agents), MessageSquare (ask), Building2 (org-level).

## Motion
- **Emergence** (`animate-emerge`): the "it's born" moment. Scale 0.98→1 + fading blue ring pulse `rgba(35,131,226,0.35)→0`. Duration 800ms, `cubic-bezier(0.22, 1, 0.36, 1)`.
- Selection: bg `accent-soft`, text `accent-deep`.
- Scrollbars: thin, `#d9d8d4` thumb on transparent.

## Voice / feel
Calm, precise, product-grade. Nothing shouts. Color is used sparingly and always
semantically (accent = action; level pills = provenance). The interface should read
as "this belongs inside Notion."
