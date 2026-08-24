# W1 — Approve an event knowing what it will send

- **Purpose/intended outcome:** An approver performs the one irreversible act in
  the event lifecycle having seen what it will set off — who is about to be
  messaged, when, by what route, who cannot be reached at all, and what happens
  to anyone who does not answer.
- **Primary actor:** An approver holding `event_approval` — President, Vice
  President, Secretary, General Manager.
- **Trigger:** They open a draft event whose audience is confirmed, intending to
  approve it.
- **Entry point:** The event page's approval panel, on Mission 2's surface.
- **Route/placement:** `/operate/events/[id]`, alongside the Approve action.
  Mission 2 builds the page; this mission supplies the panel and everything in it.
- **Controlling source:** Brian's decision of 2026-08-22 (`00-boundary.md`
  §6) — no brief specifies this. Task 02 §4 has only a post-approval delivery
  view; Task 03 §4.2 answers "where are the rules?" with a documentation pointer
  rather than a screen; and Task 02 D6 argued against showing a "next automated
  attempt" precisely because no scheduler existed. This mission builds that
  scheduler, so the reasoning inverts.
- **User-visible result:** Before approving, they can read the whole messaging
  plan for this event; after approving, they are told what was actually set in
  motion, which is the same plan with anything that failed immediately made
  visible.

## The schedule model this workflow displays

The plan is derived, never typed. Three values per event type produce it, and
today only the first exists.

| Value             | Meaning                                                            | Exists today                                           |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| Response deadline | When an unanswered invitation becomes an exception the club chases | **Yes** — `response-deadline.ts`, owner-set 2026-08-13 |
| Invitation lead   | How far ahead of the event the invitation is sent                  | **No** — approval is currently the send                |
| The ladder        | Reminder offsets, and the escalation threshold after the deadline  | **No**                                                 |

### The anchor

`invite_at = max(now, event_date − invitation_lead[type])`

Approve a game four weeks out with a two-week lead, and nothing is sent for two
weeks. Approve it ten days out, and it goes immediately. The rule never sends
into the past and never delays an event that is already close.

**This changes what approval means.** R4 currently reads that approval
"atomically starts invitations/automation." Under an anchor, approval atomically
_commits the plan_ — freezing the audience, creating every job, and scheduling
the first one — and dispatch happens when the anchor arrives. The audience freeze,
which is what R4 is protecting, is unchanged.

**Settled by Brian, 2026-08-22.** Approval commits the plan, with one guarantee
stated rather than left implicit in the arithmetic:

> **An event closer than its own invitation lead dispatches immediately.** A
> practice two days away, whose lead is five, is not held back — it goes on
> approval, and the panel says so in those words.

That is what `max(now, …)` already computes; it is written here because a
guarantee an approver depends on must be readable, not derived. Brian's words:
"if practice happens in 2 days and we're approving and we're sending it out, that
needs to go out now, right? It should say that."

### The ladder

The sequence is fixed; W7 still owns its offsets and compression:

| Step                  | Recipient and route                             |
| --------------------- | ----------------------------------------------- |
| WhatsApp message      | The user, through their expected WhatsApp route |
| Email                 | The user, after the WhatsApp step               |
| Follow-up escalation  | The next configured nonresponse step            |
| Send to the President | The President as the responsible office holder  |

This is a nonresponse sequence, not merely a transport retry chain. Delivery
failures still retry and enter W6 recovery, but email also follows WhatsApp in
the chase sequence when the user has not answered. Every job started by the app
must reach a recorded terminal outcome or a visible recovery state.

### Compression, when there is not enough runway

**The rule itself is deferred to `W7`, which owns policy.** Brian, 2026-08-22: "I
like that compression, but we aren't talking about that workflow yet." What is
settled here is `W1`'s obligation — whatever `W7` decides, this panel displays the
compressed plan and says plainly that it is compressed.

The prior drop-and-gap proposal is not approved. Brian reopened the compression
timeline on 2026-08-24 because it needs a different shape. W7 must work out how
the four-step sequence behaves when there is not enough runway; W1 only requires
the approval panel to show the resulting compressed plan plainly.

