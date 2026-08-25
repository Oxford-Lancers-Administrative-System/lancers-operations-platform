# W7 — Find out what the club's messaging rules are, and change them

- **Purpose/intended outcome:** Anybody running the club can see exactly when the
  system will message people and why, and knows precisely how to get a rule
  changed — without reading source code and without a settings screen nobody
  should have.
- **Primary actor:** An operator reading the rules; Brian changing them.
- **Trigger:** "When does the second reminder go out?", "Why did this escalate so
  fast?", or a decision to change a value.
- **Entry point:** A read-only **Messaging rules** page in the operator shell.
- **Route/placement:** Under **Administration**, beside Follow-ups.
- **Controlling sources:** `T03-config-model`, `T03-config-location`,
  `T03-deadline-values`, `OWN-schedule-model`, `OWN-no-quiet-hours`, ADR 0021,
  and the shipped `src/lib/services/response-deadline.ts`.
- **User-visible result:** The rules are legible in the product, and the way to
  change one is stated in the product rather than known only by the person who
  built it.

## ADR 0021 is reversed here: there is a settings page

`T03-config-model` and ADR 0021 both said there would be no
configuration-administration surface in Release One. **Brian reversed that on
2026-08-25** after asking what it would cost: _"Okay, we're building it. We're
changing what we said here, so we're going to do admin."_

The cost was measured before he decided, and it is small:

- Only **three call sites** read the values, all in
  `src/lib/services/event-approval.ts`.
- `resolveResponseDeadlineIn(tx, …)` is **already asynchronous and already
  inside a transaction**, because it resolves Europe/London wall clock in
  PostgreSQL. Reading configuration from a table instead of a constant needs no
  new boundary.
- `/operate/admin/operators` and `/operate/admin/roles` already exist, so the
  page copies a shipped pattern rather than inventing one.
- `audit_events` already exists, so attribution is wiring rather than invention.

**This requires a superseding ADR.** ADR 0021 must be recorded as reversed on
its configuration-surface point, deliberately and in writing, rather than
quietly contradicted by an implementation. Its other three rules survive intact:
the table is complete with no default arm, a past deadline is clamped to the
approval moment, and **there is still no per-event override** — the page sets
policy per event type, never per event.

### What is traded

Today a rule change is a reviewed pull request, permanently in version control,
requiring Brian. It becomes a runtime change recorded in `audit_events` —
faster, and easier to make casually. For values deciding when 47 people are
messaged, that cuts both ways, which is why every change is attributed and why
events already approved keep the schedule they were approved with.

### Where it lives

`/operate/admin/messaging`, titled **Messaging schedule**, beside Operators and
Roles.

**Not "Delivery".** That word already means the per-event delivery telemetry at
`/operate/events/[id]/delivery` which W6 owns, and reusing it for policy would
collide with a meaning the product has already established.

## What already exists

Verified at `80e9616`. `src/lib/services/response-deadline.ts` holds the response
deadlines as a complete table over `public.event_type`, exactly as ADR 0021
records:

| Event type                  | Response deadline        |
| --------------------------- | ------------------------ |
| `practice`                  | 2 days before, 18:00     |
| `strength_and_conditioning` | 2 days before, 18:00     |
| `chalk`                     | 2 days before, 18:00     |
| `game`                      | **7 days** before, 18:00 |
| `social`                    | **5 days** before, 18:00 |
| `recruitment`               | 2 days before, 18:00     |
| `meeting`                   | 2 days before, 18:00     |

Three rules travel with it and this workflow inherits all three: **the table is
complete with no default arm** — an unconfigured type refuses rather than
guessing; **a deadline already past is clamped to the approval moment** and shown
as "Due immediately"; and **there is no per-event override**.

## What does not exist yet

The deadline is only the anchor. Everything this mission schedules from it is
unconfigured, and these are the values W7 must hold:

- **The invitation anchor** — how long before the event the first message goes.
- **The ladder offsets** — when WhatsApp 2 follows WhatsApp 1, and when the email
  follows that. W1 froze the order; W7 holds the spacing.
- **Escalation N** — hours after the response deadline before the President is
  told. `T03-escalation-hours`: per event type, and **N = 0 is permitted**.
- **Short-runway compression** — what happens when an event is approved so close
  to its date that the ladder does not fit.

**There are no quiet hours.** `OWN-no-quiet-hours` is absolute: scheduling and
compression must never delay or drop a message on that basis. W1 confirmed it,
and it is stated on the page so nobody reintroduces it by accident.

