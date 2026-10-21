# Brand assets

Brian supplied the first three on **9 September 2026** (LAN-277) and two more on
**16 September 2026** (LAN-383, LAN-385), and each has exactly the places this
table gives it. Using the wrong one is the mistake the table exists to prevent.

| Supplied file       | Job                                                            | Lives here as                                                                                                                                     |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Award Sticker.svg` | the **application mark**, the **favicon, app icons and email** | `icon-mark.svg`, `icon-192.png`, `icon-512.png`, `crest-email.png`, `crest-email@1x.png`, and `src/app/icon.svg`, `apple-icon.png`, `favicon.ico` |
| `OG Image.png`      | the **site-wide link-preview image**                           | `src/app/opengraph-image.png`, `twitter-image.png`                                                                                                |
| `Join OG Image.png` | the **sign-up link-preview image**                             | `src/app/join/[code]/opengraph-image.png`, `twitter-image.png`                                                                                    |
| `Group 2454.svg`    | nothing since LAN-509 (was the application mark)               | —                                                                                                                                                 |

The originals are not in this repository. They are kept on the review machine at
`~/.local/state/lancers-operations-platform/brand/` — Downloads is not durable —
under the names `app-logo-group-2454.svg`, `award-sticker.svg`, `og-image.png`
and `join-og-image.png`. `gold-outline-ops-logo.svg` is the mark the icons were
cut from between LAN-269 and LAN-385; it is still kept there, and nothing reads
it any more.

## The application mark — the round crest (LAN-509)

Since **21 October 2026** (LAN-509, Brian) the application mark is the round
crest, `icon-mark.svg`, the same file as the icons below, used as supplied:
nothing redrawn, recoloured or re-margined. The shared `BrandMark` draws it in
the operator shell (48px box), the compact phone header (32px), the public
masthead, the sign-in screen, the policy pages, the player-facing pages and the
design-preview kit. One file serves both grounds: the badge carries its own navy
disc and gold ring, so the gold ring outlines it on the Oxford Blue header and
the disc reads on paper. `tone` now sets only the colour of the club's name
beside it, which stays set in Geist. The mark is square, so it fills its square
box — 48×48 and 32×32.

It is not used for the link previews: both cards are supplied pictures, below.

### The square crest it replaced

`Group 2454.svg` (1094×864: three crowns, crossed lances and a brown football on
a transparent ground) was the application mark from 8 September 2026 (LAN-278)
until LAN-509, committed as `crest.svg` (white) and `crest-blue.svg` (Oxford
Blue, for light grounds), with the two side crowns Figma's SVG export drops
restored from the file's own geometry. Both files, and the generator code that
derived them, were removed with LAN-509. The original is still kept with the
others on the review machine; nothing reads it.

## The favicon and app icons

`Award Sticker.svg` is a different mark — a white crest, three crowns, crossed
lances and the brown football on a navy `#002147` disc inside a gold `#8D7149`
ring, 1144×1144, transparent outside the circle — and since LAN-509 it is the application mark (above) as well as the icons and
the email crest (below).

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

## In an email — LAN-398, LAN-456, LAN-491

- `crest-email.png` (96×96) and `crest-email@1x.png` (48×48) — the **round
  badge**, `icon-mark.svg`, rendered square with the transparency outside the
  disc kept. Every email the app sends through Resend carries it twice: 48px in
  the header beside "Oxford Lancers", and 32px in the signature block.
  `crest-email.png` is the 2x of the larger slot and is what `src` points at;
  `@1x` is offered beside it through `srcset`, so a client that ignores `srcset`
  still gets the sharp one.

  The round crest and not the square crest (LAN-491, Brian, 7 October
  2026), with no square treatment around it: the badge carries its own navy
  ground and gold ring, so it reads on the email's white card with nothing
  behind it. It replaced LAN-456's white mark on a navy tile. Raster and not
  SVG, because Outlook on Windows draws HTML through Word, which renders an SVG
  `<img>` as an empty box.

  It is served from the application's own origin at `/brand/crest-email.png` and
  referenced absolutely, off `APP_BASE_URL`: a mail client has no page to
  resolve a relative path against. Gmail proxies and caches it, which is fine —
  it is a public logo and carries no token.

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
