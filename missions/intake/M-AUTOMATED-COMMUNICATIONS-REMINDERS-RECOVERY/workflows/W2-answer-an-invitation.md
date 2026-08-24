# W2 — Answer an invitation

- **Purpose/intended outcome:** A player receives a native-looking, approved
  WhatsApp invitation with clear Yes and No choices, gives the club an answer
  from that choice, and lands on the club page to see the event, complete any
  required follow-up, and work through every other invitation still waiting for
  them.
- **Primary actor:** The invited player.
- **Trigger:** A due invitation, reminder or email job contacts a player who has
  not completed an answer for an approved event.
- **Entry point:** **Yes — view details** or **No — give reason** in an approved
  WhatsApp template. Email uses equivalent calls to action but does not pretend
  an automated link visit is a human answer.
- **Route/placement:** The choice opens the no-login RSVP experience. It begins
  with the selected event and then exposes the same player's outstanding-RSVP
  inbox.
- **Controlling sources:** Brian's W2 direction on 2026-08-24; Meta's official
  WhatsApp Business Platform template/button contract; Mission 2's approved
  per-event questions; Task 03's binary RSVP, reminder and response decisions;
  R5, R6 and R12; and the W1 sequence approved 2026-08-24.
- **User-visible result:** The player immediately sees what their button did,
  finishes anything the answer still requires, sees accurate social proof, and
  is strongly directed to the next unanswered invitation rather than leaving
  the club with a hidden queue.

## What changed from the first draft

The first draft treated WhatsApp as body copy containing one plain signed link
and treated the existing LAN-79 page as the whole player journey. Brian rejected
that shape. W2 now owns an interactive message, answer-specific landing states,
per-event questions, aggregate RSVP social proof, and a player-facing outstanding
invitation inbox.

It also supersedes two earlier assumptions when this specification is approved:

- D9's deferred-button shape becomes two approved WhatsApp actions. Direct typed
  WhatsApp replies remain deferred; the new controls are template actions, not
  free-text interpretation.
- Task 03's zero-peer-visibility rule becomes **aggregate social proof only**.
  The player may see an accurate count of Yes responses, never who supplied
  them or any other answer.

## The WhatsApp constraint and proposed answer contract

Meta exposes two relevant template button behaviours:

- a **Quick Reply** sends a button payload back through the WhatsApp webhook but
  does not open the club's webpage; and
- a **Call-to-Action / Visit Website** button opens a URL but does not itself
  provide the club with an authenticated webhook answer.

There is no single standard template button that both writes an answer through a
webhook and opens an external page. A URL is also a GET: link previews, security
scanners and reloads must not silently manufacture authoritative responses.

The mockup therefore renders Brian's requested visible journey using two URL
buttons and treating the click as the answer:

| Choice                 | Immediate recorded result                                                   | Landing page                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Yes — view details** | A one-time signed choice records Yes idempotently as the page is entered    | Confirms **You're attending**, asks applicable event questions, shows the live Yes count and outstanding invitations               |
| **No — give reason**   | Records No idempotently with the visible default reason **No reason given** | States strongly why the club needs a real reason; adding one supersedes the displayed default; the page encourages a change to Yes |

**Brian's resolution, 2026-08-24.** “No reason given” is the default reason/state
until the player supplies the actual reason. The No itself is authoritative from
the button click and stops the RSVP chase. This supersedes R5's prior refusal of
a No without a player-supplied reason: the system records the explicit default,
shows it honestly to player and operator, and replaces it only with a later real
reason. It never calls the default a reason the player supplied.

The Mission Lead must also prove that the chosen URL-button implementation does
not record a response from a preview/scanner. If Meta cannot provide that proof,
the safe fallback is a Quick Reply that records the choice followed immediately
by a separate **View event and finish** link; it is two taps and must be shown as
such rather than disguised as one.

## The journey

1. **Receive WhatsApp message 1.** The approved template says the player is
   invited, names the event and when it happens, gives the deadline, supplies an
   accurate Yes count when that count is nonzero, and presents the two answer
   actions. It does not expose a raw URL as body copy.
2. **Choose Yes or No in WhatsApp.** The selected action opens the matching
   answer state for that exact invitation. The click is recorded once; reloads
   are idempotent.
3. **See the event page.** The page contains the full event details, the player's
   current choice, an accurate aggregate such as **12 other people have said
   Yes**, and a prominent notice when other invitations still need answers.
4. **Complete the follow-up.** The Yes or No is already authoritative. A Yes
   player answers applicable event questions. A No player is strongly prompted
   to replace **No reason given** with the real reason or change to Yes. Optional
   questions remain visibly optional.
5. **See confirmation and continue.** The saved state confirms the standing
   answer and shows the outstanding-RSVP inbox, divided into **New invitations**
   and **Still need your answer**, with the next one visually dominant.
6. **Stop the chase.** Either button records the response, cancels every later
   player-facing RSVP rung and clears any un-actioned nonresponse flag atomically.
   Unanswered event questions and **No reason given** remain visible follow-up
   work on the page; they do not make the RSVP itself unanswered.

