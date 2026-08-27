# Title

Prepare M-PEOPLE-AND-ROSTER mission packet

# Body

## Packet summary

**Mission 5 · People & Roster.** Seven workflows, 55 mockup screens, 24
requirements and 77 recorded decisions. `packet.json` validates as **approved**
against the frozen inventory at baseline `0d59132`.

Every human the club holds becomes findable, readable, correctable and
de-duplicable by the four-role group, and this season's squad becomes a working
board rather than a four-column list. Missions 6 and 7 then add their stages to
these surfaces rather than inventing their own.

| ID   | Workflow                                     | Surface                                                   |
| ---- | -------------------------------------------- | --------------------------------------------------------- |
| `W1` | Look up any person the club holds            | `/operate/people`, `/operate/people/[personId]` — new     |
| `W2` | Correct a person's record                    | `/operate/people/[personId]/edit` — new                   |
| `W3` | Add or link a person who holds no membership | `/operate/people/new` — new                               |
| `W4` | Merge two records for the same human         | `/operate/people/[personId]/merge` — new                  |
| `W5` | Work this season's roster                    | `/operate/roster` — **exists, redesigned**                |
| `W6` | Open one player's record                     | `/operate/roster/[membershipId]` — **exists, redesigned** |
| `W7` | Work the missing-data queue                  | `/operate/people/missing` — new                           |

`W8` was struck on 2026-08-27 and its per-person history absorbed into `W1`; the
frozen inventory is amended from eight to seven, not replaced.

### What this mission changes that is not additive

- **A frozen-model vocabulary change.** Eight membership statuses become five,
  with `carried_forward`, `confirmed` and `withdrawn` struck. Twelve dependent
  views must be dropped and recreated in the same migration; the measured blast
  radius is in `field-inventory.md`. This supersedes OD-3.
- **A shipped column is dropped.** `known_as` collapses into alias.
- **Two shipped surfaces are redesigned**, not extended, and access to them
  narrows to the four-role group.
- **Raw email and phone leave the roster grid**, replaced by contactability
  indicators.

### Mockups

`W1`–`W4` and `W7` are **drawn** on both sides, so every current side reads
_New surface, nothing to compare_. `W5` and `W6` are **photographed** on both
sides at a browser-measured 1280 and 375 — the same running page at `ceff8ef`,
differing only by the proposal in `mockups/proposals/`. No drawing is paired with
a photograph anywhere.

### Notion

Task 08 carries a dated **2026-08-27** owner amendment, applied on Brian's
instruction and verified by refetch at 20:00Z. `notion-corrections.md` records
every edit and what was deliberately left alone.

### Known limitation

`scripts/intake/lib/hub.mjs` was changed during this intake so the hub links a
rendered specification rather than raw markdown. It is **not** in this PR — an
intake PR may carry only `missions/intake/**` and `missions/packets/**` — and is
held as a patch for its own change.

## Ledger

The completed intake ledger travels with the packet in this one merge:
`missions/intake/M-PEOPLE-AND-ROSTER/**` and
`missions/packets/M-PEOPLE-AND-ROSTER/**`, and nothing else.

## Validation

- `npm run intake -- check M-PEOPLE-AND-ROSTER`
- `npm run intake -- pr-paths M-PEOPLE-AND-ROSTER --diff main`
- `npm run mission -- validate --packet missions/packets/M-PEOPLE-AND-ROSTER/packet.json --inventory missions/intake/M-PEOPLE-AND-ROSTER/02-workflows.md`

## Production handoff

- Schema migration and filenames: No
- Compatibility and deployment order: None
- Pilot setup required: No
- Pilot cleanup required: No
- Other Brian action: Merge this intake-artifacts-only PR to approve the packet
- Verification after Brian acts: Confirm the merged packet SHA on `main`
