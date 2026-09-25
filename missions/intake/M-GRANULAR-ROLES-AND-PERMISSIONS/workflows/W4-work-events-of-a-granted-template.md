# W4 — Work events of a granted template

**Status: approved by Brian on 2026-09-25 (specification, mockups and acceptance).**

- Purpose/intended outcome: a seat sees, or runs, only the events of the templates its job covers.
- Primary actor: any seat holding View or Manage on at least one event template.
- Entry point: Events.
- Route/placement: `/operate/events`, `/operate/events/calendar`, `/operate/events/[id]` and its delivery,
  edit, amend and cancel routes; `/operate/admin/follow-ups`. No new route. The Monday report is outside this delivery's boundary
  (`00-boundary.md`) and is unchanged.
- User-visible result: events of None templates never appear; View shows the event and everything in it
  (audience, answers, reasons, attendance); Manage adds create, update, delete, sending, approving and
  releasing invitations, and the template's messaging schedule.

## Current `main` grounding

- `/operate/events` is open to every operator; actions are gated by `event_calendar_management`,
  `event_approval` and `delivery_administration` (five seats). The seven templates on `main`: Chalk, Game,
  Meeting, Practice, Recruitment, Social, Strength and conditioning. Evidence, each photographed both sides at
  1280 and 375 and narrowed by proposal script from the review account:
  - W4-01 the events list as the Social Secretary (Manage on the Social template only), Type menu open;
  - W4-02 one social as the Social Secretary: everything visible, every manage control present;
  - W4-03 the calendar as the Social Secretary: only socials, in the Social template's own colour;
  - W4-04 the Follow-ups queue as the Social Secretary: only social events' rows;
  - W4-05 one game with View on the Game template: everything visible; create, edit, delete, send and schedule
    absent.

## Rules (from the locked decisions)

- Grants are per template, not per category or event type. A template the club adds later is one more line.
- None hides the event from the list, calendar, event pages and delivery board (Follow-ups). How the
  per-event Delivery page is scoped is delegated to the Mission Lead; the Monday report is excluded.
- Attendance is the exception: recording stays as today for every seat.
- View: every control that creates, edits, deletes, sends or schedules is absent, not disabled; _Record
  answer_ reads as the answer (—).
- Manage on at least one template: _Create event_, offering only those templates.
- Manage includes approving and releasing invitations.
- The events Type filter lists only granted templates.
- The event templates page is unchanged by this delivery.

## Core decisions

| Decision                                                  | Classification            | Governing evidence or recommended default      | Status    |
| --------------------------------------------------------- | ------------------------- | ---------------------------------------------- | --------- |
| None / View / Manage per template; None hides everywhere  | locked                    | Round 3 brief, item 3                          | recorded  |
| Templates keep their own colour; templates page unchanged | locked                    | Round 3 brief, item 3                          | recorded  |
| Attendance outside the access list                        | locked                    | Round 3 brief, item 7                          | recorded  |
| Manage includes approving and releasing invitations       | locked                    | Lead decision, round 2                         | recorded  |
| Type filter lists granted templates only                  | locked                    | Round 3 brief, W4                              | recorded  |
| "Delivery board" is the Follow-ups queue                  | locked                    | Approved as drawn on W4-04 (Brian, 2026-09-25) | recorded  |
| _Event info link_ stays for View (it shares, not sends)   | locked                    | Approved as drawn on W4-05 (Brian, 2026-09-25) | recorded  |
| A template manager cannot edit the template itself        | locked                    | Approved as drawn on W4-01 (Brian, 2026-09-25) | recorded  |
| Query filtering, report scoping, guard derivation         | delegated to Mission Lead | —                                              | delegated |

## Brian approval

- Exact words: "Other than that, I think this is approved. We can go ahead and create the packet and push it."
- Date: 2026-09-25
