# LAN-401 — visual evidence

Taken through the real local login at 1440×900 and at a browser context
measured 375px wide (`npm run visual:preflight`, slot `primary`, application
port 3000). `preflight.json` is that run's own evidence: the login it verified,
the head it was taken at, and the width each context reported rather than the
width it was asked for.

Head: `4f6c11f6ee14c7ea432d6332276442d4a9c7e436`
Member shown on the record: Alaric Brindlewood, membership
`8d41d0db-fdb8-489b-ad73-46e76a15d7cd`.

| File                                           | What it shows                                                                                                                                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `board-desktop-offensive-defensive-warmup.png` | The board scrolled right so Offensive assignments, Defensive assignments and Warmup assignments are on screen together, with Special teams and Kit folded either side of the new group. This is the shot the requirement asks for. |
| `board-desktop.png`                            | The same board at its resting scroll position — the header's `67 columns` is the one new column, and the group strip is unchanged at the left.                                                                                     |
| `board-375.png`                                | The roster at 375px. Below `md` the roster is a card list with no season-fact columns at all, so this group changes nothing here; the shot is the proof that it changes nothing.                                                   |
| `record-desktop.png`                           | The membership record. Warmup assignments sits between Special teams assignments and Kit, open, holding Small Group Assignment.                                                                                                    |
| `record-375.png`                               | The same record at 375px, full page.                                                                                                                                                                                               |
| `record-375-warmup-group.png`                  | The part of that page the group is in, cropped so it can be read without scrolling a 25,000px image.                                                                                                                               |

## What to look at

The board's Warmup assignments group is **folded by default**, like Special
teams and Kit. The desktop shots were taken with this operator's
`rosterCollapsedGroups` preference holding `["specialTeams", "kit"]` — that is,
with the operator having opened Warmup once — because a folded group shows one
vertical name and nothing of the cell under test. `record-desktop.png` shows
the default the other way round on Special teams and Kit, both folded.

In `board-desktop-offensive-defensive-warmup.png` the Defensive assignments
column also carries the vocabulary correction: the cells read `NT` and `DE`,
not `N/T`.

## Not evidence for

Nothing here shows the production baseline or the showcase. Those two files are
under `scripts/production/`, which this branch does not touch; the matching
change is written out as `production-scripts.diff` in this folder for Brian to
apply.
