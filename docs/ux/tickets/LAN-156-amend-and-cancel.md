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

Every action re-resolves the operator from the verified session. R156-A2: this
used to say every refusal is thrown by the service — it is not.
`event_approval` is enforced at the route guard (`gateShellPage`, in
`amend/page.tsx` and `cancel/page.tsx`) and again at each server action
(`requireCapability`, in `change-actions.ts`). The service layer
(`event-amendment.ts`) calls `requireActor`, which confirms the actor exists;
it does not check the capability. A control rendered a minute ago is
re-checked at the route and at the action before anything happens, not
trusted because it rendered.

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

### A second tab cannot revert what the first one saved — LAN-244

The form posts the version it was opened on alongside the fields, and the save
applies **only the fields that differ from it**. Everything else keeps whatever
the row holds now, including a value another tab wrote in the meantime.

This is not a refinement of REQ-amend-in-place; it is what makes the change
history true. Before it, two tabs open on one event were destructive by
construction — tab B, never refreshed, carried tab A's superseded venue in its
snapshot, so the venue silently reverted and the history recorded "Venue: M2W Tab
A Venue → Blues Gym, Iffley Road" as an amendment somebody had made. With two
operators it would have attributed that reversion to the second one.

Two operators editing two different fields now both get their change. Two editing
the same field is still last-write-wins, which is honest, and it is recorded as
the change it actually was — from the value that was there, not from the value
the stale tab remembered. A save whose every field is already stored is refused
as "Nothing has changed yet."

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
with the event's name — "25 of 37 invited are expecting to be there". "Expecting
to be there" means **said yes**, which is settled: the attendance board splits on
the standing RSVP for this exact phrase, and a no and a nonresponse are the same
expectation (Brian, 14 August 2026). The invited count joined it under LAN-242
because on a freshly approved event nobody has answered yet, so the headline read
a bare "0 people are expecting to be there" over sixty-one live invitations — the
count was true and the sentence still read as though cancelling reached nobody.
It asks why, for the record, and says that recipients never see it. It says
plainly that it cannot be undone.

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

## Decision history relocated from source (LAN-300)

### src/app/operate/events/[id]/amend/amend-form.tsx — `AmendForm` (module header)

> ## The fields are not unmounted between panels
>
> They are hidden. A `<form>` posts the inputs it contains, so unmounting the
> editor to show the review would post an empty amendment — and re-mounting it
> afterwards would lose what was typed. `hidden` on the container keeps them in
> the document, keeps them out of the accessibility tree, and keeps them in the
> submission.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/amend/amend-form.tsx — `AmendForm` (module header)

> ## The review reads the form, not a copy of it
>
> `readDraft()` builds the diff from `new FormData(formRef.current)` at the
> moment the operator presses **Save changes…**, so what the review panel shows
> is what the submit will send. `VenueField` became a controlled combobox
> under LAN-154 — every consumer now owns a `value`/`onValueChange` pair
> rather than an uncontrolled `defaultValue` — but `venue` state here is not a
> private copy in the sense this note used to warn about: React keeps the
> field's own DOM input in sync with that state on every render, so
> `readDraft()`'s `FormData` read and what the field visibly shows can never
> disagree. A review built from a private copy is the shape that produces a
> screen agreeing with itself and disagreeing with the database; a controlled
> field's state is not that copy, because nothing else can hold the truth.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/presentation.ts — AUDIENCE_FROZEN_AT_APPROVAL

> What the Audience fact says once there is one.
>
> It used to add "Adding or removing someone afterwards is deliberately not
> possible in this workflow". LAN-156 took that sentence out, for two reasons.
> It narrated a rule rather than saying what the screen shows, which is the
> thing Brian has asked for repeatedly. And W5's "second reversal of LAN-77"
> records D49 and D50 as overriding the claim it made: an approved event can
> now be changed, and the sentence sat directly above an **Edit event** button
> saying it could not.
>
> The audience is still not editable during an amendment — no surface in the
> approved mockups offers that — and the honest way to say so is to say nothing
> about it rather than to describe a permanence the mission has reversed.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/change-presentation.ts — module header

