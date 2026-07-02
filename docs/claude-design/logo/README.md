# Weave — logo concepts

Generated with the `logo-generator` skill. 6 distinct concepts, monochrome
(Notion ink `#37352f`) with a single blue accent (`#2383e2`) used only where
"emergence" is expressed.

## Files
- `showcase.html` — open in a browser to compare all 6 at multiple sizes.
- `svg/*.svg` — editable vectors, `viewBox 0 0 100 100`, `currentColor`-based.
- `png/*.png` — 1024×1024, transparent background.

## Concepts
| # | Name | Idea |
|---|------|------|
| 01 | Weave lattice | Warp & weft interlaced over/under — the literal weave. |
| 02 | **Thread W** | One strand traces a W ending in an emergent node. Monogram + story. **(recommended primary)** |
| 03 | Memory layers | Four nested scopes: personal → team → project → organization. |
| 04 | Emergence node | Memory graph converging on a hub; accent node = a skill that emerged. |
| 05 | Interlace knot | Two rings woven over/under — interconnection / shared memory. |
| 06 | Converge dots | Many contributions resolving into one focal point. Dot-matrix. |

## Recommended
**02 Thread W** — it's a literal "W" (Weave), reads as a single thread (weaving),
and the accent bead is the "emergent skill" moment. It also matches the app's
existing dark "W" tile: place the white mark on a `#37352f` `rounded-md` square.

## Final set — Thread W (`final/`)
Selected primary, developed into a full set:
- `mark.svg` — primary mark (accent bead) · `mark-mono.svg` — one-color · `mark-white.svg` — knockout for dark.
- `app-tile.svg` + `icon-1024.png` / `icon-512.png` — app icon (white mark on `#37352f`).
- `favicon-32.png` / `favicon-16.png` — favicons.
- `lockup.svg` + `lockup.png` — horizontal mark + "Weave" wordmark (Inter 600, `-1.5` tracking). Convert text to outlines on hand-off if Inter isn't embedded.

## Use as an asset for Claude Design / product
- Favicon / app icon: any `png/*.png` (transparent) or the SVG.
- App tile: mark in white on `#37352f`, `rounded-md`.
- Editable source: the SVGs — recolor by setting `color:` on the `<svg>`.

## Optional — photorealistic showcase (Nano Banana)
Requires a Gemini key. Then:
```
cd ~/.claude/skills/logo-generator
cp .env.example .env      # add GEMINI_API_KEY
pip install -r requirements.txt
python scripts/generate_showcase.py --image <path-to-png> --all-styles
```
Recommended styles for Weave (calm, SaaS, Notion-adjacent): `ui_container`,
`swiss_flat`, `clinical`, `morning`.
