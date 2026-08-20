# Frozen workflow inventory — M-EVENTS-CALENDAR-TARGET-STATE

**Status: FROZEN by Brian Schuster, 2026-08-20.** The IDs, order, names and
count below are locked. No agent re-derives, splits, merges, adds, removes or
renumbers them. A discovered gap becomes a proposed amendment in the section
below and requires Brian's approval and an atomic change to this file and
`state.json` together.

Definition: one primary actor's end-to-end journey from trigger and entry point
to one user-visible result. An item with no actor, or no user-visible result, is
a stage or a cross-cutting invariant — not a workflow. Those are listed
separately below, and that list is where the previous intake's inflation from
eight items to sixteen came from.

## Proposed inventory — 8 workflows

1. `W1` — Find and read events: anyone with a browser and no account → they
   know when and where the club's events are, from whichever of the three
   arrangements suits them — the list, Calendar View, or Oxford View. Calendar View and the continuous
   academic-year Oxford View, per-type colours, grouped list projections, and
   the public event page. (D1–D10, D83–D85; F3, F4)
2. `W2` — Subscribe to the club calendar: anyone → the club's events sit in
   their own Google, Microsoft or Apple calendar and keep themselves up to date
   afterwards. (Brian 2026-08-20, closing D11/Q3)
3. `W3` — Load and correct a term's events by import: the Secretary holding a
   term card → a term's worth of drafts on the calendar, and later the same
   file re-imported to update exactly the events a confirmation names, or the
   batch deleted so it can be loaded clean. Unparseable rows are refused
   individually while the rest proceed. (D32–D38, D48, D82; F2)
4. `W4` — Draft an event and approve it with its audience: an operator → an
   approved event with an explicitly confirmed audience, reached from a blank
   form, a duplicate of a past event, or an imported draft, and refused while a
   required field or the audience is missing. (D13–D26, D39, D40–D48, D78, D86;
   F5, F7, F10, F13, F16)
5. `W5` — Amend or reschedule an approved event: an operator → the event
   changed, its invitations and RSVPs intact, and the invited audience told
   about it — or deliberately not told, recoverably. (D49–D55, OD-1 Q6/Q7/Q9;
   F1)
6. `W6` — Cancel an event: an operator → the event visibly cancelled with its
   history and responses retained, everyone invited told by default, and no
   reason shown to them. (D31, D56–D61, D76; F1)
7. `W7` — See who is coming, and who turned up: an operator or anyone holding
   the club link → the three headline numbers, the audience list with RSVP and
   attendance, and the one-row-per-person participation table. (D62–D65, D68,
   D74; F7, F8)
8. `W8` — Administer event-type templates: an operator → every future draft of
   that type arrives with the right defaults, questions and audience already
   set. (D40–D42, D47, D66, D67; F9)

## What was combined, and what was not

Combined on Brian's instruction of 2026-08-20, "Yeah, combine where possible":

- Import and re-import/mass-delete are now one workflow, `W3`. Same operator,
  same screen; loading a term and correcting it are the same journey at
  different points in the term.
- Drafting and approval are now one workflow, `W4`. Approval remains the
  endpoint of an imported draft too, so `W3` hands off to `W4` rather than
  duplicating it.

Not combined, and why:

- **`W1` and `W2`** end in different results — knowing when the next game is,
  versus having the club's calendar live inside your own for the rest of the
  season. The second keeps working when nobody visits the site.
- **`W5` and `W6`** are different actions by decision, not by presentation. D56
  makes cancellation its own action rather than a round trip through draft, D61
  removes the approval gate from it, and D60 makes it terminal. Folding them
  would bury three approved rules.

## Excluded stages and invariants

Real work, deliberately not workflows. Each is either a prerequisite with no
actor journey, or a rule that applies across several workflows.

- **The status and occurrence migration.** The portfolio's named first work
  package. Nobody journeys through it and it produces no user-visible result of
  its own; it is the precondition for `W4`–`W7`. It removes
  `events_outcome_is_asserted`, narrows `event_status` to three values and
  `event_type` to seven, retires invariant E3 with its
  `events_one_approved_per_alternative_group` index, and applies the
  owner-approved legacy mapping. (D12, D27–D31, D79; F6, F14, F15)
- **Attendance availability — D71–D74.** The successor to the retired occurrence
  assertion: the sheet opens on a buffer before the event, never closes, and
  saved-versus-untouched is the record of whether the session was assessed. This
  changes an existing Task 04 journey rather than creating one, and it shows up
  as the "—" rule inside `W7`.
- **The three access tiers.** Public, club link, operator — a rule every
  workflow obeys, not a journey. (D1–D3, D81)
- **The state vocabulary.** Three stored statuses, `occurred` derived,
  attendance as a separate recorded/not-recorded axis, delivery and RSVP as
  separate axes, counts as raw pairs. (D27–D31, D73)
- **Audit recording on amendment and cancellation.** Actor, change and notify
  choice retained and queryable; internal cancellation reason never shown to
  recipients. (D54, D59, D76)
- **Everything on Mission 4's side of the seam** — scheduling, sending,
  channels, retry, diagnostics, reminders and the escalation ladder. `W5` and
  `W6` decide that a message is owed and to whom; they stop there.

## Inventory amendments

### Amendment 1 — three coverage gaps closed, 2026-08-20

A sweep of the brief's thirteen surfaces and sixteen actions against this
inventory (`coverage.md`) found three things owned by no workflow. Brian
approved closing them by widening three existing workflows rather than adding
any: "okay, that's fine."

| Gap                                                                                                         | Closed by | How                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The operator event list as a reading surface — columns, search, filters, sorting, D84's grouped projections | `W1`      | `W1` renamed from "Read the club calendar" to **"Find and read events"** and re-scoped to all three arrangements of the one query: list, Gregorian, Oxford |
| Delete a draft (D29)                                                                                        | `W4`      | The end of the drafting journey; mass delete already sat in `W3`                                                                                           |
| Issue or share the club link (§4.7, §4.15, Q2)                                                              | `W7`      | Issuing the link is how somebody else comes to see who is coming, so it belongs with the surface it unlocks                                                |

The count is unchanged at eight. No workflow was added, removed or renumbered.

## Brian approval

- **Exact approved list/count:** the eight workflows above, `W1`–`W8`, in this
  order, after the two merges Brian instructed — count 8.
- **Exact words:** "freeze it. Let's continue"
- **Date:** 2026-08-20
