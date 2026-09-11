# 0036 — The messaging schedule is administered in the product, and every deadline is measured from the event's own start

**Status:** Accepted · **Date:** 2026-08-25 · **Supersedes:** parts of
[0021 — RSVP response deadlines are central configuration, not per-event input](0021-response-deadline-configuration.md)

## Context

ADR 0021 settled where the club's RSVP response deadlines live and what they
are. Brian decided the values on 13 August 2026 — two calendar days before the
event for practice, S&C, chalk, recruitment and meeting; five for a social;
seven for a game — and they shipped as a frozen table in
`src/lib/services/response-deadline.ts`, resolved at **18:00 Europe/London**.

Three rules travelled with them, and the third is the one this ADR reverses:

1. The table is complete over `public.event_type` and has **no default arm**.
2. A deadline already in the past is **clamped to the approval moment**.
3. **No per-event override, and no configuration-administration surface.** "Not
   a field, not a query parameter, not an 'advanced' disclosure."

Mission `M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY` then built the thing
that consumes those deadlines: a dispatch anchor, a reminder ladder, and an
escalation to the President. That work needs four more values per event type —
the invitation lead, the reminder cadence, the counts of each rung, and the
hours after the deadline before the President is told — and none of them
existed anywhere.

Two questions therefore came back to the owner, and he answered both on
25 August 2026.

### Does the club get a settings page?

He asked what one would cost before deciding. The measured answer was small:
three call sites read the values, all in `event-approval.ts`;
`resolveResponseDeadlineIn` was already asynchronous and already inside a
transaction, because it resolves Europe/London wall clock in PostgreSQL, so
reading configuration from a table needed no new boundary; `/operate/admin/operators`
and `/operate/admin/roles` already exist, so the page copies a shipped pattern;
and `audit_events` already exists, so attribution is wiring rather than
invention.

> "Okay, we're building it. We're changing what we said here, so we're going to
> do admin." — Brian, 2026-08-25
>
> "Yes, it's a superseding ADR." — Brian, 2026-08-25

### Is a deadline a time of day, or a time before the event?

> "'by 18:00' is a little bit confusing. It should just be '2 days before the
> start of the event' because the event is going to be different." — Brian,
> 2026-08-25

## Decision

**1. There is a messaging-schedule administration surface, and the values live
in the database.**

`public.messaging_schedules` holds one row per `public.event_type` carrying the
RSVP-by days, the invitation lead, the reminder cadence in hours, the WhatsApp
and email reminder counts, and the escalation hours. It is created and seeded by
`supabase/migrations/20260825120000_messaging_schedule_and_chase.sql`. A
read-only-until-LAN-171 service in `src/lib/services/messaging-schedule.ts` is
the only reader and the only writer; `response-deadline.ts` survives as a named
view onto one field of the plan and holds no arithmetic of its own.

The page itself — `/operate/admin/messaging`, titled **Messaging schedule** — is
built by LAN-171. This ADR records the reversal that permits it. It is
deliberately not called "Delivery": that word already means the per-event
delivery telemetry at `/operate/events/[id]/delivery`.

**2. Deadlines keep ADR 0021's day counts and are measured from the event's own
start.**

A 20:00 practice is answered by 20:00 two days before; a 14:00 game by 14:00
seven days before. The day counts are unchanged and remain Brian's decision of
13 August 2026.

The British Summer Time requirement does **not** go away with the fixed clock.
"Two days before this event's start" is still a wall-clock rule, so the
arithmetic stays in PostgreSQL — `((date - n) + time) at time zone 'Europe/London'`
— and the subtraction happens on the date before the zone is applied, which is
what makes "two days before at the same local time" true rather than "48 hours
before". Those differ by an hour twice a year and the club means the former.

An event with no start time yet is anchored to the beginning of its day. The
earliest instant it could begin is the safe reading, because a time added later
moves the deadline forward rather than backward.

**3. Everything else in ADR 0021 survives, and is enforced rather than restated.**

- **No default arm.** An event type with no row in `public.messaging_schedules`
  is `messaging_schedule_not_configured`, a refusal that names itself. Widening
  `public.event_type` still forces the decision to be made. The lookup compares
  `event_type::text` deliberately, so an unknown label reaches that refusal
  instead of failing as a cast error.
- **A past deadline is clamped to the approval moment**, the approver is shown
  "Due immediately", and approval is never refused for being late.
