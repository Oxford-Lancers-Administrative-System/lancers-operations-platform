# W4 — Work events of a granted category

**Status: specification draft (short form), pending Brian's approval.**

- Purpose/intended outcome: a seat sees, or runs, only the events of the categories its job covers.
- Primary actor: any seat holding View or Manage on at least one event category.
- Entry point: Events.
- Route/placement: `/operate/events`, the calendar, `/operate/events/[id]` and its delivery, edit, amend and
  cancel routes; the Monday report. No new route.
- User-visible result: events of None categories never appear; View shows the event and everything in it
  (audience, answers, reasons, attendance); Manage adds create, update, delete, sending and the category's
  messaging schedule.

## Current `main` grounding

- `/operate/events` is open to every operator; actions are gated by `event_calendar_management`,
  `event_approval` and `delivery_administration` (five seats). Evidence: W4-01, photographed both sides at
  1280 and 375, narrowed by proposal to a Social Secretary with Manage on Social.

## Rules (from the locked decisions)

- None hides the event from the list, calendar, delivery board, attendance list and report.
- Attendance is the exception: recording stays as today and the attendance surface lists every event.
- A seat with Manage on at least one category sees _Create event_, offering only its categories' templates.

## Core decisions

| Decision                                                 | Classification              | Governing evidence or recommended default | Status    |
| -------------------------------------------------------- | --------------------------- | ----------------------------------------- | --------- |
| None / View / Manage per category; None hides everywhere | locked                      | LAN-424 decision (brief item 4)           | recorded  |
| Attendance outside the matrix                            | locked                      | LAN-424 decision 4                        | recorded  |
| Manage includes approval and releasing invitations       | proposed for owner approval | W4-01 open question                       | open      |
| Templates page stays with calendar managers              | proposed for owner approval | W4-01                                     | open      |
| Type filter lists granted categories only                | proposed for owner approval | W4-01                                     | open      |
| Query filtering, report scoping, guard derivation        | delegated to Mission Lead   | —                                         | delegated |

## Brian approval

- Exact words: pending
- Date: pending