## The compression question

This is the workflow's real owner decision, and it is genuinely open — an earlier
drop-and-gap proposal was reopened and is **not approved**.

An event approved two days before a game whose ladder wants seven days cannot run
that ladder. The options are:

1. **Send everything immediately, in order, as fast as delivery allows.** Honest
   and loud. Risks three messages in a few minutes.
2. **Keep the order, compress the gaps proportionally** into whatever runway
   exists — the ladder still feels like a ladder.
3. **Drop rungs from the front, keep the last ones.** The player gets the
   strongest messages and not the gentle opener.
4. **Send the invitation, and let the deadline do the rest** — no reminders at
   all when there is no room, escalating straight from the deadline.

**Recommendation: 2, with a floor.** Compression preserves the shape the
approver was shown in W1, which is the thing they agreed to. A minimum gap stops
it degenerating into option 1, and when even the floor does not fit, it becomes
option 4 rather than a burst. It needs one number — the floor — and that is a
value, not a mechanism.

## When an event is approved too late for its own schedule

The earlier draft described "compression with a minimum gap", and Brian said it
did not make sense. It did not. Compression squeezes the ladder into "the
runway" without ever saying what the runway ends at, and the two candidates give
opposite answers:

- **Ending at the RSVP deadline:** ADR 0021 clamps a late event's deadline to
  the approval moment, so the runway is zero and nothing ever fits.
- **Ending at the event start:** there is room, but the reminders then chase past
  a deadline that has already passed, and escalation — twelve hours after that
  deadline — fires while the reminders are still going out.

A deadline is both the thing reminders chase toward and the thing escalation
counts from. Clamping it to "now" destroys both meanings at once, which is why
the rule read as nonsense.

**Brian settled it on 2026-08-25, and it replaces compression entirely:**

1. **A late-approved event still chases.** It is not downgraded to a single
   announcement.
2. **The invitation goes out immediately**, the moment the event is approved.
3. **It still states the RSVP deadline**, so the player knows what they are
   answering by — the deadline is not hidden because it is close.
4. **Whatever time remains before that deadline is filled with WhatsApp
   reminders** on the normal cadence, for as many as the schedule allows.
5. **At least one WhatsApp always goes out**, however short the runway. No
   approved event is ever silent.
6. **The President is not told.** _"No on the president."_ Nobody had a fair
   chance to answer, so escalating would be noise that trains the office to
   ignore the alert. The event still appears in W5's **Follow-ups** queue, so an
   operator can see it and chase by hand if it matters.

There is no minimum gap, no floor, and no drop-and-gap. The rule is "start now,
fill the time you have, guarantee one message, do not escalate."

7. **A late-approved event is WhatsApp only.** Brian, 2026-08-25: _"Late events
   should be WhatsApp only."_ The email rung does not send, even if the cadence
   would reach it before the deadline. On a short runway the club uses the
   channel everybody has and does not add a second one.

## How a change is actually made

The page states it, in the product:

Changes take effect for events approved afterwards. **Events already approved
keep the schedule they were approved with**, because their invitations already
carry a frozen deadline and their jobs are already scheduled. Every change is
recorded against the operator who made it.

`T03-config-location`'s "operator-readable pointer" is satisfied differently now
that the page is editable: the answer to "where is this changed" is "here", and
the page states who may change it and what a change does not retroactively
affect.

## Everything is counted from the event start

Brian, 2026-08-25: _"'by 18:00' is a little bit confusing. It should just be '2
days before the start of the event' because the event is going to be
different."_

**This changes a value ADR 0021 recorded.** That ADR fixes every deadline at
**18:00 Europe/London wall clock**, resolved in PostgreSQL so both British
Summer Time transitions inside a season are correct. Counting from the event's
own start instead means a 20:00 practice answers by 20:00 two days before, and a
14:00 game by 14:00 seven days before.

- **It is more predictable per event**, which is the point: one rule that reads
  the same whatever time the event is.
- **The BST correctness requirement does not go away.** "Two days before this
  event's start" still has to be resolved in the club's timezone, so the
  existing PostgreSQL resolution stays; only the anchor moves from a fixed clock
  to the event's own time.
- **It interacts with no-quiet-hours.** An early-morning event now produces an
  early-morning deadline, and nothing may delay a message on that basis. That is
  the honest consequence and it is small, because a deadline is a threshold
  rather than a send.

The superseding ADR that records the settings-page reversal covers this too.

## The schedule model, as Brian defined it on 2026-08-25

Per-rung day offsets are replaced by a **cadence**. Brian: _"The first message
gets sent out at the thing, then it waits 24 hours, then sends the next one,
then sends out the next cadence at 24 hours."_

Each event type therefore carries five values:

| Column                    | Meaning                                                   |
| ------------------------- | --------------------------------------------------------- |
| **Player RSVP by**        | Days before the event start                               |
| **First invitation sent** | Days before the event start                               |
| **Reminder cadence**      | Hours between messages — default **24**                   |
| **Reminders**             | How many of each — default **2 WhatsApp, 1 email**        |
| **President escalation**  | Hours after the RSVP date — default **12** for every type |

The order is fixed and not configurable: invitation, then WhatsApp reminders,
then the email last. Only the spacing and the counts are tuned. Escalation is
**12 hours for every type**, replacing the earlier per-type values and the
zero-hour game case.

### Showing it: a preview on every row

Brian, 2026-08-25: _"Maybe each one gets a dropdown from it, and it just gives a
sample date, using today as a day or whatever… It shows sample dates starting
from today. If it gets sent out today, when does it go there?"_

**Every row expands.** Opening one answers a single question — _if the invitation
went out today, when does everything else happen?_ — and answers it in real
dates rather than offsets:

> **Practice** — if the invitation went out today, the event would be Tue 1 Sep,
> 20:00. Invitation Tue 25 Aug · reminders Wed 26 and Thu 27 · email Fri 28 ·
> RSVP deadline Sun 30 Aug · President told Mon 31 Aug, 08:00.

Offsets are unreadable as policy and obvious as dates. The preview is how the
values are checked, and it belongs against the type it describes rather than as
one worked example for the whole page.

Escalation is expressed as hours **after the RSVP deadline**, not after a date.

### The anchor, settled: count forward from the invitation

Brian, 2026-08-25: _"Count forward from the invitations."_ The reminders run
forward from the invitation on the cadence, and are not anchored backwards from
the RSVP deadline.

**That makes the first-invitation value derivable rather than free.** The last
reminder lands at `invitation + (reminders × cadence)`. For it to arrive near the
deadline instead of well before it:

```
first invitation = RSVP deadline + (number of reminders × cadence)
```

With three reminders at 24 hours, that gives:

| Event type                                 | RSVP deadline | First invitation   | Reminders land |
| ------------------------------------------ | ------------- | ------------------ | -------------- |
| Practice, S&C, chalk, recruitment, meeting | 2 days before | **5 days before**  | 4, 3, 2        |
| Game                                       | 7 days before | **10 days before** | 9, 8, 7        |
| Social                                     | 5 days before | **8 days before**  | 7, 6, 5        |

The earlier placeholders — 7, 21 and 14 days — were built for a model where the
reminders clustered near the deadline by other means, and under forward counting
they produce the gap the preview exposed: a game invited 21 days out finishes its
ladder eleven days before the deadline it is chasing.

**Whether the first-invitation value stays editable or becomes derived is not
settled.** Leaving it editable keeps the club's freedom to announce a game early;
deriving it makes the gap impossible. A middle option keeps it editable and lets
the row's own preview warn when the last reminder lands more than a day before
the deadline, which is what the preview already does.

Recommendation: **keep it editable and keep the warning.** Announcing a game
three weeks out is a real thing a club wants to do, and the warning turns the
consequence into information rather than a refusal.

## What the research says

Brian asked for the recommended pattern rather than a guess. Two findings shaped
the page:

- **One card per row on a phone, never a scrolling table.** The card view puts
  the identifying field as the card title with its fields beneath, removes
  horizontal scrolling, and keeps every column reachable. This is also the idiom
  the application already uses — LAN-157's `participation-card` — so following it
  is consistency rather than novelty.
- **Cadence settings belong in one place, grouped, with the volume visible.**
  The recurring guidance is to avoid repeated notifications for the same event,
  group what belongs together, and give explicit control over frequency. The
  page therefore shows the whole ladder for a type on one row rather than
  scattering offsets, and states the fixed order above the table so the thing
  being tuned is spacing rather than sequence.

## Handoffs

- **→ W1** — the plan an approver reads is rendered from these values. W7 owns
  the values; W1 owns the reading.
- **→ W2** — the rungs and their spacing.
- **→ W5** — escalation N, per event type.
- **→ W6** — the retry bounds this reports against.
- **→ W8** — a rescheduled event recomputes against these values.

## Exceptions