## Message ladder and pressure

These are distinct approved templates, not repeated copies of the first message.
The exact approved wording is reviewed in the mockup and may be adjusted during
Meta template approval without weakening the required information or pressure.

| Rung                     | Job of the message                             | Required content                                                                                                                                 |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **WhatsApp message 1**   | Clear invitation                               | Event, date/time, deadline, current Yes count when nonzero, **Yes — view details**, **No — give reason**                                         |
| **WhatsApp message 2**   | Strong reminder                                | **We still need your answer**, updated Yes count, honest planning consequence, same two actions                                                  |
| **Email**                | Final direct player chase                      | **Action required**, event and deadline, updated social proof, clear statement that the club is still waiting, equivalent Yes/No calls to action |
| **Follow-up escalation** | Move the unresolved exception to the President | Owned by W5; no player personal data in the outbound escalation body                                                                             |

Pressure is factual, specific and current. The system may say **18 others are
already attending** or **The club is still waiting for 4 answers, including
yours** only when that is true at dispatch. It never fabricates popularity,
names another person's answer, or implies a deadline has passed when it has not.
An old message remains an honest snapshot; the landing page shows the live count.

## Answer-specific page behaviour

### Yes path

- Lead with **You're attending** and the event details.
- Show positive social proof and the other-outstanding-invitations notice.
- Ask the event questions already authored and approved with the event. The
  existing model permits text, Yes/No and choice questions, each required or
  optional and filtered by invitation capacity.
- The initial Yes is already complete and visible to operators. Unanswered
  required questions carry the separate qualifier **Additional questions
  outstanding**; they do not roll the player back to no response.
- Changing to No remains available but visually secondary and lightly framed:
  **Plans changed? You can change your answer.**

### No path

- Lead with **You're not attending — no reason given**.
- Explain the operational reason strongly: **The club plans numbers, transport
  and coaching from these responses. Give a reason before No can be completed.**
- Give **Change to Yes** the primary treatment. The page may add accurate social
  proof, for example **12 other people are attending**, but may not shame the
  player, invent scarcity or reveal names.
- Saving a real reason appends the player's actual explanation and replaces the
  displayed default. Abandoning the page leaves the authoritative No visibly
  qualified as **No reason given**.

### Outstanding-RSVP inbox

- A valid invitation credential may reveal only outstanding invitations for the
  same person. This is a deliberate widening from one-invitation scope and must
  be enforced server-side with cross-person isolation tests.
- The page shows a prominent count at entry: **You have 2 other invitations to
  answer**.
- **New invitations** are those the player has not opened. **Still need your
  answer** covers opened invitations with no Yes or No. Missing reasons and
  unanswered event questions appear in a separate **Follow-up needed** section.
- Each row carries event type, name, date/time, response deadline, live Yes count
  when nonzero, and the same answer choices. Completed invitations are omitted;
  this is a work queue, not response history.

## State transitions

- A one-time Yes choice records `responded_yes`. Required event-question
  responses are separate follow-up state and do not change that answer.
- A one-time No choice records `responded_no` with the explicit default **No
  reason given**. Saving a real reason appends a newer No response carrying the
  player's explanation; history retains the default click evidence.
- Changing Yes to No or No to Yes appends response evidence; history is never
  edited. A No still requires a real reason.
- Either button click cancels pending later player-facing RSVP jobs and clears an
  un-actioned nonresponse flag. Jobs already processing or terminal retain their
  actual delivery evidence.
- Response deadline creates an exception but does not close answering. Event
  start closes all writes.

## Handoffs

- **← W1** — the frozen audience and committed message ladder.
- **← Mission 2 W4** — event details and per-event questions, already approved
  before messaging begins.
- **← W7** — the exact schedule and short-runway compression.
- **→ W4** — the operator sees completed answers plus missing-reason and
  question-follow-up qualifiers.
- **→ W5** — only genuinely unresolved invitations reach the President.
- **→ W6** — delivery retries, terminal failures and unusable contact routes.
- **← W3** — an operator-recorded answer completes the same standing response and
  invokes the same cancellation result.

## Dependencies and mission boundaries

- Mission 2 owns event authoring and the question definitions. W2 renders and
  records answers to those questions; it does not invent another question model.
- Mission 7 defines WhatsApp acceptance. Its enforced record replaces the
  hard-coded allowlist in that order.
- Production WhatsApp remains approved-template-only. W2 now requires at least
  three player-facing template shapes rather than one repeated invitation.
- W7 owns timing; W2 owns the content progression and what stops it.
- W6 owns provider failure. Delivery and RSVP remain separate axes.
- International telephone numbers are supported, but invalid or ambiguous
  numbers refuse rather than guessing.

## Exceptions and recovery