There are **no quiet hours**. Compression must not delay or discard a step on
that basis. The revised rule must also preserve a visible terminal outcome: a
message is completed, fails into recovery, or remains visibly pending—never
silently abandoned.

## Required actions

1. **Read the plan.** With the audience confirmed and before approving, the panel
   states, in the club's language and not in job records:
   - how many people will be messaged, and on which channel;
   - **when** the first message goes — now, or a stated date;
   - when the WhatsApp message, email, follow-up escalation and President step
     each occur;
   - **who cannot be reached at all**, by name and count — no accepted channel,
     no usable number, no recorded consent basis. These are D8's "Not dispatched"
     people, and approval is the last moment before they are silently absent;
   - that a delivery failure retries automatically, and what happens when retries
     are exhausted.
2. **See a short-notice event labelled as one.** Where compression has dropped
   rungs, the panel says so plainly rather than showing a quietly shorter list.
3. **Approve.** The audience freezes, every job is created, and the first is
   scheduled or dispatched.
4. **Read what actually happened.** The confirmation restates the plan and names
   anything that failed at once.

## State transitions

- `draft → approved` on the event, which is Mission 2's transition; this workflow
  contributes no event-state change of its own.
- Jobs are created `pending` and become `ready` when their scheduled moment
  arrives. Nothing here writes `invitations` or `event_audience_members` — the
  audience freeze is Mission 2's, and there is no path through this workflow by
  which a late recipient could be added.

## Handoffs

- **← Mission 2 (`W4`)** — the confirmed audience, the event type, the date and
  time. Without a confirmed audience there is no plan to show.
- **→ `W2`** — the invitation the player receives.
- **→ `W5`** — the escalation this plan schedules.
- **→ `W6`** — anything that fails on dispatch.
- **→ `W7`** — every value in the plan is read from the policy this workflow
  displays and `W7` governs.

## Dependencies and mission boundaries

- **Mission 2 owns the page.** This mission owns the panel's content and the
  derivation behind it. Mockups here are grounded against Mission 2's approved
  `W4` mockup, not against `main`, and the acceptance record says so.
- **Mission 7 owns the consent basis** the "cannot be reached" list checks.
- The seven event types are established by Mission 2's first work package; this
  workflow reads the type and never defines it.

## Exceptions and recovery

| Exception                                                       | Behaviour                                                                                                                                                            |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A user has no usable WhatsApp route                             | The panel treats this as an error and names the user. Every user is expected to have WhatsApp; W6 owns handling the error rather than W1 inventing a fallback action |
| Nobody in the audience is reachable                             | The panel says so prominently. Approval is still permitted — the event is real either way — and every person appears in `W6`'s "Not dispatched" state                |
| The event is informational and solicits no response             | The panel says no messages will be sent, rather than showing an empty plan                                                                                           |
| The event type has no configured policy                         | **Refusal, not a default.** ADR 0021's pattern has no default arm; an unconfigured type is a refusal that names itself                                               |
| Approval happens after the response deadline has already passed | The first step goes immediately and the panel shows the compressed sequence selected by W7; no quiet-hours rule delays it                                            |
| The event is amended after approval                             | `W8`                                                                                                                                                                 |

## Safety, privacy, consent, and authority boundaries

- The panel is behind `event_approval`; a coach never sees it.
- Naming the unreachable to an approver is operator-facing and inside the
  operator boundary. Nothing here changes the rule that **no player personal data
  rides in an escalation message body** (`W5`).
- The plan is a projection. Reading it sends nothing, and it must not be built in
  a way that creates jobs to display them.

## Acceptance evidence

- An approver, on a fresh event of each of the seven types, is shown a plan whose
  every stated time matches what the scheduler subsequently does.
- The four runway cases above each produce the stated plan, asserted by test
  against fixed clock values rather than by inspection.
- An event type with no configured policy refuses and names itself; no default is
  inherited.
- A person with no usable number, no accepted channel, or no consent basis appears
  in the unreachable list before approval and in `W6` afterwards, and the two
  agree.
- The plan shows the ordered WhatsApp, email, follow-up escalation and President
  steps, and every started job reaches a terminal outcome or visible recovery
  state.
- A missing WhatsApp route is shown as an error and handed to W6; W1 offers no
  invented manual-send control.