| Situation                                | Behaviour                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| An event type has no configured rule     | Refuses (`response_deadline_not_configured`); it never inherits a default |
| A new event type is added                | The refusal forces the decision rather than absorbing it silently         |
| The deadline is already past at approval | Clamped to the approval moment and shown as "Due immediately"             |
| The runway is too short for the ladder   | Compression applies, per the decision above                               |
| Somebody wants a per-event override      | Refused. ADR 0021 forbids it and this page says so                        |
| Somebody wants a quiet-hours window      | Refused. There are none, and none may be introduced by compression        |
| The page is read by a club-link holder   | Unreachable; it is operator-tier                                          |

## Safety, privacy, and authority

- The page is read-only. There is no control on it that changes anything.
- It shows policy, never a person, a message body, or a recipient.
- Changing a value is a reviewed repository change requiring Brian, and is
  visible in version control rather than as an unattributed setting change.

## Acceptance evidence

- The page lists every configured event type with its response deadline, the
  ladder and its offsets, escalation N, and the compression rule.
- It states that there are no quiet hours.
- It contains no control that changes a value.
- It carries the pointer saying where a change is requested.
- An event type with no rule is shown as unconfigured rather than as a default.
- The values shown are the ones the scheduler actually uses — read from the same
  source, never transcribed.
- The page is operator-tier and unreachable without a seat.
- Grounding is `main` at `80e9616d396336a7b575a975ecb012548b4ed611`, where the
  deadline table ships and nothing else does.

## Core decisions

| Decision                                                                                                        | Classification                | Governing evidence or recommended default                                           | Status                   |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- | ------------------------ |
| A settings page exists at `/operate/admin/messaging`, reversing ADR 0021, recorded in a superseding ADR         | `locked`                      | Brian 2026-08-25: "Yes, it's a superseding ADR."                                    | Settled                  |
| Deadlines keep ADR 0021's day counts but are measured from the event start; carried by the same superseding ADR | `locked`                      | Brian 2026-08-25                                                                    | Settled                  |
| No per-event override                                                                                           | `locked`                      | ADR 0021                                                                            | Settled                  |
| There are no quiet hours                                                                                        | `locked`                      | `OWN-no-quiet-hours`, confirmed at W1                                               | Settled                  |
| It lives under Administration, beside Follow-ups                                                                | `proposed for owner approval` | Consistent with the W5 placement decision                                           | Recommended              |
| The ladder is a cadence, not per-rung offsets: every N hours, N=24                                              | `proposed for owner approval` | Brian 2026-08-25: "it waits 24 hours, then sends the next one"                      | Recommended              |
| Reminders default to 2 WhatsApp and 1 email                                                                     | `proposed for owner approval` | Brian 2026-08-25                                                                    | Recommended              |
| President escalation is 12 hours after the RSVP date for every type                                             | `proposed for owner approval` | Brian 2026-08-25, replacing the per-type values and the zero-hour game              | Recommended              |
| The page previews the dates a row produces                                                                      | `proposed for owner approval` | Brian asked for a better way to show cadence; inputs alone are unreadable as policy | Recommended              |
| Reminders count forward from the invitation, not backwards from the deadline                                    | `locked`                      | Brian 2026-08-25: "Count forward from the invitations."                             | Settled                  |
| First invitation should be deadline + (reminders x cadence): 5, 10 and 8 days                                   | `proposed for owner approval` | Follows arithmetically from counting forward; the earlier 7/21/14 leave a gap       | Recommended              |
| The first-invitation value stays editable, with the preview warning on a gap                                    | `proposed for owner approval` | Announcing a game early is legitimate; a warning informs rather than refuses        | Recommended              |
| The invitation anchor and ladder offsets                                                                        | `proposed for owner approval` | No approved values exist; ADR 0021's precedent is that they must not be invented    | **Needs Brian — values** |
| A late-approved event sends immediately, fills the remaining time, guarantees one WhatsApp, and never escalates | `locked`                      | Brian 2026-08-25, replacing compression entirely                                    | Settled                  |
| Whether the email rung still sends on a late-approved event                                                     | `proposed for owner approval` | Brian's rule names WhatsApp; the email is the last rung of an order W1 froze        | **Open — one question**  |
| Changes never apply retroactively to approved events                                                            | `proposed for owner approval` | Their deadlines are frozen on the invitation and their jobs already scheduled       | Recommended              |
| Where the sibling policy file sits and its shape                                                                | `delegated to Mission Lead`   | `T03-config-location` fixes that it is one sibling file                             | Delegated                |

## Brian approval

- **Exact words:** Pending
- **Date:** Pending