- **No per-event override.** `public.messaging_schedules` is keyed on the event
  type and has no event column. `public.event_messaging_plans` is keyed on the
  event, but it is a **frozen copy of what was decided**, written at approval
  and never a place to decide something different.

**4. A schedule change is never retroactive.**

Because the values are now editable at runtime, `event_messaging_plans` freezes
the whole plan onto the event at the moment of approval — the deadline, the
dispatch anchor, the rung counts and the escalation instant. An operator who
shortens the cadence on Tuesday changes nothing about Monday's already-approved
event, and the plan the approver read before committing stays the plan that
runs.

## Consequences

- **A rule change stops being a reviewed pull request.** It was permanently in
  version control and required Brian; it becomes a runtime change recorded in
  `audit_events`. That is faster and easier to make casually, and for values
  deciding when forty-seven people are messaged it cuts both ways. Every change
  is attributed and no approved event is affected retroactively, which is what
  makes the trade acceptable rather than merely convenient.
- **Attribution lives in `audit_events` and not in a column on the table.**
  `public.messaging_schedules` deliberately carries no `updated_by_person_id`.
  `public.event_type_settings` reached the same conclusion for the same stated
  reason, and this table has a sharper one: reference data must not hold a
  foreign key to `public.people`, because the synthetic seed truncates
  `public.people ... cascade` and would silently delete the club's entire
  messaging policy on every `npm run db:seed`. That was observed, not theorised.
- **Deadlines move for events outside working hours.** An 07:00 session now
  produces an 07:00 deadline. There are no quiet hours — `OWN-no-quiet-hours` is
  absolute and no scheduling, compression or recovery may reintroduce one — so
  nothing delays a message on that basis. The consequence is honest and small,
  because a deadline is a threshold rather than a send.
- **Every previously recorded deadline expectation changed by up to a day.**
  Tests that asserted 18:00 local now assert the event's own start time. The day
  counts they were really testing are untouched.
- **ADR 0021 is not withdrawn.** Its context, its values and its first two rules
  remain the record of why the deadlines are what they are. Only its
  configuration-surface prohibition and its fixed 18:00 anchor are superseded
  here.

## Decision history relocated from source (LAN-300)

### src/lib/services/messaging-schedule/index.ts — module header

> ## What this module owns, and what it deliberately does not
>
> It owns the **arithmetic**: given an event and a moment, when does the
> invitation go, when does each reminder follow it, when is the RSVP deadline,
> and when — if ever — is the President told. It owns nothing about sending. A
> plan is a projection, and reading one sends nothing and creates no job, which
> is W1's explicit safety rule for the approval panel.
>
> The **order** of the ladder is not here and is not configurable: WhatsApp,
> WhatsApp again, email, then the President (`REQ-ladder-order`). That sequence
> is expressed as code in {@link buildLadder} rather than as rows, because rows
> would make it look tunable. Only the spacing and the counts are policy, and
> those live in `public.messaging_schedules`.
>
> ## Why the values moved out of TypeScript
>
> ADR 0021 put the response deadlines in `response-deadline.ts` as a frozen
> table and said Release One would have no configuration-administration
> surface. Brian reversed that on 2026-08-25 and the reversal is recorded in
> `docs/adr/0036-messaging-schedule-configuration.md`. The values now live in
> `public.messaging_schedules` so the settings page W7 describes — built by
> LAN-171, not here — reads and writes the same rows the scheduler obeys.
> W7 is explicit that they must be "read from the same source, never
> transcribed", so there is no second copy of any of these numbers anywhere in
> this repository.
>
> Three of ADR 0021's rules survive verbatim, and each has a home here:
>
> - **The table is complete and there is no default arm.** An event type with
>   no row is {@link SCHEDULE_NOT_CONFIGURED_RULE}, a refusal that names
>   itself, never an inherited two days.
> - **A past deadline is clamped to the approval moment** and the approver is
>   shown "Due immediately". Approval is never refused for being late.
> - **There is no per-event override.** Nothing in this module takes a
>   per-event value; every number arrives from the type's row.
>
> ## The one value ADR 0021 recorded that this changes
>
> The anchor. ADR 0021 fixed every deadline at 18:00 Europe/London wall clock.
> `REQ-deadline-from-event-start` keeps the day counts and measures them from
> the event's own start instead: a 20:00 practice answers by 20:00 two days
> before, and a 14:00 game by 14:00 seven days before. Brian, 2026-08-25:
> "'by 18:00' is a little bit confusing. It should just be '2 days before the
> start of the event' because the event is going to be different."
>
> The British Summer Time requirement does not go away with the fixed clock —
> "two days before this event's start" still has to be resolved in the club's
> zone — so every instant below is still computed by PostgreSQL rather than in
> JavaScript. See {@link resolveMessagingPlanIn}.
>
> ## There are no quiet hours
>
> `REQ-no-quiet-hours` is absolute and it constrains this file more than any
> other: nothing here inspects the hour of day, and no rung is ever moved,
> delayed or dropped because of when it lands. An early-morning event produces
> an early-morning deadline and an early-morning reminder, and that is the
> intended behaviour rather than a defect to be smoothed over later.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/admin/messaging/page.tsx — file header