> The words the amendment and cancellation surfaces use — W5 and W6, LAN-156.
>
> Pure, and separate from the components for the reason every other
> `presentation.ts` in this route is: a string a screen shows and a string a
> test asserts have to be the same string, and the only way to guarantee that
> is for both to import it.
>
> ## Where this copy came from
>
> Almost all of it is the approved mockup's, verbatim — Brian read the six
> screens of `W5` and the three of `W6` and approved them on 2026-08-21, and
> rewriting approved copy into something similar is how a screen stops being
> the one that was approved.
>
> Where it is not verbatim, it is because the mockup states a fact this build
> cannot state honestly. The mockup says "2 reminders were due to go out on
> Tuesday"; nothing in this mission knows when a queued message was due,
> because when a message goes is Mission 4's, so the sentence says how many
> have not gone and stops.
>
> ## What the copy does not do — Brian, 2026-08-23, at the visual gate
>
> **A control says what it does and what the consequence is. Nothing else.** It
> never explains the application's design, never justifies a default, and never
> instructs the operator to go and use a different field.
>
> That rule arrived because this file had drifted the other way. It carried a
> sentence explaining why people who declined are told anyway, one explaining
> what happens to the people who said yes, one explaining what happens to the
> people who have not answered, one explaining that the record "gets tidied",
> one explaining that two changed fields do not produce two messages, and a
> whole block explaining that there is no reason field and that the operator
> should put an explanation in the description instead. Every one of them
> answered a question nobody had asked, and together they buried the two facts
> that decide the action: how many people get a message, and whether turning
> the tick off will stop and ask.
>
> **A default does not need a reason on screen.** Where the tick starts is
> visible; why it starts there is not the operator's problem. Where a sentence
> had nothing left after its justification was removed, the function now
> returns `null` and the surface renders nothing rather than a line of filler.
>
> The mockup's copy is still the source where the mockup says something. This
> rule cuts; it does not rewrite approved sentences into different ones.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/change-presentation.ts — queuedMessagesDetail

> What saving does to messages that have not gone out — LAN-156's hold.
>
> `null` when there are none: a heading and a line saying nothing is waiting is
> a fact about nothing, and the surface renders neither.
>
> The count is the one the **delivery** screen reports as **Held** after the
> save, and `readAmendmentContext` scopes it to invitation jobs for exactly
> that reason — see the cross-surface test in `change-screens.test.tsx`. It
> previously counted every job type, so an event whose only unsent jobs were
> change notices from an earlier amendment announced a number the delivery
> screen showed as zero.
>
> R156-B3. This used to end "… held until you tell people about this
> change", which promised that notifying — now or later, at Save or at
> Re-notify — released the hold. At the time nothing in the repository ever
> cleared `held_at`; W8 is Mission 4's decision arriving, and
> `resumeHeldMessagesIn` in `event-amendment.ts` now releases every held job
> in the same save that holds it — held is never a resting state a page
> reload can observe. The sentence says that, and stops: which held messages
> and when each was due is the panel's own list, not this one line.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/delivery/presentation.ts — DELIVERY_STATE_LABELS

> § 6's five, plus **Held**.
>
> Held is LAN-156's and it is not a sixth provider status — it is the club
> stopping its own message. § 6's vocabulary describes what the provider did
> with a message, and a held message has not been offered to the provider at
> all, so no existing word covers it. It was previously rendered as **Queued**,
> which told the operator the opposite of the truth: that it was on its way.
>
> LAN-156 (R156-B2), on cancelled: not a provider outcome either, for the same
> reason Held is not — the club stopped the message itself, before it ever
> reached a provider. Distinct from Held because there is nothing left to
> resume — the event is terminal.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/delivery/presentation.ts — describeRetryability

> The note under the Retry fact.
>
> Result and Retry are separate axes — a **Failed** delivery whose cause a human
> has since fixed is still worth one more attempt — so this has to describe
> retryability without contradicting the result shown beside it. It previously
> read "Failed after 1 attempts…" under the value **Retryable**, which is both
> ungrammatical and the opposite of what the value said.
>
> LAN-156. Says what stopped it. It used to add "Re-notify to send the
> change", which told the operator that pressing Re-notify sends _this_
> message — R156-B3. Re-notify writes a separate notice job; nothing here
> ever clears `held_at`, so that sentence promised a release the codebase
> does not perform. Whether a held job itself ever resumes is Mission 4's
> decision, so this says only what is true today and stops.
>
> LAN-156 (R156-B2). The event is cancelled and terminal, so unlike Held
> there is nothing to say would release it — nothing will.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/change-actions.ts — module header

