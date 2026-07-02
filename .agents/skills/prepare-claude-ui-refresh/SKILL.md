---
name: prepare-claude-ui-refresh
description: Prepare the Weave frontend for a Claude Code-driven UI refresh. Use when restructuring components, introducing reusable UI primitives, aligning with Next.js 15 best practices, and preserving product logic while making the visual layer easier to redesign.
---

# Prepare Claude UI Refresh

Use this skill when working on the `weave/apps/web` frontend to prepare a future UI redesign.

## Goals

Help the agent make the frontend easier to redesign without changing core product behavior.
Prioritize:
- reusable UI primitives
- clean component boundaries
- minimal `app/` layer
- Next.js 15-friendly structure
- preservation of API and dashboard logic

## Read first

1. Read `weave/docs/CLAUDE_UI_PREP_TODO.md`
2. Inspect `weave/apps/web/app/page.tsx`
3. Inspect `weave/apps/web/components/`
4. Inspect `weave/apps/web/hooks/use-weave-dashboard.ts`
5. Inspect `weave/apps/web/lib/api.ts` and `weave/apps/web/lib/types.ts`

## Working rules

- Do not rewrite product logic unless needed for structure.
- Keep `page.tsx` as a high-level composition layer.
- Prefer extracting shared UI primitives over duplicating Tailwind class strings.
- Keep data fetching in `lib/` and orchestration in hooks.
- Only add `"use client"` where strictly necessary.
- Preserve or improve testability with stable selectors and accessible roles.
- Keep smoke E2E passing.

## Target architecture

Aim toward a structure like:
- `components/primitives/`
- `components/layout/`
- `components/dashboard/`
- `components/feedback/`

## When to extract a primitive

Extract a primitive when at least one of these is true:
- the same Tailwind class cluster appears 3+ times
- a visual pattern has variants (`primary`, `ghost`, `danger`, etc.)
- Claude will likely need to restyle it globally later
- the primitive improves consistency and reduces future churn

## When not to extract

Do not extract just for purity if:
- the code is only used once
- the abstraction hides simple markup without reuse
- the resulting API would be harder to understand than the inline JSX

## Next.js 15 guidance

- Minimize client boundaries.
- Keep layout metadata in server files where possible.
- Prefer isolated client components for interactive areas.
- If you see warnings related to config or dev origins, fix them only if the change is clear and low-risk.

## Expected outputs

Good outputs for this skill include:
- moving components into clearer folders
- creating reusable primitives like `Button`, `Panel`, `Badge`, `Input`
- extracting banners or repeated headers
- reducing class duplication
- small config cleanups that help the upcoming redesign

## Avoid

- rebuilding the old unstable full E2E flow
- changing API contracts for cosmetic reasons
- over-engineering the hook layer before the redesign brief exists