> ADR 0021 said Release One would carry no configuration-administration
> surface at all. `docs/adr/0036-messaging-schedule-configuration.md` records
> why Brian reversed that on 2026-08-25, and this page is the reversal: the
> club's messaging policy, per event type, editable here rather than known
> only to whoever last touched `response-deadline.ts`.
>
> Editable **per template, never per event** — there is no event picker
> anywhere on this page, because `public.messaging_schedules` has no event
> column to point one at. The table is complete over `public.event_templates`
> with no default arm: a template's row is created with it and deleted with it
> (LAN-265), so this page only ever updates a row and never creates or deletes
> one. A template the club created a minute ago is already here, carrying
> `DEFAULT_MESSAGING_SCHEDULE`, which is the half of the decision that makes
> creating a template worth anything.
>
> `listMessagingSchedulesWithPreview` resolves each row's example through
> `resolveMessagingPlanIn` — the same function `event-approval.ts` calls at
> approval — so the dates a reader expands here are the dates the scheduler
> would actually produce, never a hand-written illustration that can drift
> from the real rule.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/response-deadline.ts — module header

> ## What this file used to be, and why it is now four functions thick
>
> It used to be the deadline itself: a frozen `Record<event_type,
{daysBefore, atTime}>` table with Brian's reasoning of 13 August 2026 written
> beside it, and the arithmetic that turned a row into an instant. ADR 0021
> recorded that shape deliberately, including its rule that Release One would
> carry no configuration-administration surface.
>
> Brian reversed that on 2026-08-25 — "Okay, we're building it… Yes, it's a
> superseding ADR" — and the values moved into `public.messaging_schedules`,
> where the settings page W7 describes can read and write the same rows the
> scheduler obeys. `docs/adr/0036-messaging-schedule-configuration.md` records
> the reversal and what survives it.
>
> So this module is now a **named view onto one field of the messaging plan**,
> and it exists rather than being deleted for a reason that is not sentiment:
> `event-approval.ts` asks a narrower question than the plan answers — "what
> goes in `invitations.expires_at`?" — and a caller that only needs the
> deadline should not have to know that a ladder, an escalation threshold and a
> dispatch anchor were computed alongside it. There is exactly one arithmetic
> implementation, in `messaging-schedule.ts`, and this file has none of its own.
>
> ## What changed about the value, and what did not
>
> The **day counts are Brian's, unchanged** — two days for practice, S&C,
> chalk, recruitment and meeting; seven for a game; five for a social — and
> they now live in `public.messaging_schedules.rsvp_by_days`.
>
> The **fixed 18:00 wall clock is retired.** `REQ-deadline-from-event-start`
> measures every deadline from the event's own start instead, so a 20:00
> practice answers by 20:00 two days before. Brian, 2026-08-25: "'by 18:00' is
> a little bit confusing. It should just be '2 days before the start of the
> event' because the event is going to be different."
>
> ADR 0021's other rules survive and are enforced in `messaging-schedule.ts`:
> the table is complete with no default arm, a past deadline is clamped to the
> approval moment, and there is no per-event override.
>
> ## What the deadline means
>
> Not a cutoff. `docs/ux/slice-ux.md` § 9 is explicit that a player may answer
> late and may change their answer until the event starts. What the deadline
> does is decide when an unanswered invitation becomes an _exception the club
> chases_ — it feeds `nonresponse_queue`, the escalation threshold and the
> Monday report. That is why the values are about planning lead time rather
> than about politeness.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
