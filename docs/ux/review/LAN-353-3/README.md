# LAN-353 batch 3 — visual evidence

Screenshots for the third owner-authorised batch, one folder per issue that
changes something a person looks at. Every one was taken by Playwright against
this branch, on the local synthetic seed, at a measured viewport — 1440×900 for
desktop and 375×812 for the phone. No real member data appears in any of them.

Everything here was captured against a **production build** (`npm run build`
then `next start`), not `next dev`.

| Folder     | Issue   | What it shows                                                                       |
| ---------- | ------- | ----------------------------------------------------------------------------------- |
| `LAN-387/` | LAN-387 | The roster board's new groups, and the membership record's matching sections        |
| `LAN-374/` | LAN-374 | The Special teams assignments group — six squads, four slots each, board and record |
| `LAN-375/` | LAN-375 | The Kit group — the issued-kit items and Formalwear, board and record               |
| `LAN-283/` | LAN-283 | The onboarding Done page's WhatsApp offer, and the rewritten Hudl step              |
| `LAN-384/` | LAN-384 | The club-link page's four tiles, and the operator's share panel with both buttons   |
| `LAN-363/` | LAN-363 | The Code of Conduct step's PDF viewer at 375 px, in Chromium and in WebKit          |
| `LAN-361/` | LAN-361 | The person record's Data protection panel, and the two-sign-off dialog              |

## LAN-387, LAN-374, LAN-375 — the roster's groups

`desktop-board-groups.png` and `375-board-groups.png` are the board as it
arrives: the group strip reads Person, Onboarding, Membership, Coaching
assignments, Offensive assignments, Defensive assignments, Special teams
assignments, Kit, and the last two arrive collapsed to one narrow cell each so
the row keeps its shape. `desktop-board-assignment-groups.png`,
`desktop-board-special-teams.png` and `desktop-board-kit.png` are the same
board scrolled into each group with the two collapsed ones opened — the special
teams columns show the bold squad over the italic slot the sheet uses.

`*-record-groups.png`, `*-record-special-teams.png` and `*-record-kit.png` are
the membership record carrying the same groups in the same order.

## LAN-283 — the Done page and the Hudl step

`*-done-page.png` shows the players' WhatsApp group offered above the
settled-and-outstanding summary. `*-hudl-step.png` shows the join link leading
step one, and the two steps after it referring back to it.

## LAN-384 — the tiles and the share message

`*-club-link-tiles.png` is the club-link page's headline row, with the **No**
tile beside Said yes. `*-share-panel.png` is the operator's own share panel,
carrying the club link's existing clipboard button and the new
**Copy share message** beside it. Neither sends anything: the operator pastes
the text into a group chat themselves, because the club cannot message groups.

## LAN-363 — the Code of Conduct as a PDF

Four screenshots, two per engine, all at 375 px:

| File                         | Engine              | Scroll position           |
| ---------------------------- | ------------------- | ------------------------- |
| `375-chromium-top.png`       | Playwright Chromium | the top of the document   |
| `375-chromium-last-page.png` | Playwright Chromium | scrolled to the last page |
| `375-webkit-top.png`         | Playwright WebKit   | the top of the document   |
| `375-webkit-last-page.png`   | Playwright WebKit   | scrolled to the last page |

WebKit is Safari's own engine, which is the one that matters here: iOS Safari
hands a framed PDF to its own viewer and shows a player one page with no way
through the rest. These prove the renderer draws every page into the page
itself and that the document scrolls end to end on both.

`capture.json`, beside them, is what the run measured: the viewport width the
browser reported, whether the page overflowed horizontally, how many pages were
drawn, and the console's own record of Content-Security-Policy violations and
errors. Both engines: 375 px, no horizontal overflow, five canvas pages, no CSP
violation, no console error.

The document in the screenshots is the synthetic five-page sample committed at
`public/documents/sample-conduct-document.pdf`. Nothing in it is a club rule.

## LAN-361 — anonymisation

`*-person-record.png` shows the Data protection panel at the bottom of the
record, with the export and the action. `*-erasure-dialog.png` is the dialog:
what the act is, that it cannot be undone, who has confirmed, who is still
needed, and the date the person asked. Confirm is inert until a date is entered
and the viewer is somebody who may confirm.
