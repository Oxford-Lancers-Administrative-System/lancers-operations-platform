# LAN-353 — bug-fix batch, week of 15 September

Visual evidence for the UI-affecting issues in the batch. One folder per issue;
`desktop_` is captured at 1440 and `phone375_` at a measured 375px through
`npm run visual:preflight`, which logs in for real. Everything else in the batch
is nonvisual and says so in the pull request.

## LAN-385 — the favicon and app icons

Rendered from the committed files rather than screenshotted: a browser tab
cannot be captured at the pixel sizes that decide whether this works.

| File                              | What it is                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LAN-385/favicon-light-strip.png` | The three `favicon.ico` frames on a pale chrome — 16, 32 and 48px at 8× (nearest-neighbour, so the pixels are the icon's own) and again at 1× below |
| `LAN-385/favicon-dark-strip.png`  | The same three on a dark chrome. Transparency outside the disc is real, so the strip shows through                                                  |
| `LAN-385/apple-icon-180.png`      | `src/app/apple-icon.png` as committed — the one raster with an opaque navy ground, because iOS paints black through alpha                           |
| `LAN-385/icon-512-on-grey.png`    | `public/brand/icon-512.png` composited on mid grey, showing the badge's own ring and the transparent ground outside it                              |

At 16px the three crowns merge into the lance cross; what reads is the navy
disc, the gold ring and a white cross. That is a badge, which is what the size
is for. No tighter crop was invented — cropping a round badge cuts its ring off.
