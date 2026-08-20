# Frozen workflow inventory — M-EVENTS-CALENDAR-TARGET-STATE

**Status: proposed, not yet frozen.** Nothing below is approved until Brian
approves the numbered list and its count, and that approval is committed here
and in `state.json`. Once frozen, no agent re-derives, splits, merges, adds,
removes or renumbers it.

Definition: one primary actor's end-to-end journey from trigger and entry point
to one user-visible result. An item with no actor, or no user-visible result, is
a stage or a cross-cutting invariant — not a workflow. Those are listed
separately below, and that list is where the previous intake's inflation from
eight items to sixteen came from.

## Proposed inventory — 10 workflows

1. `W1` — Read the club calendar: anyone with a browser and no account → they
   know when and where the club's events are. Calendar View and the continuous
   academic-year Oxford View, per-type colours, grouped list projections, and
   the public event page. (D1–D10, D83–D85; F3, F4)
2. `W2` — Subscribe to the club calendar: anyone → the club's events sit in
   their own Google, Microsoft or Apple calendar and keep themselves up to date
   afterwards. (Brian 2026-08-20, closing D11/Q3)
3. `W3` — Load a term's events by import: the Secretary holding a term card →
   a term's worth of drafts on the calendar, each carrying its type's template
   defaults, with unparseable rows refused individually. (D32, D33, D38, D48,
   D82; F2)
4. `W4` — Correct a batch: an operator whose term-card details have changed →
   the affected events updated after a confirmation naming exactly which ones
   change, or the batch deleted so it can be re-imported clean. (D34–D36; F2)
5. `W5` — Draft a single event: an operator with one event to add → a saved
   draft, visible on the calendar immediately, created from scratch or
   duplicated from a past event. (D13–D26, D39, D78, D86; F5, F10, F13, F16)
6. `W6` — Confirm the audience and approve an event: an operator → an approved
   event with an explicitly confirmed audience, refused if a required field or
   the audience is missing. (D16, D43–D48; F7)
7. `W7` — Amend or reschedule an approved event: an operator → the event
   changed, its invitations and RSVPs intact, and the invited audience told
   about it — or deliberately not told, recoverably. (D49–D55, OD-1 Q6/Q7/Q9;
   F1)
8. `W8` — Cancel an event: an operator → the event visibly cancelled with its
   history and responses retained, everyone invited told by default, and no
   reason shown to them. (D31, D56–D61, D76; F1)
9. `W9` — See who is coming, and who turned up: an operator or anyone holding
   the club link → the three headline numbers, the audience list with RSVP and
   attendance, and the one-row-per-person participation table. (D62–D65, D68,
   D74; F7, F8)
10. `W10` — Administer event-type templates: an operator → every future draft of
    that type arrives with the right defaults, questions and audience already
    set. (D40–D42, D47, D66, D67; F9)

## Excluded stages and invariants

Real work, deliberately not workflows. Each is either a prerequisite with no
actor journey, or a rule that applies across several workflows.

- **The status and occurrence migration.** The portfolio's named first work
  package. Nobody journeys through it and it produces no user-visible result of
  its own; it is the precondition for W5–W9. It removes
  `events_outcome_is_asserted`, narrows `event_status` to three values and
  `event_type` to seven, retires invariant E3 with its
  `events_one_approved_per_alternative_group` index, and applies the
  owner-approved legacy mapping. (D12, D27–D31, D79; F6, F14, F15)
- **Attendance availability — D71–D74.** The successor to the retired occurrence
  assertion: the sheet opens on a buffer before the event, never closes, and
  saved-versus-untouched is the record of whether the session was assessed. This
  changes an existing Task 04 journey rather than creating one, and it shows up
  as the "—" rule inside `W9`.
- **The three access tiers.** Public, club link, operator — a rule every
  workflow obeys, not a journey. (D1–D3, D81)
- **The state vocabulary.** Three stored statuses, `occurred` derived,
  attendance as a separate recorded/not-recorded axis, delivery and RSVP as
  separate axes, counts as raw pairs. (D27–D31, D73)
- **Audit recording on amendment and cancellation.** Actor, change and notify
  choice retained and queryable; internal cancellation reason never shown to
  recipients. (D54, D59, D76)
- **Everything on Mission 4's side of the seam** — scheduling, sending,
  channels, retry, diagnostics, reminders and the escalation ladder. `W7` and
  `W8` decide that a message is owed and to whom; they stop there.

## Two judgment calls worth your ruling

Both are places where the list could legitimately be shorter, and getting the
count wrong in either direction is what went wrong last time.

1. **`W3` and `W4` could be one workflow.** Both are the operator at the import
   screen. I split them because the triggers and results genuinely differ — a
   new term card versus details that firmed up — and because mass delete is the
   recovery path when a batch was simply wrong. Merging them gives 9.
2. **`W5` and `W6` could be one workflow.** Drafting and approving are one
   continuous act for an operator adding a single event. I split them because
   approval is also the endpoint of `W3`'s imported drafts and has its own
   refusal behaviour, so it is not exclusively the tail of drafting. Merging
   them gives 9, or 8 alongside the first merge.

## Inventory amendments

None.

## Brian approval

- Exact approved list/count:
- Exact words:
- Date:
