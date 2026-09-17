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

## LAN-392 — an approved event keeps its audience groups

`LAN-392/desktop_event-with-late-joiner.png` and
`LAN-392/phone375_event-with-late-joiner.png` are an approved recruitment event
whose audience was built from the Recruits group, after recruits were added to
the club with the event already approved.

What to read on it:

- **Audience — "9 confirmed", "Confirmed at approval, plus 3 added since."**
  The count reflects the late joiners, and the line beside it no longer claims
  the whole audience was confirmed at approval, because it was not.
- **Distribution — "9 invitations · 0 responses · 7 queued".** Computed from the
  live rows, so the late joiners are in it.
- **Everyone asked — 7**, with Tamsin Wrayburn's **Invitation Thu 20:19** beside
  everybody else's **Invitation Wed 19:00**. That difference is the rule: the
  event's own invitation instant for the people who were there at approval, and
  her own grace-delayed instant for the person who arrived afterwards. The rungs
  after it are the event's, shared with everyone.

Every person shown is the local synthetic seed. The 375px shot is the same page
at phone width.

## LAN-393 — an operator adds a named person to an approved event

`LAN-393/desktop_amend-add-to-audience.png` and
`LAN-393/phone375_amend-add-to-audience.png` are the amend screen of the same
approved event, below the amendment form.

What to read on it:

- **Add to audience**, with **Already invited 7** and **Can be added 37** — the
  second number is the picker's own list, and every one of the seven already on
  the event is missing from it. The filter is by human, not by selection key, so
  somebody already invited as a committee member is not offered again as a
  player.
- The same rows the draft's picker draws, and the same search and capacity
  filters.
- **Add 0 to audience**, disabled until a name is ticked.

The panel is drawn only while the event is still ahead: the service refuses an
event that has started, and a control that can only be refused is not a control.