- The panel renders at 375px with the plan legible and no horizontal scroll.
- Grounding: Mission 2's approved `W4` mockup. Screenshots of a live page are
  impossible because Mission 2 has not built it.

## Core decisions

| Decision                                                                                       | Classification                | Governing evidence or recommended default                                                                                                                                                      | Status                 |
| ---------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| An approver sees the messaging plan before approving                                           | `locked`                      | Brian, 2026-08-22                                                                                                                                                                              | Settled                |
| **Approval commits the plan rather than performing the send**                                  | `locked`                      | Brian, 2026-08-22: "Yes, approval commits the plan rather than sending." The audience freeze R4 protects is unchanged; only the moment of dispatch moves                                       | **Settled 2026-08-22** |
| **An event closer than its own invitation lead dispatches immediately, and the panel says so** | `locked`                      | Brian, 2026-08-22: "if practice happens in 2 days and we're approving and we're sending it out, that needs to go out now, right? It should say that"                                           | **Settled 2026-08-22** |
| **Invitation lead per event type**                                                             | `locked`                      | Brian, 2026-08-22: "invitation per thing is fine for now." Game 14 days · Social 10 · Practice, S&C, Chalk, Recruitment, Meeting 5. "For now" is recorded — the values are revisitable at `W7` | **Settled 2026-08-22** |
| **Minimum gap between rungs**                                                                  | `proposed for owner approval` | Brian preferred 24 hours on 2026-08-22, then reopened the compression timeline on 2026-08-24. W7 must settle the revised rule                                                                  | **Deferred to `W7`**   |
| **The unreachable are named before approval, not discovered after**                            | `locked`                      | Brian, 2026-08-22: "if somebody is truly unreachable, their WhatsApp is not working, or it's something that should be alerted"                                                                 | **Settled 2026-08-22** |
| **An unreachable person is alerted, not merely listed**                                        | `proposed for owner approval` | Raised by Brian at `W1` and belonging to `W6`, which owns delivery health. `W1` names them at the moment of approval; the standing alert is specified where failures are handled               | **Deferred to `W6`**   |
| **The ladder** — how many reminders and at what offsets                                        | `proposed for owner approval` | Recommended: two reminders, at 48 and 24 hours before the deadline. Task 03 permits 0–3. It is the same policy question as compression, so it travels with it                                  | **Deferred to `W7`**   |
| **Compression rules**                                                                          | `proposed for owner approval` | The earlier drop-and-gap shape is not approved. Brian, 2026-08-24: "If it's compressed, the compression timeline should be done a little bit differently. We'll just have to work that out"    | **Deferred to `W7`**   |
| **The RSVP response deadline per type**                                                        | `proposed for owner approval` | Values exist and are owner-set (2026-08-13). Brian, 2026-08-22, wants them revisited with more detail alongside the rest of the schedule                                                       | **Deferred to `W7`**   |
| The plan is read-only at approval; values are per type, not per event                          | `proposed for owner approval` | LAN-77 explicitly withholds a per-event override. Brian has asked for more customisation, which is the same question as `W7`'s configurability                                                 | **Deferred to `W7`**   |
| **The sequence is WhatsApp message → email → follow-up escalation → President**                | `locked`                      | Brian, 2026-08-24                                                                                                                                                                              | **Settled 2026-08-24** |
| **There are no quiet hours**                                                                   | `locked`                      | Brian, 2026-08-24: "There is no such thing as quiet hours"                                                                                                                                     | **Settled 2026-08-24** |
| **A missing WhatsApp route is an error whose handling belongs to W6**                          | `locked`                      | Brian, 2026-08-24: "Every user should have WhatsApp. That should be treated as an error, though. That's not handled here"                                                                      | **Settled 2026-08-24** |
| An unconfigured event type refuses rather than inheriting a default                            | `locked`                      | ADR 0021's pattern, restated in Task 03 §4.2 — "no default arm"                                                                                                                                | Settled                |
| Exact panel layout, wording and how the plan condenses at 375px                                | `delegated to Mission Lead`   | Presentation within the approved content and the mockup standards                                                                                                                              | Delegated              |

## Brian approval

- **Exact words:** "Then it's approved. Go make the mockup."
- **Date:** 2026-08-24
