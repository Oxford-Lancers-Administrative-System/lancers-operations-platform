# W6 — Repair a delivery that failed

- **Purpose/intended outcome:** When the club cannot reach somebody, that is
  visible, someone is accountable for it, and there is a documented way to fix it
  — instead of a person silently never hearing about an event.
- **Primary actor:** An operator triaging delivery for one event.
- **Trigger:** A send fails, a route is unusable, or the automated retries give
  up.
- **Entry point:** `/operate/events/[id]/delivery`, the page LAN-78 already
  shipped. `D1` settles this: that surface stands as delivered and **is the
  surface an operator repairs from**.
- **Route/placement:** In place. `D4` puts R15's operator queue on the per-event
  delivery view, which is where repair happens.
- **Controlling sources:** `D1`, `D3`, `D4`, `D6`, `D8`, `F1`, `F3`, `F5`, `R12`,
  `R15`, and `OWN-missing-whatsapp-error`.
- **User-visible result:** The operator knows exactly who could not be reached,
  why, what the system already tried, and what to do next.

## What exists, and what is empty

Verified in the running application on 2026-08-25 at `80e9616`. The page shows:

- **Audience 47 · Delivered 0 · Queued 0 · Failed 0**
- _"Nothing has been sent for this event yet. Invitations and their delivery are
  created when the event is approved."_
- Its standing facts: channel **Official WhatsApp Business Platform**, 1:1 per
  invitation; destination **Secure signed RSVP page**, one live token; fallback
  **Automated email / calendar**; audit **Provider IDs and delivery evidence**,
  webhooks deduplicated.
- A **View diagnostics** button, disabled.
- The standing rule, stated on the page: _"Operators never copy, send or post
  invitations manually. Delivery telemetry does not imply an RSVP."_

The scaffolding is complete and honest. Every number is zero because nothing
sends. This workflow is what fills it and what an operator does with it.

## The three states worth repairing

### 1. Failed with a retryable cause

`D6` and `F1`: retries are automatic and **have no actor**. The loop tries, backs
off, and either succeeds or exhausts. What an operator sees is its outcome, never
its mechanics. A person mid-retry is not an operator's problem yet, and the page
says so — attempts made, next attempt due.

Only when retries are exhausted does it become work.

### 2. Failed terminally, with a usable alternative

`D3` and `F5`: the fallback is **automated email and calendar**, and Resend is
its provider. `R12` bounds it — WhatsApp is primary, the fallback is automated,
and **neither is ever the system of record**. The operator routes the person to
it; they do not compose anything.

### 3. No usable route at all

`D8` and `OWN-missing-whatsapp-error`: **every user is expected to have
WhatsApp**, so a missing or unusable route is an error, not a configuration
choice. It reads **Not dispatched — no channel**, and it is **counted and
visible rather than silently absent** — the backstop exists precisely so a
person cannot disappear from the club's attention by having no contact details.

W1 shows this error concisely before approval; **W6 owns handling it.**

## What repair actually is

The operator has three moves and no more:

1. **Wait** — retries have not finished. The page says when the next one is due.
2. **Route to the fallback** — send this person by the automated email path
   instead. One action, no composing, no copying.
3. **Fix the route** — the person has no usable contact detail, which is a roster
   problem, not a messaging one. W6 names it and points at the person's record.

**There is no manual send.** LAN-90 and LAN-92 are binding and the page already
says so: operators never copy, send or post invitations by hand. A repair that
ends in somebody pasting a link into a chat is not a repair.

## The documented recovery procedure

`F3` and `R15` require a **documented automated recovery procedure**, and its
journey is exactly this workflow. R15 is satisfied when an operator can, without
asking anybody:

- see that automation failed, in numbers that are not zero when they should not
  be;
- see which people are affected and why;
- see what the system already tried and what it will try next;
- take the one available action; and
- see the result.

**View diagnostics** — disabled today — is where the evidence lives: provider
identifiers, delivery evidence, and deduplicated webhooks, all already named on
the page. It is operator-tier, and it never shows message bodies.

## Handoffs

- **← W1** — the messaging plan whose dispatch this reports, and the concise
  pre-approval error whose handling this owns.
