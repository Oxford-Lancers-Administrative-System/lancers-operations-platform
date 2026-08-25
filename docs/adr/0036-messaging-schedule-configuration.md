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
