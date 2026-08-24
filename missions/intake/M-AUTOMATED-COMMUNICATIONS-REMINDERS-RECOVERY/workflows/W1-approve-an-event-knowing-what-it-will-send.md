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

Anchored to the response deadline, which already exists per type:

| Rung       | When                                                 |
| ---------- | ---------------------------------------------------- |
| Invitation | At the anchor                                        |
| Reminder 1 | A configured offset before the deadline              |
| Reminder 2 | A shorter configured offset before the deadline      |
| Deadline   | Not a cutoff — a late answer is still accepted (D24) |
| Escalation | N hours after the deadline, to the President         |

Email is **not** a rung. It fires when a message cannot be _delivered_, never
when somebody will not _reply_ — those are the two streams `F4` joins into one
chase list, and the panel must say which is which or an operator will read it
wrong.

### Compression, when there is not enough runway

**The rule itself is deferred to `W7`, which owns policy.** Brian, 2026-08-22: "I
like that compression, but we aren't talking about that workflow yet." What is
settled here is `W1`'s obligation — whatever `W7` decides, this panel displays the
compressed plan and says plainly that it is compressed.

The shape under discussion, carried forward to `W7` rather than approved here:

1. Compute the full ladder from the event date.
2. Drop any rung that falls in the past.
3. Enforce a **minimum gap** between consecutive rungs; where two would collide,
   drop the earlier one. **The gap is 24 hours** — settled by Brian, 2026-08-22,
   raised from the proposed 12.
4. **Never drop the invitation, and never drop the escalation.** A short-notice
   event still gets asked and still gets chased. This replaces "clamped-deadline
   events skip reminders entirely", which leaves the commonest case unchased.
5. Respect quiet hours, rolling anything outside the window to its next opening —
   except that a rung rolled past the event start is dropped rather than sent.

Worked, for a practice with a two-day deadline and reminders at 24 and 4 hours
before it — illustrative of what the panel must show, not an approved schedule:

| Approved                      | What the approver is shown                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Four weeks out                | Invitations on the anchor date · both reminders · escalation the evening of the deadline |
| Two weeks out                 | The same, unchanged                                                                      |
| Three days out                | Invitations now · both reminders · escalation as normal                                  |
| Tomorrow                      | Invitations now · one reminder only, the other collides · escalation the same evening    |
| After the deadline has passed | Invitations now · no reminders · escalation after the full N-hour grace                  |

## Required actions

1. **Read the plan.** With the audience confirmed and before approving, the panel
   states, in the club's language and not in job records:
   - how many people will be messaged, and on which channel;
   - **when** the first message goes — now, or a stated date;
   - each reminder and when it fires;
   - when a nonresponder is escalated, and to which office;
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

| Exception                                                       | Behaviour                                                                                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nobody in the audience is reachable                             | The panel says so prominently. Approval is still permitted — the event is real either way — and every person appears in `W6`'s "Not dispatched" state             |
| The event is informational and solicits no response             | The panel says no messages will be sent, rather than showing an empty plan                                                                                        |
| The event type has no configured policy                         | **Refusal, not a default.** ADR 0021's pattern has no default arm; an unconfigured type is a refusal that names itself                                            |
| Approval happens after the response deadline has already passed | Invitations go immediately, no reminders, and the full N-hour grace still applies before any flag — a late-evening approval never wakes the President at midnight |
| The event is amended after approval                             | `W8`                                                                                                                                                              |

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
| **Minimum gap between rungs**                                                                  | `locked`                      | Brian, 2026-08-22: "24 hours is probably better instead of 12"                                                                                                                                 | **Settled 2026-08-22** |
| **The unreachable are named before approval, not discovered after**                            | `locked`                      | Brian, 2026-08-22: "if somebody is truly unreachable, their WhatsApp is not working, or it's something that should be alerted"                                                                 | **Settled 2026-08-22** |
| **An unreachable person is alerted, not merely listed**                                        | `proposed for owner approval` | Raised by Brian at `W1` and belonging to `W6`, which owns delivery health. `W1` names them at the moment of approval; the standing alert is specified where failures are handled               | **Deferred to `W6`**   |
| **The ladder** — how many reminders and at what offsets                                        | `proposed for owner approval` | Recommended: two reminders, at 48 and 24 hours before the deadline. Task 03 permits 0–3. It is the same policy question as compression, so it travels with it                                  | **Deferred to `W7`**   |
| **Compression rules**                                                                          | `proposed for owner approval` | Shape recommended above and liked by Brian; the rule itself is policy. Brian, 2026-08-22: "we aren't talking about that workflow yet"                                                          | **Deferred to `W7`**   |
| **The RSVP response deadline per type**                                                        | `proposed for owner approval` | Values exist and are owner-set (2026-08-13). Brian, 2026-08-22, wants them revisited with more detail alongside the rest of the schedule                                                       | **Deferred to `W7`**   |
| The plan is read-only at approval; values are per type, not per event                          | `proposed for owner approval` | LAN-77 explicitly withholds a per-event override. Brian has asked for more customisation, which is the same question as `W7`'s configurability                                                 | **Deferred to `W7`**   |
| Email is a delivery-failure route and not a rung of the chase                                  | `locked`                      | Task 02 §6 Shape B and `F4` — one list, two streams                                                                                                                                            | Settled                |
| An unconfigured event type refuses rather than inheriting a default                            | `locked`                      | ADR 0021's pattern, restated in Task 03 §4.2 — "no default arm"                                                                                                                                | Settled                |
| Exact panel layout, wording and how the plan condenses at 375px                                | `delegated to Mission Lead`   | Presentation within the approved content and the mockup standards                                                                                                                              | Delegated              |

## Brian approval

- **Exact words:**
- **Date:**
