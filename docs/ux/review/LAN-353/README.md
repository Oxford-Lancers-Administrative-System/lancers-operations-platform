# LAN-353 — bug-fix batch, week of 15 September

Visual evidence for the UI-affecting issues in the batch. One folder per issue;
`desktop_` is captured at 1440 and `phone375_` at a measured 375px — measured by
asking the browser context its own width, not claimed. Everything was captured
from a **local production build** (`next build` then `next start`) driven by
Playwright through the real login, because two of these issues only show
themselves on a production build. Everything else in the batch is nonvisual and
says so in the pull request.

## LAN-368 — the Long Vacation before Michaelmas

Captured against a database cut down to the shape a production baseline opens a
season in: **one season and its own three terms, and nothing from the year
before**. One event was moved to three weeks before Michaelmas to stand for the
pre-season date production had nowhere to put.

| File                                        | What it is                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `LAN-368/desktop_oxford-first-segment.png`  | The Oxford View's first segment at 1440 — Long Vacation 2026, five whole weeks, counting down into Michaelmas |
| `LAN-368/phone375_oxford-first-segment.png` | The same at a measured 375                                                                                    |
| `LAN-368/desktop_oxford-full.png`           | The whole column at 1440, for the year either side of it                                                      |
| `LAN-368/phone375_oxford-full.png`          | The whole column at 375                                                                                       |

Recaptured 2026-09-16 (Brian): the leading rows now read **Long Vacation −5**
through **−1**, a countdown to Michaelmas rather than a forward count that read
as if the vacation started there; the trailing Long Vacation after Trinity is
unchanged and still counts up. The pre-season event sits in **Long Vacation
−3, 5–11 April 2026**. Before the original fix the column began at Michaelmas
and that event was listed apart from the calendar as a date the year did not
reach.

## LAN-355 — the phone country menu

| File                                | What it is                                                  |
| ----------------------------------- | ----------------------------------------------------------- |
| `LAN-355/desktop_country-menu.png`  | The calling-code menu open on `/operate/people/new` at 1440 |
| `LAN-355/phone375_country-menu.png` | The same at a measured 375                                  |

The menu reads **United States +1, United Kingdom +44, Australia +61, Austria
+43 …** at both widths. The closed control still shows `+44`, and the number box
and its validation are untouched.

## LAN-364 — the trust steps

| File                             | What it is                                                      |
| -------------------------------- | --------------------------------------------------------------- |
| `LAN-364/desktop_bucs-play.png`  | `/onboarding/<token>?step=bucs_play` at 1440, after the change  |
| `LAN-364/phone375_bucs-play.png` | The same at a measured 375                                      |
| `LAN-364/desktop_hudl.png`       | `?step=hudl` at 1440 — it never had the box, and still does not |
| `LAN-364/phone375_hudl.png`      | The same at 375                                                 |

What is left on BUCS Play is the strip, the heading, "Step 4 of 5", the privacy
sentence, the five numbered instructions with their links, "Have you done it?",
the tick and Continue. The four-cell status box is gone.

## LAN-362 — the step strip is navigation

| File                         | What it is                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `LAN-362/desktop_strip.png`  | The strip alone at 1440, on a partly completed questionnaire, Photo release current        |
| `LAN-362/phone375_strip.png` | The same at a measured 375 — one row per step, and a link has not changed any step's width |
| `LAN-362/desktop_step.png`   | The whole step page at 1440                                                                |
| `LAN-362/phone375_step.png`  | The whole step page at 375                                                                 |

Every one of the five steps is an anchor to its own
`/onboarding/<token>?step=<step>`, read back from the running page at both
widths; the current step is marked current and still links to itself.

## LAN-380 — the season panel while it saves

Captured on the production build with the link throttled to 400 kbps and 800 ms
of latency, so the saving state is on screen long enough to photograph.

| File                          | What it is                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `LAN-380/desktop_saving.png`  | The Season panel at 1440 mid-save: the field says **Saving…** and the panel takes no further edit |
| `LAN-380/phone375_saving.png` | The same at a measured 375                                                                        |
| `LAN-380/desktop_saved.png`   | The same panel once the save has landed, at 1440                                                  |
| `LAN-380/phone375_saved.png`  | The same at 375                                                                                   |

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
