# Claude Design — Weave Design System kit

Everything to paste/attach into the **claude.ai/design** "Set up your design system"
screen, field by field, to get the strongest possible result.

## What's in this folder
- `01-company-blurb.md` — text for the **Company name and blurb** field.
- `02-other-notes.md` — text for the **Any other notes?** field.
- `design-tokens.md` — the current token set (colors, type, shape, motion). Attach as an asset.
- `screenshots/` — reference captures of the live product.
  - `01-overview-full.png` — full console (feed / memory / skills / agents / ask).
  - `02-hero.png` — above-the-fold hero view.

## Fill the form in this order

**1. Company name and blurb** → paste all of `01-company-blurb.md` (the text after the `---`).

**2. Provide examples — Link code from GitHub**
- Repo: `https://github.com/guillaume-flambard/weave`
- ⚠️ It's **private**. Claude Design can only read it if you grant access / make it
  public. If you don't want to, skip this and use the local-folder option below —
  it's actually better here.

**3. Provide examples — Link code from your computer** *(recommended route)*
- Click **browse** and select the frontend subfolder: `weave/apps/web`
  (the form itself recommends attaching a frontend-focused subfolder for large
  codebases). That gives Claude Design the real components + Tailwind tokens:
  `apps/web/app/globals.css`, `apps/web/app/page.tsx`, `apps/web/app/tour.ts`.

**4. Upload a .fig file** → none. Skip. (No Figma source exists yet.)

**5. Add fonts, logos and assets**
- Also attach `design-tokens.md` from this folder here.
- **Font:** Inter (Google Fonts / open source). No custom font file is bundled —
  the app uses `Inter` with a system fallback stack. If you have a licensed Inter
  woff2, add it; otherwise just note "Inter" in the notes.
- **Logo:** there is currently **no logo file** — the mark is a CSS "W" tile
  (dark `#37352f` square, white letter, `rounded-md`). Mention this so Claude Design
  can propose a proper wordmark/logo. If you generate one, drop it here and attach it.
- **Screenshots:** attach `screenshots/01-overview-full.png` and `02-hero.png` as
  visual references of the current aesthetic.

**6. Any other notes?** → paste all of `02-other-notes.md` (text after the `---`).

**7. Continue to generation.**

## After generation — questions to answer well
Claude Design will ask follow-ups. Steer with these answers:
- **Keep the Notion aesthetic** — white/ink/hairline, single blue accent, flat cards. Don't let it add gradients, heavy shadows, or a second bright accent.
- **Preserve the 4 provenance pill levels** (personal/team/project/organization) as a semantic scale — they map to the product's memory scoping.
- **One signature motion** = "emergence" (scale-in + fading blue ring). Keep everything else quiet.
- **Desktop-first, data-dense but airy.** B2B console, not a marketing site.
- **Locale-agnostic tokens/components** even though current UI copy is French.
- Prioritize the component list in `02-other-notes.md` (badges, panels, scope tabs, answer+provenance block, tour popover, status indicator, progress bar).

## Notes
- The `?tour=off` URL flag disables the in-app guided tour (used to capture clean screenshots).
- Regenerate screenshots: start the web app, then
  `chrome --headless=new --screenshot=out.png --window-size=1600,1400 "http://localhost:3200/?tour=off"`.
