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

Brian raised this at review on 2026-08-25 and was right that nothing covered it.
Checked: ADR 0021 clamps a past deadline to the approval moment and states
_"there is no minimum-notice window"_, and it anticipated the consequence — a
late approval _"puts its whole audience into the nonresponse queue at once."_
But escalation did not exist when it was written, and **no decision anywhere
connects a clamped deadline to escalation N.**

The failure it leaves is sharp. A game is approved two days out. Its seven-day
answer-by date has already passed, so it clamps to now. Escalation N for a game
is **zero hours**. The President is escalated **at the instant of approval** —
before one message has been delivered, let alone answered.

Three rules close it, and all three are configurable on the page:

1. **The answer-by date becomes now**, and the approver is told before
   committing. Unchanged from ADR 0021.
2. **The reminders compress**, keeping their order, down to a **minimum gap**.
   If even that will not fit, only the invitation is sent.
3. **Nobody is escalated before they have had a chance to answer.** Escalation
   fires no earlier than a **minimum answer window** after the first message is
   actually sent, however short the runway and whatever N says. Escalation
   therefore fires at the later of the two: the answer-by date plus N, or the
   first message plus the minimum answer window.

Rule 3 is the new one, and it is what stops a late approval telling the
President about people who have not yet been asked.

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

### Showing it: the schedule preview

Brian: _"I think there's a better way to show that, but I'm not sure how."_ The
answer is to stop showing only the inputs. The page renders the **actual
schedule the row produces** for a worked example, as dates:

> Practice at 20:00 on Wednesday 16 September — invitation Wed 9 Sept 20:00,
> reminders Thu 10, Fri 11 and (email) Sat 12, RSVP deadline Mon 14 20:00,
> President told Tue 15 at 08:00.

Numbers like "2 and 1" are unreadable as policy and obvious as dates. The
preview is not decoration; it is how the values are checked.

### What the preview immediately exposed

A **game** sends its first invitation 21 days out with a 24-hour cadence, so all
four player messages land 21, 20, 19 and 18 days before the event — and its RSVP
deadline is 7 days before. **The whole ladder finishes eleven days before the
deadline it is chasing**, and the President is then told about people who last
heard from the club a fortnight earlier.

A cadence anchored to the first invitation works when the runway is short and
fails when it is long. Two ways out, and this needs Brian:

1. **Anchor the reminders to the RSVP deadline and count backwards.** The
   invitation still goes early; the reminders cluster where they matter. A
   24-hour cadence then means the last three days before the deadline.
2. **Keep the forward cadence but stretch it per type** — a game would need a
   cadence measured in days, not hours, to span 21 days to 7.

Recommendation: **1**. The invitation announces; the reminders chase. Chasing
should happen near the thing being chased, and it keeps one cadence value
meaningful across every event type.

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

| Decision                                                                              | Classification                | Governing evidence or recommended default                                                              | Status                             |
| ------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| A settings page exists at `/operate/admin/messaging`, reversing ADR 0021              | `proposed for owner approval` | Brian 2026-08-25: "Okay, we're building it. We're changing what we said here." Needs a superseding ADR | **Reversal — needs recording**     |
| Deadlines keep ADR 0021's day counts but are measured from the event start, not 18:00 | `proposed for owner approval` | Brian 2026-08-25: "it should just be 2 days before the start of the event". Changes an ADR 0021 value  | **Value change — needs recording** |
| No per-event override                                                                 | `locked`                      | ADR 0021                                                                                               | Settled                            |
| There are no quiet hours                                                              | `locked`                      | `OWN-no-quiet-hours`, confirmed at W1                                                                  | Settled                            |
| It lives under Administration, beside Follow-ups                                      | `proposed for owner approval` | Consistent with the W5 placement decision                                                              | Recommended                        |
| The ladder is a cadence, not per-rung offsets: every N hours, N=24                    | `proposed for owner approval` | Brian 2026-08-25: "it waits 24 hours, then sends the next one"                                         | Recommended                        |
| Reminders default to 2 WhatsApp and 1 email                                           | `proposed for owner approval` | Brian 2026-08-25                                                                                       | Recommended                        |
| President escalation is 12 hours after the RSVP date for every type                   | `proposed for owner approval` | Brian 2026-08-25, replacing the per-type values and the zero-hour game                                 | Recommended                        |
| The page previews the dates a row produces                                            | `proposed for owner approval` | Brian asked for a better way to show cadence; inputs alone are unreadable as policy                    | Recommended                        |
| Reminders anchor to the RSVP deadline, not the invitation                             | `proposed for owner approval` | The preview showed a game's ladder finishing 11 days before its own deadline                           | **Needs Brian — two options**      |
| The invitation anchor and ladder offsets                                              | `proposed for owner approval` | No approved values exist; ADR 0021's precedent is that they must not be invented                       | **Needs Brian — values**           |
| Short-runway compression                                                              | `proposed for owner approval` | The earlier drop-and-gap proposal was reopened and is not approved                                     | **Needs Brian — four options**     |
| Escalation never fires before a minimum answer window after the first message         | `proposed for owner approval` | Nothing connected a clamped deadline to escalation N; a game at N=0 would escalate at approval         | **New rule — needs Brian**         |
| Changes never apply retroactively to approved events                                  | `proposed for owner approval` | Their deadlines are frozen on the invitation and their jobs already scheduled                          | Recommended                        |
| Where the sibling policy file sits and its shape                                      | `delegated to Mission Lead`   | `T03-config-location` fixes that it is one sibling file                                                | Delegated                          |

## Brian approval

- **Exact words:** Pending
- **Date:** Pending
