# W2 — Answer an invitation

- **Purpose/intended outcome:** A player receives the club's invitation without
  an operator sending it by hand, follows its private link, and records a clear
  Yes or No. The answer is confirmed to the player and immediately stops every
  later chase that has not already started.
- **Primary actor:** The invited player.
- **Trigger:** A due invitation, reminder or email job sends the player the
  latest signed RSVP link for an approved event that still awaits their answer.
- **Entry point:** The link in the player's WhatsApp message or email.
- **Route/placement:** The message is delivered outside the application. Its
  link opens the existing no-login route `/rsvp/[token]`.
- **Controlling sources:** Task 02 D9–D10 and F7; Task 03's binary RSVP,
  server-rendered page, reminder and arriving-response decisions; Requirements
  R5, R6 and R12; Register D1 and E1; Brian's 2026-08-22 boundary decisions; and
  the W1 sequence approved 2026-08-24.
- **User-visible result:** The player sees that their response was saved and can
  reopen the latest link to read or change it until the event starts. Once they
  answer, no later nonresponse message is sent for that invitation.

## The journey

1. **Receive the current rung.** The first contact is WhatsApp message 1. If the
   player remains unanswered, the schedule approved in W1 may later send
   WhatsApp message 2 and then email. Each message identifies the club and the
   event, states when it happens, and provides the current signed RSVP link.
2. **Open the link.** The existing signed page shows only this player's event,
   invitation and current answer. There is no login and no peer visibility; the
   link is the credential.
3. **Answer Yes or No.** **I'm attending** saves immediately. **I'm not
   attending** opens the existing required-reason step; blank and
   whitespace-only reasons are refused.
4. **See confirmation.** The existing **Your response is saved** state confirms
   the standing answer and says it can be changed until the event starts,
   including after the response deadline.
5. **Stop the chase.** Recording the response, updating the invitation, cancelling
   every pending reminder or fallback job, clearing any un-actioned nonresponse
   flag and writing the audit evidence happen as one committed result.

The response page itself is not redesigned in this mission. LAN-79's approved
UX-60 through UX-66 surfaces remain the player interface. This workflow connects
automatic delivery and the nonresponse sequence to that already-shipped surface.

## Message and link rules

- Production WhatsApp is approved-template-only. The existing invitation
  contract supplies the player's name, event name, event date/time and signed
  RSVP URL. Exact grammatical copy within that approved content is delegated to
  the Mission Lead and the template approval process.
- W1's order is fixed: WhatsApp message 1 → WhatsApp message 2 → email →
  follow-up escalation to the President. W7 owns the exact offsets and
  compression; this workflow obeys the resulting schedule and has no quiet-hours
  rule.
- Every message rung checks the standing response before it is claimed. A
  response committed first cancels the remaining rungs. A provider request
  already in flight cannot be recalled and remains honest delivery evidence.
- Plaintext RSVP tokens are never stored. A send mints a new token only at
  dispatch and supersedes the prior live token. Therefore the latest delivered
  message contains the link the player should use; an older message deliberately
  reaches the existing uniform **This RSVP link can't be used** response.
- A failed delivery retries under W6's policy. Each retry that reaches dispatch
  uses a fresh token. Terminal failure is visible to an operator in W6; it never
  becomes a manual-send path.
- A reply typed directly into WhatsApp is not an RSVP in Release One. The signed
  page remains the only player-write path unless Stuart's real-experience review
  produces a later owner-approved change. In-chat buttons remain deferred with
  the same seam.
- Saving an RSVP does not send a separate confirmation message. The signed
  page's saved state is the confirmation; adding another outbound message would
  be a new rung not present in the approved sequence.

## State transitions

- An unanswered invitation becomes `responded_yes` or `responded_no` through an
  append-only response row. Changing an answer appends another row and changes
  the standing projection; it never edits history.
- A No requires one nonblank reason. A Yes carries no reason.
- Pending notification jobs for that invitation become `cancelled` because the
  invitee responded. Jobs already `processing` or terminal retain their actual
  state and evidence.
- Any open, un-actioned nonresponse flag for the invitation clears when the
  answer arrives. The response does not erase the fact that escalation happened.
- The response deadline changes an unanswered invitation into an exception; it
  does not close the player-write window. Event start closes it.

## Handoffs

- **← W1** — the frozen audience and committed four-rung messaging plan.
- **← W7** — the exact schedule and any short-runway compression.
- **→ W4** — the standing Yes, No or no-response state shown to operators.
- **→ W5** — only if the player remains unanswered through the deadline.
- **→ W6** — delivery retries, terminal delivery failures and unusable routes.
- **← W3** — an operator-recorded answer lands in the same standing response and
  invokes the same cancellation and flag-clearing result.

## Dependencies and mission boundaries

- Mission 2 owns the event, approved audience and response deadline. W2 never
  adds a recipient or changes the event.
- Mission 7 defines the WhatsApp acceptance record. Dispatch must enforce that
  record before the hard-coded allowlist is removed; the acceptance gate becomes
  real first and the allowlist is removed second.
- W7 owns schedule values. W2 owns what happens when a player answers while that
  schedule is active.
- W6 owns provider failures. W2 promises the player only what a verified
  delivery and a committed response can prove.
- Production activation remains gated by approved Meta templates, the club
  number and webhook work, an accepted WhatsApp basis, email setup, and Stuart's
  review. Those gates do not block local implementation with synthetic data.
- Telephone routing is international. Invalid or ambiguous numbers refuse rather
  than guessing and sending a working link to a stranger.

