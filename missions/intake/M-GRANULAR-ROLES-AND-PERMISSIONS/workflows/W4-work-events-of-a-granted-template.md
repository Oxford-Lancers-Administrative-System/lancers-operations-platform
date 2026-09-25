# W4 — Work events of a granted template

**Status: specification draft (short form, round 3), pending Brian's approval.**

- Purpose/intended outcome: a seat sees, or runs, only the events of the templates its job covers.
- Primary actor: any seat holding View or Manage on at least one event template.
- Entry point: Events.
- Route/placement: `/operate/events`, `/operate/events/calendar`, `/operate/events/[id]` and its delivery,
  edit, amend and cancel routes; `/operate/admin/follow-ups`; the Monday report. No new route.
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
- None hides the event from the list, calendar, delivery board (Follow-ups) and report.
- Attendance is the exception: recording stays as today for every seat.
- View: every control that creates, edits, deletes, sends or schedules is absent, not disabled; _Record
  answer_ reads as the answer (—).
- Manage on at least one template: _Create event_, offering only those templates.
- Manage includes approving and releasing invitations.
- The events Type filter lists only granted templates.
- The event templates page is unchanged by this delivery.

## Core decisions

| Decision                                                  | Classification              | Governing evidence or recommended default | Status    |
| --------------------------------------------------------- | --------------------------- | ----------------------------------------- | --------- |
| None / View / Manage per template; None hides everywhere  | locked                      | Round 3 brief, item 3                     | recorded  |
| Templates keep their own colour; templates page unchanged | locked                      | Round 3 brief, item 3                     | recorded  |
| Attendance outside the access list                        | locked                      | Round 3 brief, item 7                     | recorded  |
| Manage includes approving and releasing invitations       | locked                      | Lead decision, round 2                    | recorded  |
| Type filter lists granted templates only                  | locked                      | Round 3 brief, W4                         | recorded  |
| "Delivery board" is the Follow-ups queue                  | proposed for owner approval | W4-04                                     | open      |
| _Event info link_ stays for View (it shares, not sends)   | proposed for owner approval | W4-05                                     | open      |
| A template manager cannot edit the template itself        | proposed for owner approval | W4-01                                     | open      |
| Query filtering, report scoping, guard derivation         | delegated to Mission Lead   | —                                         | delegated |

## Brian approval

- Exact words: pending
- Date: pending