| Situation                                     | Behaviour                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A URL is visited by a preview or scanner      | No authoritative response may be created; proof is required before one-tap URL recording is accepted      |
| Yes is selected but required questions remain | Yes is standing; operator and player separately see **Additional questions outstanding**                  |
| No is selected and the page is abandoned      | No is standing; operator and player see the honest default **No reason given**                            |
| The player changes No to Yes                  | Yes becomes standing, **No reason given** remains only in append-only history, and no RSVP chase restarts |
| The player changes Yes to No                  | The No page requires a real reason before the standing answer changes                                     |
| Another invitation belongs to the same player | It appears in the outstanding inbox with its own event details and choices                                |
| An invitation belongs to somebody else        | It is absent from content, DOM and response payload even if identifiers are guessed                       |
| Event has started                             | No response or intent is written; the uniform terminal surface remains                                    |
| Valid event is cancelled                      | Existing cancelled-event state says no response is needed                                                 |
| Delivery fails                                | W6 retries or exposes terminal failure; response state is unchanged                                       |

## Safety, privacy, consent, and authority boundaries

- A signed credential remains the authorization. It is stored only as a digest,
  never logged or shown to an operator.
- Expanding from one invitation to the same player's outstanding inbox is a
  deliberate capability change. It reveals event summaries and aggregate counts
  for that player only; no peer identity or peer answer is exposed.
- Aggregate Yes counts are new peer visibility and supersede the prior zero-peer
  rule only if this revised specification is approved. Counts are never names.
- Unknown, expired, revoked, superseded and event-started credentials remain
  publicly indistinguishable.
- Reads remain no-cache, non-indexed and no-referrer. Domain writes remain
  server-only with no public table grants.
- Automated URL visits must not create answers. This is a release gate, not a
  best-effort check.

## Acceptance evidence

- A true WhatsApp rendering proves three approved player-facing template shapes:
  invitation, stronger reminder and final email-equivalent chase, with the two
  actions and no raw URL as primary body content.
- Provider-contract tests prove the exact approved template names, dynamic
  fields and button parameters, and distinguish CTA URL buttons from Quick Reply
  webhook buttons.
- Preview/scanner, reload and double-tap tests prove idempotence and prove no
  false RSVP is created.
- Yes and No choices land on their matching desktop and true-375px states. No
  horizontal scrolling is required.
- Required/optional text, boolean and choice questions render by invitation
  capacity and save with the invitation. A forced failure leaves no partial
  completed answer.
- A No click is immediately standing with **No reason given**. Adding the real
  reason appends new evidence and replaces the displayed default without editing
  history.
- Accurate live aggregate counts appear in messages and on the page without any
  peer name or answer detail. Zero-count copy is omitted rather than weaponised.
- The outstanding inbox returns only the same player's incomplete invitations,
  groups new versus incomplete work, and directs them to the next answer.
- Either response click cancels all later player-facing RSVP jobs and clears any
  un-actioned flag atomically; question/reason follow-up remains separately
  visible.
- Grounding is current `main` at
  `80e9616d396336a7b575a975ecb012548b4ed611`, Mission 2 packet v1's question
  model, and Meta's official WhatsApp Business Platform template examples.

## Core decisions

| Decision                                                                               | Classification                | Governing evidence or recommended default                                                      | Status                                          |
| -------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| WhatsApp presents Yes and No actions instead of one raw-link journey                   | `proposed for owner approval` | Brian's W2 feedback, 2026-08-24                                                                | Direction given; revised spec approval required |
| The action opens the answer-specific club page and records the click                   | `proposed for owner approval` | Brian's W2 feedback; constrained by Meta's split Quick Reply/URL behaviours and scanner safety | Recommended intent contract above               |
| A No click records No with **No reason given** until the player adds the actual reason | `proposed for owner approval` | Brian's resolution, 2026-08-24; explicitly supersedes R5's prior refusal shape                 | Direction given; revised spec approval required |
| A Yes remains standing while event questions are separately outstanding                | `proposed for owner approval` | Mission 2 already authorises per-event questions; Brian says the click is confirmation         | Direction given; revised spec approval required |
| The page exposes the same player's outstanding RSVP inbox                              | `proposed for owner approval` | Brian's W2 feedback, 2026-08-24                                                                | Capability expansion; approval required         |
| Accurate aggregate Yes counts appear in player messages and pages                      | `proposed for owner approval` | Brian's W2 feedback, 2026-08-24                                                                | Supersedes zero-peer-visibility if approved     |
| WhatsApp 1, WhatsApp 2 and email use progressively stronger, distinct copy             | `proposed for owner approval` | Brian's W2 feedback; W1 fixes the channel order                                                | Exact reviewed mockup copy to approve           |
| Direct typed WhatsApp replies remain non-authoritative                                 | `locked`                      | Task 03 inbound-reply seam remains gated on Stuart's review                                    | Unchanged                                       |
| No separate confirmation message follows a completed answer                            | `locked`                      | The landing page and outstanding inbox provide confirmation; W1 adds no extra rung             | Unchanged                                       |
| Exact safe implementation of one-time actions, sessions and scanner resistance         | `delegated to Mission Lead`   | Must satisfy the visible and security acceptance without changing meaning                      | Delegated                                       |

## Brian approval

- **Exact words:** Pending revised specification approval
- **Date:** Pending
