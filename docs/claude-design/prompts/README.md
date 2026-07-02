# Weave — Claude Design prompt kit (demo screens)

Copy-paste prompts to generate the PennyLane demo screens in claude.ai/design, with
the **Weave Design System** loaded. Every screen is responsive (390→1440), follows
the system to the letter, and is written to convince PennyLane to invest.

## Pitch narrative (the order to demo)
1. **Org dashboard** — "your teams' AI work compounds into org intelligence" (ROI).
2. **Live workspace** — watch a skill be *born* in real time (the wow moment).
3. **Skill detail** — it's auditable: where it came from, how it got promoted.
4. **Agent detail** — specialists emerge, but stay under human governance + reason transparently.
5. **Ask the org** — answers cite their memory layers → trust, not a black box.
6. **Connect sources** — it plugs into Slack/Notion/GitHub, read-only, scoped.
7. **Admin & governance** — multi-tenant, permissions, approval queue, audit log.

## Files
- `00-system-preamble.md` — global rules. **Prepend to every screen prompt** (or pin it in the chat).
- `01`–`07` — one screen per file (goal · layout · responsive · interactions · states · acceptance).

## How to use
1. In Claude Design, confirm the Weave Design System is attached/selected.
2. Paste `00-system-preamble.md`, then one screen file. Generate.
3. Ask for the responsive check explicitly: *"show it at 390, 768, 1024, 1440 and fix any overflow."*
4. Iterate per screen (don't batch): refine spacing/hierarchy, then move on.
5. Keep data consistent — reuse the sample org data from the preamble across screens
   so the demo feels like one product, not seven mockups.

## Tips for a convincing result
- Insist on **one accent color + the 4 provenance pills** — reject any extra colors.
- Insist on **one signature motion** (emergence pulse); everything else quiet.
- Always request **empty / loading / error** states, not just the happy path.
- French UI copy, realistic PennyLane data — never placeholder text.
- Ask for **componentized React + Tailwind** so screens share buttons/cards/pills.

## After generation
- Export the code and reconcile with the real app (`apps/web`) so the shipped product
  and the pitch mockups converge on the same components.