> The three actions W5 and W6 add to an approved event — LAN-156.
>
> ## Authorization
>
> All three guard on `event_approval`, and that is the deliberate choice rather
> than the convenient one. `event_calendar_management` names the same four
> roles today, so the check is currently equivalent either way — and
> `event_approval` is the capability whose action is "approve an event and
> release its invitations", which is exactly what these three do. An amendment
> that notifies, a re-notify and a cancellation all make a message owing to
> every invited person. When Brian narrows one of the two lists, these actions
> follow the one that gates messages to real people.
>
> W5 says "Approval capability is required, enforced in the service layer",
> and W6 says a non-operator attempt "is refused in the service layer" — but
> as of this correction (LAN-181, F-D1) neither is what `event-amendment.ts`
> does. It carries no authorization call at all; `requireActor()` there
> checks only that an actor id was named for the audit row, not that the
> caller holds `event_approval`. **This guard is not a courtesy in front of a
> service-layer backstop — it is the only gate that exists.** Deleting it from
> any of the three actions below removes every authorization check on the
> path that sends a message to every invited person, and
> `change-actions.test.ts` is written to prove exactly that: deleting the
> guard turns the suite red.
>
> A service-layer backstop was deliberately not added here. `event-amendment.ts`
> is LAN-180's file, adding one changes the three functions' signatures (they
> take `actorPersonId: string`, not role codes), and doing that as a
> side effect of a fixture-and-proof ticket would be exactly the kind of
> silent scope creep this working agreement rules out. If W5/W6's own words
> are meant literally, building that backstop is a decision for whoever owns
> `event-amendment.ts` next — not a gap this comment should keep asserting is
> already closed.
>
> ## Why the silence confirmation is checked twice — R156-A3
>
> The screen shows the confirmation and posts `silenceConfirmed` only after the
> operator has passed it. That is what the operator experiences, and it is not
> the whole guarantee: a server action is a POST endpoint the browser can
> call directly, so a client that skips the screen entirely and posts
> `notify=off` with no `silenceConfirmed` field at all is refused —
> `amendApprovedEvent` and `cancelEvent` require the flag, rather than
> defaulting a missing one to `false` and silencing by accident.
>
> What this does **not** guarantee: `silenceConfirmed` is itself a
> client-asserted boolean, indistinguishable on the wire from a screen an
> operator actually clicked through and a raw POST that simply sets it to
> `true`. The service can refuse an omitted confirmation; it cannot tell a
> confirmed dialog from a forged one, because nothing about the request ties
> it to having been shown. The acceptance evidence — "cannot be done without
> passing a confirmation" — is asserted against the service, and is true in
> exactly that narrower sense.
>
> ## Why a refusal is never a form message
>
> `NotPermitted` is rethrown rather than rendered, exactly as `../actions.ts`
> does it and for the same reason: a refusal shown as red text beside a field
> reads as "fix your input", which hides an authorization event inside a
> validation failure.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/amend/amend-form.tsx — review step, notify tick

> Two lines at most, and the second only where it is true:
> how many people get a message, and whether moving the tick
> will stop and ask. Brian, 2026-08-23 — a control says what it
> does and what the consequence is, and nothing else.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-amendment-rules.ts — file header

> The division also keeps the four decisions below testable without a database,
> which matters because every one of them is a club rule rather than a query:
>
> 1. what counts as a change (`diffAmendment`);
> 2. which changes strand somebody, and therefore where the single notify
>    tick starts (`isMaterial`, `defaultNotify`);
> 3. when silence has to be chosen rather than defaulted into
>    (`silenceNeedsConfirmation`);
> 4. where the RSVP chase threshold lands once an event moves
>    (`chaseThresholdOn`).

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-amendment/read.ts — readAmendmentContext unsent job scope (LAN-156)

> LAN-156, corrected at the visual gate. Scoped to `invitation` jobs, and
> the scope is the point rather than a detail: this number is shown to the
> operator as "N queued messages are held", and the screen they go to in
> order to see those messages is `/operate/events/<id>/delivery`, which
> reports on invitation jobs and nothing else.
>
> Counting every job type made the two screens contradict each other. An
> event amended once carries a `schedule_change_notice` per invitee; on the
> next visit to this form those were counted back at the operator as
> messages awaiting delivery, while the delivery screen — correctly, for
> its own scope — showed nothing at all. Brian saw 47 here and 0 there for
> one event, and neither number was wrong on its own terms.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/participation-view.ts — DELIVERY_FILTERS doc

> Every `DeliveryState` a `?delivery=` value may name, plus `none`.
>
> Written out here rather than imported from `./delivery`, which is
> `server-only` and would reach the browser through the filter bar. The
> assertion below is what keeps the two from drifting: a `DeliveryState`
> that is not listed here fails compilation rather than becoming a filter value
> that silently matches nothing. `held` and `cancelled` (LAN-156) joined the
> five provider outcomes after this list was first written, which is exactly
> the drift the assertion exists to catch — it did.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
