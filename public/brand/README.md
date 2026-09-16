# Brand assets

One file, one job. Brian supplied the first three on **9 September 2026**
(LAN-277) and two more on **16 September 2026** (LAN-383, LAN-385), and each has
exactly one place it belongs. Using the wrong one is the mistake this table
exists to prevent.

| Supplied file       | Job                                  | Lives here as                                                                                            |
| ------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `Group 2454.svg`    | the **application mark**             | `crest.svg`, `crest-blue.svg`                                                                            |
| `Award Sticker.svg` | the **favicon and app icons**        | `icon-mark.svg`, `icon-192.png`, `icon-512.png`, and `src/app/icon.svg`, `apple-icon.png`, `favicon.ico` |
| `OG Image.png`      | the **site-wide link-preview image** | `src/app/opengraph-image.png`, `twitter-image.png`                                                       |
| `Join OG Image.png` | the **sign-up link-preview image**   | `src/app/join/[code]/opengraph-image.png`, `twitter-image.png`                                           |

The originals are not in this repository. They are kept on the review machine at
`~/.local/state/lancers-operations-platform/brand/` — Downloads is not durable —
under the names `app-logo-group-2454.svg`, `award-sticker.svg`, `og-image.png`
and `join-og-image.png`. `gold-outline-ops-logo.svg` is the mark the icons were
cut from between LAN-269 and LAN-385; it is still kept there, and nothing reads
it any more.

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

It is not used for the link previews: both cards are supplied pictures, below.
The recruit sign-up card used to be drawn from `crest.svg` at request time, and
LAN-383 replaced that with the club's own recruitment image.

## The favicon and app icons

`Award Sticker.svg` is a different mark — a white crest, three crowns, crossed
lances and the brown football on a navy `#002147` disc inside a gold `#8D7149`
ring, 1144×1144, transparent outside the circle — and it is used for icons and
nothing else. The header logo is `crest.svg`, above.

It replaced the gold-outline Ops logo on **16 September 2026** (LAN-385). It is
used **as supplied**: nothing redrawn, recoloured or re-margined. The badge
already carries its own ground and its own ring, so the navy square and the
inset the previous mark needed are gone — that wrapper existed because an
outline on nothing has to be given something to read against.

`icon-mark.svg` is the supplied file with its viewBox cropped to the mark
(`0 0 1144 1144` — the ring runs to the artboard's edge). Everything else is
rendered from it:

- `src/app/icon.svg` — the same cropped badge, byte for byte.
- The manifest's `icon-192.png` / `icon-512.png` and the three `favicon.ico`
  frames — RGBA PNGs that **keep the transparency outside the disc**, so the
  icon is a badge on whatever the browser chrome happens to be.
- `src/app/apple-icon.png`, 180px, flattened onto the navy. iOS masks the icon
  to a rounded square and paints black through any alpha, so this is the one
  raster with an opaque ground.
- `src/app/favicon.ico`, holding 16, 32 and 48px PNG frames. Straight
  downscales of the same badge: a round badge cannot be cropped tighter without
  cutting its ring off. At 16px the crowns merge into the lance cross and what
  reads is the navy disc, the gold ring and the white cross — which is a badge,
  which is the job.

## The link previews

Two pictures, both used **as supplied** and copied byte for byte. Neither is
re-encoded, recomposed or drawn over: sharp reads them only to check the
1200×630 the crawlers want.

- `OG Image.png` — the OUL AFC crest over the stadium with the full club name.
  The site-wide `src/app/opengraph-image.png` and `twitter-image.png`. Every
  route shows it except `/join/[code]`.
- `Join OG Image.png` — the club's recruitment image, LAN-383. The sign-up
  door's own card, `src/app/join/[code]/opengraph-image.png` and
  `twitter-image.png`, with `og:image:alt` and `twitter:image:alt` in the
  sibling `.alt.txt` files Next's file convention reads. It is the one link the
  club pushes at strangers, and it still reads nothing from `params`: a card
  printing the sign-up code would outlive the code in a chat transcript.

## Regenerating

```bash
node scripts/generate-brand-assets.mjs            # from ~/.local/state/…/brand
node scripts/generate-brand-assets.mjs --source .  # or from anywhere
```

Everything in the table above is written by that script. It is not part of
`npm run verify`: it reads the supplied originals, which live outside the
repository, so it cannot run in CI. Commit what it writes.
