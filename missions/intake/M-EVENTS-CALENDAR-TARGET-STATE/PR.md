# Title

Prepare the Events & Calendar Target State mission packet

# Body

## Packet summary

Portfolio mission **2**, `M-EVENTS-CALENDAR-TARGET-STATE`. The packet defines
what must be true for the club's calendar to become the thing the club runs on:
a term's events arriving by CSV import; the approved seven-type event model with
descriptions, equipment, online venues and per-event questions; a public
calendar in a Gregorian month and one continuous Oxford academic year,
subscribable into Google, Microsoft and Apple; amendment and cancellation of
approved events without losing a response; and one participation table answering
who was asked, what they said and who turned up. Occurrence assertion is retired
and the stored status model narrows to three.

**Eight frozen workflows, 31 requirements, 37 approved screens.** Every workflow
carries Brian's dated approval in the intake ledger, in his own words.

**Status is `approved`.** Every workflow carries Brian's dated approval in the
ledger and he approved the packet on 2026-08-21. Merging this pull request is
the binding approval and authorises Mission Lead initialization — there is no
second packet version to wait for.

**The boundary is the portfolio's, not a fused one.** Per-event RSVP delivery
stays Mission 4's: this mission decides that a message is owed and to whom,
Mission 4 makes a message arrive. That includes chase thresholds, reminder
scheduling and escalation, which the Events brief records but hands to Task 03.

## What is in the diff

`missions/packets/M-EVENTS-CALENDAR-TARGET-STATE/` and nothing else —
`packet.json`, `README.md`, `sources.md`, eight acceptance records, and the
approved mockups with their current-build screenshots.

The intake ledger that produced it lives on branch
`intake/M-EVENTS-CALENDAR-TARGET-STATE`, pushed separately so the evidence is
durable. It is deliberately not in this diff.

## Validation

```
node scripts/mission/cli.mjs validate \
  --packet missions/packets/M-EVENTS-CALENDAR-TARGET-STATE/packet.json \
  --inventory missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/02-workflows.md
# PASS — valid and approved (baseline c894f1de000e); frozen workflow inventory matches W1..W8

npx prettier --check "missions/packets/M-EVENTS-CALENDAR-TARGET-STATE/**/*.{json,md,html}"
# PASS
```

The `--inventory` comparison is mandatory for an intake-produced packet and was
run against the separately approved `02-workflows.md`, so the packet cannot
declare and validate its own expected workflow list.

## Notion corrections

**Five were applied on 2026-08-21**, as dated callouts appended to the Events &
Calendar brief and the Capability Register — no existing text was rewritten, so
each original decision and its supersession both remain readable. They record:
the import format superseded from the club's term-card spreadsheet to a CSV;
D11/Q3 closed to bring calendar distribution into Release One; D35 retired;
D49 superseded for the amendment path; and D41 clarified to per-field
inheritance. Three Capability Register entries (C3, C4, C7) were reconciled
because the brief's own F14 and OD-1/Q7 already direct those changes.

**Seven remain proposed and unapplied**, listed in the ledger's
`notion-corrections.md` — including one to **Mission 4's** Task 02 brief, whose
D5 names a transition this mission no longer performs. That one has never been
put to Brian.

## Production handoff

- **Schema migration and filenames:** No — packet only. The mission it authorises
  does carry one, as its first work package.
- **Compatibility and deployment order:** None. Nothing deploys from this.
- **Pilot setup required:** No.
- **Pilot cleanup required:** No.
- **Other Brian action:** Merge this packet-only pull request — that is the
  binding approval and what authorises execution. Then: decide the seven held Notion corrections, and settle the
  subscription-feed hostname with LAN-126 before any feed URL is published, or
  guarantee a permanent redirect from the URL it ships on.
- **Verification after Brian acts:** Confirm the merged packet SHA on `main` and
  that `missions/packets/M-EVENTS-CALENDAR-TARGET-STATE/packet.json` is present
  and valid there.

## Limitations

Six nonblocking unknowns are recorded with handling rules rather than hidden —
including how an invited player receives an online event's joining link, which
this mission stores but does not deliver.
