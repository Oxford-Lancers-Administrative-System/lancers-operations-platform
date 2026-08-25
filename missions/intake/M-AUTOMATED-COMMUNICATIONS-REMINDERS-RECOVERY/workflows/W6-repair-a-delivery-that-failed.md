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

## What is automatic, and what is a person's job

Brian, 2026-08-25: _"Wait should just be no action, route is automated, only the
third action actually requires the owner."_

Almost nothing here is an operator's job. The system retries, and the system
falls back to email on its own. The operator is watching, not driving.

### Retrying — no action

`D6` and `F1`: retries are automatic and **have no actor**. The page says which
attempt it is on and when the next is due, and offers nothing to press. A person
mid-retry is not work.

### WhatsApp unresponsive — visible, still no action

Brian, 2026-08-25: _"If WhatsApp is down that's a failure. We can still email but
that's something that needs to be seen."_

When WhatsApp cannot deliver, the automated email fallback carries the message —
`D3`, `F5`, Resend as provider, bounded by `R12` so neither channel is ever the
system of record. **The person was reached.** But the club's primary channel
failed, and that is a failure the club must see rather than a silent substitution.

So it reads **WhatsApp unresponsive**, it is counted, and it still offers the
operator nothing to do. Sending the email is not an operator action; it already
happened.

### Not dispatched — no channel — the one thing a person must fix

`D8` and `OWN-missing-whatsapp-error`: every user is expected to have WhatsApp,
so a missing or unusable route is an error, **counted and visible rather than
silently absent**. There is nothing to retry and nothing to fall back to, because
there is no way to reach this person at all.

This is the only state that requires a human, and what it requires is not a
message. It is a **roster fix** — the person has no usable contact detail — so
the page names it and points at their record.

W1 shows this error concisely before approval; W6 owns handling it.

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

## The diagnostics page

**View diagnostics** is disabled on `main` and is designed nowhere — not in this
workflow's screens, and not in any other workflow of this mission. Brian raised
it at review on 2026-08-25, expecting it to give the individual detail of what
has been sent and what has not.

Proposed: it is a **page**, reached from the delivery page and built on the same
table and chrome as every other operator surface — not a dialog, because the
application has none. It is the per-person delivery record for one event, and it
belongs
here rather than in a later workflow, because it is what makes R15's "documented
recovery procedure" checkable rather than asserted. For each invitee it shows
every attempt on every channel — when, which channel, the outcome, the provider's
identifier, and the deduplicated webhook evidence the page already names.

It is operator-tier and **never shows a message body**. It answers "was this
person reached, and how do we know", not "what did we say to them".

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
- Routing to the fallback is an operator action and is attributable.

## Acceptance evidence

- With jobs present, Delivered, Queued and Failed report real counts, and
  Audience continues to report the frozen audience.
- A retrying person shows attempts made and the next attempt due, and offers no
  operator action.
- A person whose WhatsApp failed reads **WhatsApp unresponsive**, is counted, and
  offers no operator action, because the automated email fallback already carried
  the message.
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

| Decision                                                                             | Classification                | Governing evidence or recommended default                                                                                | Status          |
| ------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------- |
| LAN-78's delivery page is the surface repair happens on                              | `locked`                      | `D1`, `D4`                                                                                                               | Settled         |
| Retries are automatic and have no operator actor                                     | `locked`                      | `D6`, `F1`                                                                                                               | Settled         |
| The fallback is automated email and calendar, provided by Resend                     | `locked`                      | `D3`, `F5`, and the 2026-08-17 Resend amendment                                                                          | Settled         |
| Neither channel is ever the system of record                                         | `locked`                      | `R12`                                                                                                                    | Settled         |
| A missing WhatsApp route is an error, counted and visible                            | `locked`                      | `D8`, `OWN-missing-whatsapp-error`                                                                                       | Settled         |
| Repair never becomes a composing surface                                             | `proposed for owner approval` | The mission's own rule. Brian 2026-08-25: what the application currently asserts is not itself binding                   | Recommended     |
| Only a missing route requires a person; retries and the email fallback are automatic | `locked`                      | Brian 2026-08-25: "Wait should just be no action, route is automated, only the third action actually requires the owner" | Settled         |
| A WhatsApp failure stays visible even though email carried the message               | `locked`                      | Brian 2026-08-25: "If WhatsApp is down that's a failure. We can still email but that's something that needs to be seen"  | Settled         |
| The diagnostics page shows per-person send detail                                    | `proposed for owner approval` | Brian asked at review whether it is designed anywhere. It is not; see **The diagnostics page**                           | **Needs Brian** |
| Retrying people are shown but offer no action until retries exhaust                  | `proposed for owner approval` | `D6` gives the loop no actor; surfacing it as work invites pointless intervention                                        | Recommended     |
| **View diagnostics** becomes enabled and is operator-tier                            | `proposed for owner approval` | `R15` needs visible evidence; the page already names what it holds                                                       | Recommended     |
| Exact retry bounds and backoff                                                       | `delegated to Mission Lead`   | W7 owns policy values; the loop's shape is implementation                                                                | Delegated       |

## Brian approval

- **Exact words:** Pending
- **Date:** Pending
