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

## There is no settings screen, and that is deliberate

`T03-config-model`: central repository configuration on the **ADR 0021 pattern,
with no admin UI in Release One.** ADR 0021 says it in its own words — _"No
per-event override, and no configuration-administration surface. Not a field, not
a query parameter, not an 'advanced' disclosure."_

So this workflow is two halves that must not be confused:

- **Find out** — a page in the app that _shows_ the rules. Read-only, always.
- **Change them** — a reviewed change to one file in the repository, which is
  club policy and therefore needs Brian. `T03-config-location`: one sibling
  policy file, plus **the operator-readable pointer answering where a change is
  requested**.

A read-only display is not the administration surface the ADR forbids. The
pointer is what stops "read-only" meaning "undiscoverable".

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

## How a change is actually made

The page states it, in the product:

> These rules are club policy. They live in the repository and are changed by a
> reviewed change to one file, approved by Brian. To request a change, open an
> issue describing the rule and why it should differ.

That sentence is the whole of `T03-config-location`'s "operator-readable
pointer". Without it, read-only means a dead end.

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

| Decision                                          | Classification                | Governing evidence or recommended default                                        | Status                         |
| ------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------- | ------------------------------ |
| No configuration-administration surface exists    | `locked`                      | `T03-config-model`, ADR 0021 in its own words                                    | Settled                        |
| Response deadlines keep ADR 0021's shipped values | `locked`                      | `T03-deadline-values`; the table ships today                                     | Settled                        |
| No per-event override                             | `locked`                      | ADR 0021                                                                         | Settled                        |
| There are no quiet hours                          | `locked`                      | `OWN-no-quiet-hours`, confirmed at W1                                            | Settled                        |
| A read-only rules page exists in the app          | `proposed for owner approval` | `T03-config-location` requires an operator-readable pointer                      | Recommended                    |
| It lives under Administration, beside Follow-ups  | `proposed for owner approval` | Consistent with the W5 placement decision                                        | Recommended                    |
| The invitation anchor and ladder offsets          | `proposed for owner approval` | No approved values exist; ADR 0021's precedent is that they must not be invented | **Needs Brian — values**       |
| Escalation N per event type                       | `proposed for owner approval` | `T03-escalation-hours` fixes the shape, not the numbers                          | **Needs Brian — values**       |
| Short-runway compression                          | `proposed for owner approval` | The earlier drop-and-gap proposal was reopened and is not approved               | **Needs Brian — four options** |
| Where the sibling policy file sits and its shape  | `delegated to Mission Lead`   | `T03-config-location` fixes that it is one sibling file                          | Delegated                      |

## Brian approval

- **Exact words:** Pending
- **Date:** Pending