- **← W2** — delivery and response are separate axes; a failed delivery never
  changes an answer, and an answer never repairs a delivery.
- **→ W4** — **Needs attention** on the participation table is the way in.
- **→ W5** — unreachable people also sit in the follow-up queue, labelled as a
  delivery problem. One list, two streams.
- **← W7** — the retry policy's bounds are configuration this workflow reports
  against.
- **← W8** — a job cancelled by an event change is not a failure and must never
  appear as one.

## Exceptions

| Situation                                        | Behaviour                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Retries are still running                        | Shown as in progress with the next attempt time; not yet operator work               |
| Retries are exhausted                            | Becomes a repair with the fallback offered                                           |
| No usable WhatsApp route                         | **Not dispatched — no channel**, counted and visible; pointed at the person's record |
| The fallback also fails                          | Both failures are visible; the person remains unreachable and stays counted          |
| The person answers anyway                        | Delivery is still failed and still shown; the answer stands. The axes never merge    |
| The event is cancelled or amended                | Cancelled jobs are cancelled, never failed — W8 owns that distinction                |
| A webhook arrives twice                          | Deduplicated, as the page already states                                             |
| A provider reports success after a local failure | The later provider evidence wins and the change is visible in diagnostics            |
| Nothing has been sent yet                        | The existing honest empty state stands unchanged                                     |

## Safety, privacy, and authority

- No message body is ever shown on this surface or in diagnostics.
- Provider identifiers and delivery evidence are operator-tier and never reach a
  club-link holder.
- Delivery telemetry does not imply an RSVP. The page says so today and must
  continue to.
- No operator action here sends anything a human composed.
- Routing to the fallback is an operator action and is attributable.

## Acceptance evidence

- With jobs present, Delivered, Queued and Failed report real counts, and
  Audience continues to report the frozen audience.
- A retrying person shows attempts made and the next attempt due, and offers no
  operator action.
- An exhausted person offers exactly one action: route to the automated email
  fallback.
- Routing to the fallback dispatches by the automated path, composes nothing, and
  is attributed to the operator who did it.
- A person with no usable route reads **Not dispatched — no channel**, is counted
  in Failed, and links to their record.
- **View diagnostics** is enabled, shows provider identifiers and delivery
  evidence, deduplicates webhooks, and shows no message body.
- A cancelled job never appears as a failure.
- A delivery failure never alters an RSVP, and an RSVP never clears a delivery
  failure.
- The manual-send prohibition is unchanged and still stated on the page.
- Grounding is `main` at `80e9616d396336a7b575a975ecb012548b4ed611`, where this
  page renders with every count at zero.

## Core decisions

| Decision                                                            | Classification                | Governing evidence or recommended default                                         | Status      |
| ------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- | ----------- |
| LAN-78's delivery page is the surface repair happens on             | `locked`                      | `D1`, `D4`                                                                        | Settled     |
| Retries are automatic and have no operator actor                    | `locked`                      | `D6`, `F1`                                                                        | Settled     |
| The fallback is automated email and calendar, provided by Resend    | `locked`                      | `D3`, `F5`, and the 2026-08-17 Resend amendment                                   | Settled     |
| Neither channel is ever the system of record                        | `locked`                      | `R12`                                                                             | Settled     |
| A missing WhatsApp route is an error, counted and visible           | `locked`                      | `D8`, `OWN-missing-whatsapp-error`                                                | Settled     |
| No manual send exists, in any repair path                           | `locked`                      | LAN-90 and LAN-92; the page already states it                                     | Settled     |
| The operator has exactly three moves: wait, route, fix the route    | `proposed for owner approval` | Anything more becomes a composing surface, which the prohibition forbids          | Recommended |
| Retrying people are shown but offer no action until retries exhaust | `proposed for owner approval` | `D6` gives the loop no actor; surfacing it as work invites pointless intervention | Recommended |
| **View diagnostics** becomes enabled and is operator-tier           | `proposed for owner approval` | `R15` needs visible evidence; the page already names what it holds                | Recommended |
| Exact retry bounds and backoff                                      | `delegated to Mission Lead`   | W7 owns policy values; the loop's shape is implementation                         | Delegated   |

## Brian approval

- **Exact words:** Pending
- **Date:** Pending
