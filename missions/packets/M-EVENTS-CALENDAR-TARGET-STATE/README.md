# M-EVENTS-CALENDAR-TARGET-STATE — Events & Calendar Target State

Portfolio mission **2**, from the
[Release One Mission Portfolio](https://app.notion.com/p/3bb488886d578126a88cdd747f590a01)
approved 2026-08-19. `packet.json` is the machine-readable contract; this file
is the human-readable one. Where they disagree, `packet.json` is authoritative.

**Status: `approved`.** Brian approved every workflow during intake and approved
this packet on 2026-08-21; his merge of the packet-only pull request is the
binding approval and is what authorises a Mission Lead to initialize from it.

## What the mission delivers

The club's calendar becomes the thing the club runs on.

- **A term's events arrive in one go**, by CSV import and export, instead of one
  form at a time.
- **The event record gains what it was missing** — a description, required
  equipment, an online venue, per-event questions — and loses what was never
  real: an eight-value status model, ten event types, and "response requested".
- **The calendar becomes public**, readable with no account, in a Gregorian
  month and one continuous Oxford academic year that names the club's own
  vacations, and **subscribable** into Google, Microsoft and Apple.
- **An approved event can be amended or cancelled** without losing a single
  response. Today it can be neither.
- **One table answers who was asked, what they said and who turned up**, and can
  be shared with the squad by link without giving anybody an account.
- **Occurrence assertion is retired.** Nobody marks an event as having happened;
  the register opens on a buffer before it and never closes.

## The eight workflows

|      | Workflow                                        | Existing or new                                         |
| ---- | ----------------------------------------------- | ------------------------------------------------------- |
| `W1` | Find and read events                            | The list and calendars exist; the public tier does not  |
| `W2` | Subscribe to the club calendar                  | New — no feed exists                                    |
| `W3` | Load and correct a term's events by import      | New — no import or export exists                        |
| `W4` | Draft an event and approve it with its audience | Exists; questions and deleting a draft do not           |
| `W5` | Amend or reschedule an approved event           | New — no amendment path exists                          |
| `W6` | Cancel an event                                 | New — nothing can reach `cancelled`                     |
| `W7` | See who is coming, and who turned up            | The event page exists; the table, tiers and link do not |
| `W8` | Administer event-type templates                 | New — no template exists                                |

Each has an approved specification, an approved mockup at 1280 and 375, and an
acceptance record in `acceptance/`. **37 screens**, in `mockups/index.html`.
Where a surface exists on `main`, the current build is captured beside the
proposal in `mockups/current/`.

## The boundary, and the seam that defines it

**Per-event RSVP delivery is Mission 4's, not this mission's.** Brian confirmed
the portfolio's split on 2026-08-20 rather than fusing them, which is what the
previous intake attempt did silently and what caused its packet to be rejected.

> **Mission 2 decides that a message is owed, and to whom. Mission 4 makes a
> message arrive.**

The test, when a case is unclear: _would the answer change if the club switched
from WhatsApp to email tomorrow?_ If yes, it is Mission 4's.

That puts **chase thresholds, reminder scheduling, the escalation ladder and
their recomputation when an event moves** entirely with Mission 4 — including
D75's per-type values, which the Events brief records but hands to Task 03 in
its §7 and excludes from this workflow in its §8.

## What is deliberately not here

Bulk delete (D35 retired). A paused state. An eighth event type. Per-user
timezones. Season switching — one season is open and the mission knows no other.
The RSVP page, reminders and escalation. Attendance capture beyond D71–D74.
The Monday report. Consent and cutover. The full list is `non_goals` in
`packet.json`.

## Decisions this packet changes in the approved records

Five supersessions of owner-approved decisions, each taken by Brian during
intake and **already recorded in Notion** as dated callouts on 2026-08-21:

| Decision      | Was                                                                  | Is                                                      |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| Import format | The club's own term-card spreadsheet, pending Stewart's confirmation | A CSV; no parser; conversion happens outside the system |
| D11 / Q3      | Calendar distribution "wanted and unscoped"                          | In Release One — Google, Microsoft and Apple feeds      |
| D35           | "Mass delete must exist"                                             | Retired for Release One                                 |
| D49           | An approved event is changed by returning it to draft                | Amended in place; it never leaves approved              |
| D41           | Template values flow into a draft                                    | Field by field, and never over an operator's edit       |

**Seven further corrections are proposed and unapplied**, listed in the intake
ledger's `notion-corrections.md` — including one to **Mission 4's** Task 02
brief, whose D5 names a transition (`return to draft`) this mission no longer
performs. That one has never been put to Brian and is not this packet's to
decide.

## What Brian has to do

1. **Merge this pull request.** That is the approval, and nothing executes
   before it.
2. **Apply the migration to hosted Supabase by hand**, when the Mission Lead
   reaches it. No agent does this and the pipeline never does.
3. **Decide the seven held Notion corrections.**
4. **Settle the feed hostname with LAN-126** before any subscription URL is
   published, or guarantee a permanent redirect from the URL it ships on. A
   subscription URL cannot move: it lives in a phone for a season, and a stale
   calendar is indistinguishable from one with nothing new in it.

## Provenance

Every requirement, decision and workflow row in `packet.json` cites either an
approved Notion record or a file in the intake ledger at
`missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/`, where each workflow carries
Brian's approval in his own words. `sources.md` records why each source
controls. The baseline is `main` at
`c894f1de000e1b6f20427dec41a3c86a79b3973e`.
