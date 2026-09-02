# Intake packet — M-ONBOARDING-AND-INFORMATION-COMPLETION

Portfolio mission **7**, Onboarding. Intake-artifacts only: this PR carries
exactly `missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/**` and
`missions/packets/M-ONBOARDING-AND-INFORMATION-COMPLETION/**`, proved with
`npm run intake -- pr-paths … --diff origin/main`.

**Merging this is the packet approval. Nothing executes before it.**

## What this is

Onboarding: everything between "they're in" and the day the club stops chasing
somebody. Three arrival doors, one welcome, one signed link carrying one
five-step questionnaire, a checklist the club can see and resolve, a bounded
chase that gives up and tells a human, and a human declaration that makes them
active.

## State

|                   |                                                                   |
| ----------------- | ----------------------------------------------------------------- |
| Stage             | `assembly`                                                        |
| Workflows         | **11 of 11 approved**, each in Brian's own words                  |
| Screens           | **31**, all photographed on both sides at a measured 1280 and 375 |
| Decisions         | 114 — 109 locked, 5 superseded, **none open**                     |
| Packet validation | passes; frozen inventory matches                                  |
| Owner gates       | 3, all on **LAN-213**                                             |

## Three things worth a reviewer's attention

**The inventory was amended mid-intake, twelve workflows to eleven.** The
checklist-configuration workflow had the wrong target and folded into the chase.
Brian's words and the reasoning are in `02-workflows.md`; the last workflow was
renumbered because the ledger requires consecutive numbering, and no approved
workflow's number moved.

**Three times the substrate was already built, and the specification says so
rather than proposing a duplicate.** `person_access_tokens` already enforces one
open ask per person per season; `person-record.ts` already derives who supplied
each person fact; and the messaging schedule already has an Onboarding section
whose body reads "Not built yet."

**One live constraint contradicts an approved decision.**
`onboarding_items_waiver_is_justified` refuses a reason-free waiver, which `R2-R`
requires. Unwinding it is a forward-only migration, named in the packet.

## Repository drift

Intake began at `332bc6b`; `main` moved to `0a04be7` during it (LAN-202 to
LAN-205). `main` is merged in. `W1`–`W10` were shot at the baseline and `W11`
after the merge; `shots.json` records the head SHA per screen. No approved
decision changed. Two grounding statements are stale and recorded rather than
rewritten: `W3` on LAN-204 and `W4` on LAN-202.

## Product records amended

Nine append-only notes, applied after Brian saw the whole batch and approved it
("Update these", 2026-09-02), each refetched and verified per amendment in
`state.json`. **Portfolio row 7 had contradicted the approved boundary** by
claiming this mission builds the coach and committee welcome flow; rows 7 and 9
are corrected with the old wording struck through.

## Companion branch

`chore/intake-hub-drift-note` carries the two `scripts/intake/lib/hub.mjs`
changes this work needed. They are harness tooling, not intake artifacts, and
are deliberately not in this PR.

## Production handoff

- Schema migration and filenames: **No** — this PR is documentation only
- Compatibility and deployment order: **None**
- Pilot setup required: **No**
- Pilot cleanup required: **No**
- Other Brian action: **Merge this PR** — that is the packet approval. LAN-213
  carries the three wording and legal gates, which block real sends rather than
  the build
- Verification after Brian acts: `npm run mission -- validate --packet
missions/packets/M-ONBOARDING-AND-INFORMATION-COMPLETION/packet.json
--inventory missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/02-workflows.md`
  passes on `main`
