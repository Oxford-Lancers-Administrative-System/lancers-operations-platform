# Brand assets

Three files, three jobs. Brian supplied all three on **9 September 2026**
(LAN-277), and each has exactly one place it belongs. Using the wrong one is the
mistake this table exists to prevent.

| Supplied file                   | Job                           | Lives here as                                                                                            |
| ------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Group 2454.svg`                | the **application mark**      | `crest.svg`, `crest-blue.svg`                                                                            |
| `Gold Outline Ops Logo (1).svg` | the **favicon and app icons** | `icon-mark.svg`, `icon-192.png`, `icon-512.png`, and `src/app/icon.svg`, `apple-icon.png`, `favicon.ico` |
| `OG Image.png`                  | the **link-preview image**    | `src/app/opengraph-image.png`, `twitter-image.png`                                                       |

The originals are not in this repository. They are kept on the review machine at
`~/.local/state/lancers-operations-platform/brand/` — Downloads is not durable —
under the names `app-logo-group-2454.svg`, `gold-outline-ops-logo.svg` and
`og-image.png`.

## The application mark

`Group 2454.svg` is 1094×864: three crowns — one above the cross, one to each
side — crossed lances, and a brown football (`#492820`), on a transparent ground.
It replaced the mark taken from `Group 315.svg` on 8 September 2026, which had
held these same two file names since LAN-225.

Figma's SVG export of that group writes only the top crown; its PNG export of
the same group draws all three, and the PNG is kept beside the SVG as
`app-logo-group-2454.png`, the reference. The generator puts the two side crowns
back from the file's own geometry: the top crown is the one `evenodd` path, and
each side crown is that path translated by (∓321, +298), the offsets measured
from the PNG at the artboard's own size (Brian, 2026-09-10). Nothing is redrawn.

- `crest.svg` — the white mark. Geometry untouched beyond the restored crowns;
  the viewBox is cropped to the tight bounding box of what the file actually
  draws. Figma exported the artboard, and transparent margin left in the viewBox
  would sit inside the header box and push the mark off centre.
- `crest-blue.svg` — the same geometry with the white recoloured to Oxford Blue
  (`#002147`), for `BrandMark` on light grounds. The football keeps its brown; it
  is a brown football on either ground. The Figma outside-stroke mask is left
  alone — its `fill="black"` and its white `<rect>` say which pixels the mask
  passes and are not ink.

The file names are unchanged from LAN-225, so `BrandMark` and every import keep
working. It is used by the shared `BrandMark` in the operator shell (48px box),
the compact phone header (32px), the public masthead, the sign-in screen, the
policy pages, the player-facing pages and the design-preview kit. The boxes are
square and the mark is 1.183 wide to tall, so it renders 48×41 and 32×27
respectively, centred by `preserveAspectRatio`. The club's name beside it stays
set in Geist.

It is also the mark drawn into the recruit sign-up card at
`src/app/join/[code]/opengraph-image.tsx`, which reads `crest.svg` at request
time so the card follows the logo rather than copying it.

## The favicon and app icons

`Gold Outline Ops Logo (1).svg` is a different mark — three crowns, gold
`#8D7149` outlines, 1080×867 — and it is used for icons and nothing else. The
header logo is `crest.svg`, above.

`icon-mark.svg` is that file with its viewBox cropped to `27 0 1026 866.5`.
Everything else is cut from it onto the club navy, because the mark is mostly
outline and needs a ground to read against a light or a dark browser chrome:

- `src/app/icon.svg` and the manifest's `icon-192.png` / `icon-512.png` — the
  mark at 80% of the square, which leaves enough navy to read as a badge rather
  than as a coloured block.
- `src/app/apple-icon.png`, 180px, flattened (iOS masks and rounds it itself, and
  does not want alpha).
- `src/app/favicon.ico`, holding 16, 32 and 48px PNG frames. These are cut from a
  tighter square — 92% rather than 80% — because a 16px slot cannot hold a
  three-crown mark drawn at the proportions a 512px tile uses.

## The link preview

`OG Image.png` is 1200×630: the OUL AFC crest over the stadium with the full club
name. It is used **as supplied**, unmodified, as the site-wide
`opengraph-image.png` and `twitter-image.png`. Every route shows it except
`/join/[code]`, which draws its own card.

## Regenerating

```bash
node scripts/generate-brand-assets.mjs            # from ~/.local/state/…/brand
node scripts/generate-brand-assets.mjs --source .  # or from anywhere
```

Everything in the table above is written by that script. It is not part of
`npm run verify`: it reads the supplied originals, which live outside the
repository, so it cannot run in CI. Commit what it writes.
