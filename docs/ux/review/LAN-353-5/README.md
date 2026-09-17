# LAN-353 batch 5 — visual evidence

Captured on the batch branch `feat/lan-353-batch-5` against the local stack,
through the real application login, at the two required viewports (desktop
1440×900 and a measured 375px phone). Nothing here is hosted data: every person
and event shown is the local synthetic seed.

## LAN-395 — the scrollbar over the last folded-up roster band

`LAN-395/desktop_operate_roster.png`, `LAN-395/phone375_operate_roster.png`,
`LAN-395/desktop_operate_recruitment.png`,
`LAN-395/phone375_operate_recruitment.png` are the two routes at both widths
after the change. The board is drawn only from `md` up, so the 375px shots show
the card list, which this change does not touch — they are here to prove it did
not move.

`LAN-395/desktop_right-edge-before.png` and
`LAN-395/desktop_right-edge-after.png` are the right-hand end of the board,
scrolled fully right, with the two default folded-up bands (Special teams, then
Kit) at the end. Before, the bar covers the Kit band: half its chevron and half
its sideways name are under it. After, both are clear and the bar is beside
them.

**How the bar in those two shots was produced, stated plainly.** Headless
Chromium composites macOS-style overlay scrollbars outside the surface a
screenshot captures, so a shot taken by an agent on this machine shows no bar at
all, before or after. The dark strip in both images is therefore _drawn in_ at
the width and position macOS paints it — 15px, flush to the scroll container's
right edge — so the two states can be read side by side. It marks where the bar
goes; it is not a photograph of one. The measurement underneath it is real and
was taken from the live page:

|        | `scrollbar-gutter` | scroll container's right edge | Kit band's right edge | clear strip |
| ------ | ------------------ | ----------------------------- | --------------------- | ----------- |
| before | `auto`             | 1408px                        | 1397px                | 11px        |
| after  | `stable`           | 1408px                        | 1381px                | 27px        |

The widest overlay bar macOS draws is 15px, so 11px was not enough and 27px is.
On a platform that lays its scrollbars out in flow instead, `scrollbar-gutter:
stable` reserves the bar's own width on top of that; the cost there is a small
gap after the last column, which is what "the scrollbar beside them" asks for.
