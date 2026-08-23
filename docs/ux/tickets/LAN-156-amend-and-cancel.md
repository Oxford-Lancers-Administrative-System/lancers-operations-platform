# LAN-156 — Amend, reschedule and cancel an approved event

Status: **implemented**, work package `WP-amend-cancel` of mission
`M-EVENTS-CALENDAR-TARGET-STATE`
Authority: Events & Calendar brief D31, D49–D61, D76, §4.13; owner decision OD-1
of 2026-08-18 (Q6, Q7, Q9); Brian's approvals of 2026-08-21 on workflows `W5`
and `W6` and their mockups
Supersedes for this path: **D49's return-to-draft**, by Brian, 2026-08-21

This is the durable contract for the amendment and cancellation surfaces. It
records what was built, in the order somebody meets it, and it names the places
where the shipped screens differ from the mockup and why.

Read with [`../slice-ux.md`](../slice-ux.md) — routes, vocabulary, authority
order — and [`../standards.md`](../standards.md), whose rules 3, 6 and 7 this
package is bound by.

## Sources this was built against

| Source                                                                                                 | What it settled                              |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/workflows/W5-amend-or-reschedule-an-approved-event.md` | The amendment, the tick, the hold, re-notify |
| `missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/workflows/W6-cancel-an-event.md`                       | Cancellation, its default, its terminality   |
| `missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/mockups/W5-amend-or-reschedule-an-approved-event.html` | Desktop 1280 and 375px, five screens         |
| `missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/mockups/W6-cancel-an-event.html`                       | Desktop 1280 and 375px, three screens        |
| `docs/ux/slice-ux.md`                                                                                  | Route registry, vocabulary, authority order  |
| `docs/ux/standards.md`                                                                                 | Rules 3, 6 and 7                             |

The mockups are the wireframes for this package. Both carry a desktop 1280 and a
375px frame for every screen, drawn from `src/theme.ts`'s own tokens, and there
are no separate SVGs — the earlier UX-nn wireframe series stops at LAN-114.

## Routes

| Route                         | Screen                                   | Who                              |
| ----------------------------- | ---------------------------------------- | -------------------------------- |
| `/operate/events/[id]`        | The two ways out, re-notify, the history | `event_approval` for the actions |
| `/operate/events/[id]/amend`  | `W5-02`, `W5-03`, `W5-03b`               | `event_approval`                 |
| `/operate/events/[id]/cancel` | `W6-01`, `W6-03`                         | `event_approval`                 |

`event_approval` rather than `event_calendar_management` for all of them. The
two capabilities name the same four roles today, so the check is currently
equivalent; `event_approval` is the one whose action is releasing messages to
real people, which is what an amendment that notifies, a re-notify and a
cancellation each do. When Brian narrows one list, these follow the right one.

Routes do not authorize. Every action re-resolves the operator from the verified
session and every refusal is thrown by the service, so a control rendered a
minute ago cannot become permission.

## The amendment — `W5`

### The event never leaves approved

The operator presses **Edit event** on an approved event and reaches an ordinary
editor. The event is `approved` before, during and after, on its own page and on
the public calendar alike. The word "draft" does not appear.

D49 makes `approved → draft` a real transition, and this path does not use it,
because D4 was decided separately: drafts are publicly visible, so an event with
thirty-seven invitations would appear publicly as a draft for the length of an
edit and indefinitely if the operator were interrupted.

### Changes are held until Save, and discarding leaves no trace

Held **in the form**, not in the database. There is no pending-amendment row and
no draft store, so abandoning is closing the tab and it writes nothing anywhere —
no event row, no history entry, no message.

The consequence for the screens is the one deliberate departure from the mockup:
the mockup annotates the review step with `?step=review`, and the shipped screen
does not change the address bar. Putting the step in the URL would mean a server
round trip, which would mean the typed-but-unsaved values had to be stored
somewhere between two renders. The screens themselves are the mockup's.

### What the operator is told before they type

`W5-02`'s panel, verbatim: how many were invited, how many said yes, how many
said no, each marked **kept**, and "Editing never discards an answer. Anything
already sent stays sent — it cannot be recalled."

### The one notify decision

**One tick for the whole amendment, never one per field.** Nobody receives three
messages because three fields moved.

Where the tick starts:

| The amendment changed                                       | The tick starts |
| ----------------------------------------------------------- | --------------- |
| Date, time, venue, or in-person-versus-online               | **On**          |
| Name, type, description, equipment, joining link, mandatory | **Off**         |
| Anything at all, on an event whose date has passed          | **Off**         |

`deliveryMode` sits with the venue rather than with the description, and that is
this package's reading rather than D55's letter: D20 and D21 made
in-person-or-online a property of the event with one venue column meaning an
address or a destination accordingly, so a practice becoming a video call
strands somebody at Iffley Road exactly as moving it to University Parks does.

When it notifies, **the whole invited audience** is told, decliners included
(OD-1/Q9). A yes stands and nobody is asked twice. There is **no reason field** —
the required description carries any explanation (OD-1/Q7).

**None of that paragraph is on the screen, and that is a rule rather than an
omission.** Brian, at the visual gate on 2026-08-23: a control says what it does
and what the consequence is; it never explains the application's design, never
justifies a default, and never instructs the operator to go and use a different
field. The notify block had grown to five paragraphs covering why decliners are
told, what happens to the people who said yes, what happens to the people who
have not answered, that two changed fields do not make two messages, and that an
explanation belongs in the description. What survives is two lines: how many
people get a message, and — only where silencing is guarded — that turning the
tick off will ask. The reasoning above stays here, in the contract, which is
where a reader who wants it should find it.

### Silence is chosen, never defaulted into

Turning the tick off on a change that moved a future event's date, time or venue
opens `W5-03b`, which names the consequence in people:

> 37 people were told this is at **Iffley Road Astro**. If you save without
> notifying, nobody will be told it has changed to **University Parks**.

The operator either goes back to notifying or presses **Save silently**, which is
what marks the confirmation passed. The service refuses a silent save that did
not pass it, so the guarantee is not the screen's.

Turning it off when only the description, the equipment or the name moved asks
nothing. So does any change to an event that has already happened.

### Saving holds the unsent messages

Saving puts a hold on every message for the event that has not gone out, so
nothing queued arrives describing a superseded value. It is a **hold**, not a
cancellation: the obligation survives, and Mission 4 decides whether each
message resumes as it was, resumes corrected, or is replaced.

The review screen says how many are held, and says nothing at all when none are.
It does not say when they were due, because when a message goes is Mission 4's.

**That number and the delivery screen's are the same number.** The amend screen
counts the event's **invitation** jobs that have not gone out; the delivery
screen sorts those same jobs into states and shows the held ones as **Held**. A
held message is therefore visible on the surface built to show delivery state,
and the **Retry** control is not offered on it, because `retryDelivery` refuses
a held job (`docs/ux/standards.md` rule 4).

Getting this wrong is what produced the finding at the 2026-08-23 gate: the
amend screen counted every job type — including the change notices a previous
amendment had itself created — while the delivery screen, correctly for its own
scope, reported on invitations alone and knew nothing about `held_at`. One event
read **47 messages have not gone out yet** on one screen and **0 Queued, 0
Delivered, 0 Failed** on the other. Both numbers were defensible in isolation,
which is why neither had a failing test. The identity
`unsent = held + queued + failed + retryable` now binds them, in
`event-amendment.test.ts`.

### Re-notify

When the last amendment went out to nobody, the event page carries `W5-04`:
what changed and when, and one button that sends the change to the same
audience. It alters neither the event nor the answers already given.

### The record

`W5-05`'s history is on the event page for anything past `draft`: when, who,
what changed, and whether people were told — **Notified 37**, **Silent**, or a
dash for an entry nobody decided about. It reads the audit stream, because the
typed `schedule_changes` history structurally cannot hold a description-only
amendment.

## Cancellation — `W6`

One operator, one action, **no approval gate**. Any of the four roles, alone,
because a waterlogged pitch does not wait for a quorum.

The screen leads with the number of people expecting to be there rather than
with the event's name. It asks why, for the record, and says that recipients
never see it. It says plainly that it cannot be undone.

Notifying defaults **on** for a future event and **off** for a past one — the
silent path exists for tidying up a session weeks gone that was never held.
Silencing a **future** cancellation opens the same shape of confirmation `W5`
uses, naming the people affected, and the cancel button is unavailable until the
operator has answered it.

A cancelled event stays visible everywhere it was — its own page, the operator
list — marked cancelled, with its history and every response it collected. It
is never deleted; deleting belongs to drafts nobody was told about, and that is
`W4`. Its page shows who cancelled it, when, whether people were told, and the
reason, marked internal. Signed RSVP links to it show it as cancelled and take
no answer.

**It is terminal.** No route returns a cancelled event to any other status,
including a direct service call.

## The Mission 4 seam

This package decides that a message is owed and to whom. It writes one
obligation per invitation and stops there — no channel, no scheduled time, no
words, no retry, no chase. Mission 4 makes the message arrive.

## Conformance with `docs/ux/standards.md`

| Rule                                        | Where it is honoured                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1 — one action's result at a time           | The amendment is one form with one outcome slot; a server refusal returns the operator to the fields                      |
| 3 — never show a raw ISO date               | `formatRecordedMoment` and `formatRecordedDay`, both guarded against an unreadable value                                  |
| 4 — a disabled control says what enables it | **Cancel the practice** is unavailable only while the silencing confirmation is open, and the panel is the sentence       |
| 6 — refusals are messages                   | Both routes render a sentence for a draft or a cancelled event rather than a form whose save would be refused             |
| 7 — one fact, one answer                    | The confirmation counts are pinned by test to the event page's headline numbers; a cancelled event's reason is shown once |

Rules 2 and 5 have nothing to bind here: neither surface shows scheduled
information beside current state, and neither searches.

## What is deliberately not here

- **Editing the audience during an amendment.** `W5`'s narrative reverses
  LAN-77's frozen audience, and the approved mockup's editor carries no audience
  control. Adding, removing and re-inviting people after approval is a surface
  nobody has drawn; it is recorded here so it is not read as an oversight.
- **Recomputing the RSVP deadline when the date moves.** `response_deadline_at`
  and each invitation's `expires_at` were set at approval and are not moved by an
  amendment. OD-1/Q6 names the **chase threshold**, which this package
  recomputes and records; the RSVP deadline is a separate value that no source
  in this mission speaks to.

## Cancelling an event that already carries attendance records

This was the one thing the package could not do when it was first delivered, and
it is now done. It is recorded here because the reasoning is the requirement's,
not an implementation detail.

`attendance_records` carries a denormalised copy of the event's status, bound by
a composite foreign key declared `on update cascade`, and
`attendance_records_require_an_approved_event` said that copy must read
`approved`. Cancelling therefore cascaded `cancelled` onto every attendance row
and the check refused it — so the cancellation failed outright.

`W6` says the opposite in words — attendance records are untouched, and a
cancelled event keeps its history — and D31 permits cancelling a past event as
an administrative correction. `D57` keeps the event visible with its history and
its responses. The case is live rather than theoretical: a coach opens the
register at 14:00 because D71's buffer lifted, the pitch floods at 18:00, and
the operator could not call the event off.

`20260823090000_attendance_survives_cancellation.sql` widens the check to
`event_status in ('approved', 'cancelled')`, which is exactly what `invitations`
already carries for invariant P1 (mission question Q-8, decided). Cancelling now
succeeds and every attendance record survives it, by count and by identity.

What did **not** change: attendance still cannot be attached to a draft, and a
cancelled event's register is still closed to new writes. The first is the check
constraint, unchanged in that half; the second is `closedReasonFor` in
`src/lib/services/attendance.ts`, which is where the "may the register be
opened?" question was already answered and remains answered once.
