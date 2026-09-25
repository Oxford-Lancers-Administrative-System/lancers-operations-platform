# W4 — Work events of a granted category

**Status: specification draft (short form, round 2), pending Brian's approval.**

- Purpose/intended outcome: a seat sees, or runs, only the events of the categories its job covers.
- Primary actor: any seat holding View or Manage on at least one event category.
- Entry point: Events.
- Route/placement: `/operate/events`, `/operate/events/calendar`, `/operate/events/[id]` and its delivery,
  edit, amend and cancel routes; `/operate/admin/follow-ups`; the Monday report. No new route.
- User-visible result: events of None categories never appear; View shows the event and everything in it
  (audience, answers, reasons, attendance); Manage adds create, update, delete, sending, approving and
  releasing invitations, and the category's messaging schedule.

## Current `main` grounding

- `/operate/events` is open to every operator; actions are gated by `event_calendar_management`,
  `event_approval` and `delivery_administration` (five seats). Evidence, each photographed both sides at 1280
  and 375 and narrowed by proposal script from the review account:
  - W4-01 the events list as the Social Secretary (Manage on Social only; unchanged this round);
  - W4-02 one social event as the Social Secretary: everything visible, every manage control present;
  - W4-03 the calendar as the Social Secretary: only socials, in the Social colour from W2;
  - W4-04 the Follow-ups queue as the Social Secretary: only social events' rows;
  - W4-05 one game with View on Game: everything visible; create, edit, delete, send and schedule absent.

## Rules (from the locked decisions)

- None hides the event from the list, calendar, delivery board (Follow-ups), attendance list and report.
- Attendance is the exception: recording stays as today and the attendance surface lists every event.
- View: every control that creates, edits, deletes, sends or schedules is absent, not disabled; _Record
  answer_ reads as the answer (—).
- Manage on at least one category: _Create event_, offering only those categories' templates.
- Manage includes approving and releasing invitations (Lead decision, round 2).
- The events Type filter lists only granted categories (Lead decision, round 2).

## Core decisions

| Decision                                                 | Classification              | Governing evidence or recommended default | Status    |
| -------------------------------------------------------- | --------------------------- | ----------------------------------------- | --------- |
| None / View / Manage per category; None hides everywhere | locked                      | LAN-424 decision 4                        | recorded  |
| Attendance outside the matrix                            | locked                      | LAN-424 decision 5                        | recorded  |
| Manage includes approving and releasing invitations      | locked                      | Lead decision, round 2                    | recorded  |
| Type filter lists granted categories only                | locked                      | Lead decision, round 2                    | recorded  |
| Category colours unique; applied on the calendar         | locked                      | Lead decision, round 2; W4-03             | recorded  |
| "Delivery board" is the Follow-ups queue                 | proposed for owner approval | W4-04                                     | open      |
| _Event info link_ stays for View (it shares, not sends)  | proposed for owner approval | W4-05                                     | open      |
| Templates page stays with calendar managers              | proposed for owner approval | W4-01                                     | open      |
| Query filtering, report scoping, guard derivation        | delegated to Mission Lead   | —                                         | delegated |

## Brian approval

- Exact words: pending
- Date: pending
