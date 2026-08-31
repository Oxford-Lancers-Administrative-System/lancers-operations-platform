# W15 — The recruit messaging flow

- Purpose/intended outcome: one place that says **everything the club ever sends
  a recruit**, in order, with what fires it, what the recruit lands on, and what
  is recorded. Added on 2026-08-31 because Brian asked for it repeatedly and it
  did not exist: _"Where is the workflow to manage the messaging flow just for
  recruits? I've mentioned this a dozen times... Recruit messaging flow. Get that
  workflow in here."_
- Primary actor: the recruit receives it; an operator reads and configures it.
- Trigger: capture at any door, an operator's hand, or a recruitment event.
- Entry point: configured at **Administration → Messaging schedule**, in the
  Recruitment section (`W10`). Observed **per recruit** on their own record's
  audit (`W2`).
- Route/placement: no new page. This workflow is the flow itself; the two
  surfaces that carry it already exist.
- User-visible result: a recruit hears from the club exactly this much and never
  more.

## Why this is its own workflow

`W10` administers the machinery — the delays, the toggles, the QR. `W2` shows
what one recruit was sent. Neither says **the whole sequence in one place**, and
that is the thing Brian kept asking for: not a settings page and not one
person's history, but the flow.

It is also where the mission's hardest rule is enforced end to end: **never
harsh**. Every line below is bounded, and the boundedness is the point.

## Everything the club sends a recruit

| #   | Message                     | Fires                                     | They land on                        | Recorded as              |
| --- | --------------------------- | ----------------------------------------- | ----------------------------------- | ------------------------ |
| 1   | `recruit_welcome`           | Capture — walk-up and operator-add only   | The WhatsApp group link             | Audit line on the record |
| 2   | `recruit_details_ask`       | 1 day after capture                       | `W4-01`, the personal questionnaire | `Questionnaire sent`     |
| 3   | `recruit_details_reminder`  | 3 days later, **once**                    | The same form                       | Audit line               |
| 4   | `recruit_interest_ask`      | 3 days after capture                      | `W4-02`, the football questionnaire | `Questionnaire sent`     |
| 5   | `recruit_interest_reminder` | 3 days later, **once**                    | The same form                       | Audit line               |
| 6   | `event_invitation`          | A recruitment event is approved           | `W11-03` or `W11-04`, yes or no     | RSVP on the event        |
| 7   | The event follow-up         | 2 days later, **once**, only if no answer | The same two pages                  | Audit line               |

**A QR recruit skips 1**: they joined the group themselves at the stand, so the
welcome has nothing to tell them.

## What is never sent

- **Anything at all to a recruit who declined.** Enforced, not left to judgement:
  the send is refused and the record says why (`W2-04`).
- **A second reminder.** There is one per ask, and then silence. Not a shorter
  cadence — none.
- **An escalation.** Nothing about a recruit ever reaches the President. That is
  the players' ladder and recruits are not on it.
- **A chase for an unanswered event.** One invitation, one follow-up, nothing.
- **Free text.** Every message is a Meta-approved template. There is no composer
  anywhere in this mission.

## The two ladders, side by side

Brian, 2026-08-31: _"Individual players get the normal chase if it's a mandatory
event. Recruits never get that."_

|                              | Player                           | Recruit                                 |
| ---------------------------- | -------------------------------- | --------------------------------------- |
| Invitation                   | Yes                              | Yes                                     |
| Reminders                    | Every cadence until they run out | **One**                                 |
| Escalation to the President  | Yes, on a mandatory event        | **Never**                               |
| A reason required to decline | Yes                              | **Never asked** — the system writes one |
| Email fallback               | Yes                              | Not proposed                            |

## Where each half lives

- **Configured:** `W10`, the Recruitment section of the messaging schedule —
  steps 1–5 as cycle rows, steps 6–7 as the `Recruit event invitations` row.
- **Observed, per recruit:** `W2`'s audit, which carries every send with its date
  and delivery state.
- **What the recruit lands on:** `W4-01` and `W4-02` for the questionnaires,
  `W11-03` and `W11-04` for an event.

## Dependencies and mission boundaries

- **Mission 4 / the transport.** It owns delivery, the scheduler and the template
  inventory. This mission says what recruitment sends and when; it does not
  rebuild the machine.
- **Mission 7 / onboarding.** Everything after the flip is Mission 7's, and the
  messaging schedule's third section is reserved for it.

## Blocked on an owner action

Only `event_invitation` exists in Meta today. Steps 1 to 5 need four templates
that have not been submitted, review takes days to weeks, and it is outside the
club's control. **The flow can be built and cannot run until Brian has cleared
them.**

## Brian approval

- Exact words:
- Date:
