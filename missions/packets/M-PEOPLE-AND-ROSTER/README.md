# M-PEOPLE-AND-ROSTER v1

**Status:** `not_ready` — every workflow is approved and every mockup accepted, but
four decisions taken on 2026-08-27 are not yet in Notion, so the controlling corpus
still contradicts this packet on four points. One owner action from ready. See
`packet.json → blockers`.

## Outcome

Every human the club holds is findable, readable, correctable and de-duplicable by
the four-role group, and this season's squad is a working board rather than a
four-column list. Missions 6 and 7 then add their stages — recruit doors and funnel,
onboarding and consent — to these surfaces rather than inventing their own.

## Seven workflows

| ID   | Workflow                                     | Surfaces                                                  |
| ---- | -------------------------------------------- | --------------------------------------------------------- |
| `W1` | Look up any person the club holds            | `/operate/people`, `/operate/people/[personId]` — new     |
| `W2` | Correct a person's record                    | `/operate/people/[personId]/edit` — new                   |
| `W3` | Add or link a person who holds no membership | `/operate/people/new` — new                               |
| `W4` | Merge two records for the same human         | `/operate/people/[personId]/merge` — new                  |
| `W5` | Work this season's roster                    | `/operate/roster` — **exists, redesigned**                |
| `W6` | Open one player's record                     | `/operate/roster/[membershipId]` — **exists, redesigned** |
| `W7` | Work the missing-data queue                  | `/operate/people/missing` — new                           |

`W8` was struck on 2026-08-27 and its per-person history absorbed into `W1` as a
section of the person record. The frozen inventory is amended, not replaced.

## The locked operating model

- **One status, six rungs, two records.** Recruit · Onboarding · Active · Inactive ·
  Departed · Archived. Recruit lives on the prospect record; the rest on the
  membership. Five stored values — `carried_forward`, `confirmed` and `withdrawn`
  are struck. This supersedes OD-3 and needs a migration that drops and recreates
  twelve dependent views.
- **The person-versus-season test decides every field.** Durable facts belong to the
  person; season-bound facts to the season. A player with four seasons has one person
  record and four season records.
- **A durable person fact is editable in exactly one place** — the person record,
  under `W2`'s rules. The board, player detail and the People list show those facts
  and route there to change them.
- **Season facts edit in the cell**, on the board and on player detail: one click, a
  dropdown only where the value set is fixed, commits on its own, audited, no reason.
- **Four-role only**, everywhere. Anything a role does not grant is absent from the
  DOM and the payload, not hidden in it.
- **Date of birth and emergency contact never appear on any list**, board or queue.
  Raw email and phone leave the roster grid, replaced by contactability indicators.
- **`not recorded` is explicit and never defaulted.** There is no contested-value
  state and no verification mark; a value carries who supplied it.
- **No narrative text in any surface.**

## What this mission builds that does not exist

Positions, jersey (Blue # and White #), coach group, formalwear, Blues, eligibility
and availability have no storage on `main`. This mission builds it; Mission 9 still
owns what the football fields mean.

## Reading the mockups

`mockups/index.html` is the hub. `W1`–`W4` and `W7` are **drawn** on both sides, so
every current side reads _New surface, nothing to compare_. `W5` and `W6` are
**photographed** on both sides at a browser-measured 1280 and 375 — the same running
page at `ceff8ef`, differing only by the proposal in `mockups/proposals/`. No drawing
is paired with a photograph anywhere.

## Before dispatch

Compare current `main` to the baseline. If `/operate/roster` or
`/operate/roster/[membershipId]` has moved, `W5` and `W6` must be **re-photographed**,
not merely re-read.