## Exceptions and recovery

| Situation                                                             | Behaviour                                                                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| The player answers before a later rung                                | The remaining pending rungs are cancelled and no follow-up escalation is created for that invitation                        |
| The player answers after the response deadline but before event start | The answer is accepted, pending chase is cancelled and any un-actioned flag clears                                          |
| The player changes Yes to No                                          | A new response row is appended; a reason is required; the latest answer becomes standing                                    |
| The player changes No to Yes                                          | A new response row is appended with no decline reason; prior history remains auditable                                      |
| The player opens an older, superseded link                            | The existing security-uniform 404 says only that the link cannot be used and to request the latest one                      |
| The event has started                                                 | No response is written; the same security-uniform terminal surface is shown                                                 |
| A valid invitation's event is cancelled                               | The existing cancelled-event state names the event and says no response is needed                                           |
| A write is briefly throttled                                          | The page says the response could not be saved just now and asks the player to try again; no false event-start claim is made |
| WhatsApp delivery fails                                               | W6 retries or routes the terminal error; delivery failure never changes response state                                      |
| Email is unavailable when its rung becomes due                        | W6 records and exposes the failure; the system does not claim the player was contacted                                      |

## Safety, privacy, consent, and authority boundaries

- The token is 256-bit, URL-safe and stored only as a digest. It is never logged,
  rendered for an operator or recoverable from the database.
- The token is the authorization. The page and submission are server-side,
  no-cache, non-indexed and `no-referrer`; no browser-facing domain-table grant or
  public RLS policy is introduced.
- Unknown, expired, revoked, superseded and event-started tokens remain publicly
  indistinguishable in status, content, headers, actions and timing class.
- The page returns one player's event, invitation and standing answer only. It
  contains no peer names, counts or responses.
- Delivery state and response state remain separate. Accepted, attempted or
  delivered never means answered.
- The response actor is the signed-link mechanism, not a falsely asserted person
  identity. Append-only response and audit evidence preserve what happened.

## Acceptance evidence

- With fixed-clock synthetic scenarios, a due WhatsApp message is sent through
  the approved template with the correct player, event, local date/time and a
  newly minted signed link; no manual action or manual channel exists.
- A player can save Yes in one response action and No through the required-reason
  step at desktop and true 375px width, with no horizontal scrolling.
- A blank or whitespace-only No reason is refused in the browser, service and
  database layers.
- A saved answer, invitation response state, cancellation of every pending later
  rung, clearing of an un-actioned flag and audit evidence commit together. A
  forced failure proves none of the partial result remains.
- The scheduler cannot claim a later rung after the answer commits. A controlled
  race proves that an already in-flight attempt remains evidence rather than
  being rewritten.
- Reopening the latest link shows the standing answer and permits an append-only
  change until event start, including after the response deadline.
- Dispatching a later message supersedes the previous token. The old link and
  unknown, expired, revoked and event-started links all satisfy the existing
  uniform public-response contract.
- A cancelled event reaches the existing distinct cancelled-event state and
  writes no response.
- Message and page payload tests prove no peer data, provider secret, raw
  callback or token value is persisted or exposed outside the intended message.
- Grounding is current `main` at
  `80e9616d396336a7b575a975ecb012548b4ed611`: `/rsvp/[token]`, its plain-form
  actions, append-only response service, pending-reminder cancellation and
  security-uniform terminal states already exist. The new work is the automatic
  sequence and its end-to-end joins.

## Core decisions

| Decision                                                                                  | Classification              | Governing evidence or recommended default                                                         | Status                  |
| ----------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------- |
| RSVP remains strictly Yes or No; No requires one reason                                   | `locked`                    | R5 and the approved LAN-79 surface                                                                | Settled                 |
| The signed, no-login page remains the player response surface                             | `locked`                    | Task 02 D9; Task 03 server-rendered decision; Brian's 2026-08-22 ownership boundary               | Settled                 |
| WhatsApp message 1 → WhatsApp message 2 → email while unanswered                          | `locked`                    | W1, approved by Brian 2026-08-24                                                                  | Settled                 |
| A valid answer atomically cancels pending chase and clears an un-actioned flag            | `locked`                    | Task 03 arriving-RSVP decision                                                                    | Settled                 |
| Late answers are accepted until event start                                               | `locked`                    | D10 and the shipped LAN-79 contract                                                               | Settled                 |
| Each dispatch issues a fresh token, so only the newest message's link remains live        | `locked`                    | Existing token secrecy and one-live-token invariants on `main`                                    | Settled consequence     |
| Direct WhatsApp replies and in-chat response buttons are not authoritative in Release One | `locked`                    | D9 and Task 03's deferred inbound-reply gap, pending Stuart's review                              | Deferred seam preserved |
| No separate outbound confirmation is added after RSVP                                     | `locked`                    | W1's approved four-rung sequence; the existing saved page already confirms                        | No new rung             |
| Exact approved-template grammar within the required player, event, time and link content  | `delegated to Mission Lead` | Template approval can refine wording without changing the journey or data boundary                | Delegated               |
| Retry mechanics, scheduler claim interval and transactional implementation                | `delegated to Mission Lead` | Must satisfy the race, idempotence and evidence acceptance above without changing visible meaning | Delegated               |

There is no new owner decision in this draft. It applies the already-approved W1
sequence to the existing LAN-79 response journey and preserves the deferred
WhatsApp-reply seam rather than silently expanding it.

## Brian approval

- **Exact words:** Pending
- **Date:** Pending
