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
| **WhatsApp message 1**   | Clear invitation                               | Event, date/time, venue, deadline, **Yes — view details**, **No — give reason**. **No social proof**: first contact is a plain invitation        |
| **WhatsApp message 2**   | Strong reminder                                | **We still need your answer**, updated Yes count, honest planning consequence, same two actions                                                  |
| **Email**                | Final direct player chase                      | **Action required**, event and deadline, updated social proof, clear statement that the club is still waiting, equivalent Yes/No calls to action |
| **Follow-up escalation** | Move the unresolved exception to the President | Owned by W5; no player personal data in the outbound escalation body                                                                             |

Social proof begins at the second rung. Brian's 2026-08-25 direction: the first
invitation is a plain invitation and carries no count, because leading first
contact with peer pressure is the wrong tone for somebody who has not yet been
asked. Every later rung, and every landing page, may carry accurate counts.

### The incomplete-answer nudge

A Yes with unanswered required event questions earns **exactly one** further
message — never a ladder, and never the RSVP chase restarted. It says the answer
is recorded, names what is still missing, and links to the player's own page.
It is sent once and never repeated, and whether the questions are then answered
changes nothing about the standing RSVP. Brian's 2026-08-25 direction: _"if they
said yes but didn't fill out all the questions, there should be one nudge"_ and
_"I don't think there should be a separate chase sequence."_ W5 owns escalation
and must not treat an incomplete answer as a nonresponse.

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
  and coaching from these responses. Tell the club why if you can.** The wording
  must never suggest the No is unrecorded until a reason arrives. The click
  already recorded it; the reason is follow-up work on a standing answer.
- Give **Change to Yes** the primary treatment. The page may add accurate social
  proof, for example **12 other people are attending**, but may not shame the
  player, invent scarcity or reveal names.
- **Give a reason and continue** is the single forward action. No separate
  continue control competes with it or with **Change to Yes**.
- Saving a real reason appends the player's actual explanation and replaces the
  displayed default. Abandoning the page leaves the authoritative No visibly
  qualified as **No reason given**.

### The player's own page

Brian's 2026-08-25 direction replaces the per-invitation landing page with a
durable page belonging to the person: _"each person in the roster has their own
unique page that they can go see that has all their events and everything on
it"_, and _"the end of the sequence should dump them onto the event page where
all the events are that they still need to fill out and are still coming up."_

Every answer ends here, and it has two halves:

- **Work that needs an answer**, at the top. **New invitations** are those the
  player has not opened; **Still need your answer** covers opened invitations
  with no Yes or No; **Follow-up needed** carries standing answers with missing
  reasons or unanswered questions. The next invitation is visually dominant.
- **Your answers — still to come**, below it. Everything this player has already
  answered whose event has not happened yet, **Yes and No alike**, each showing
  its standing answer and offering the change. Brian, 2026-08-25: _"it's
  everything that they've said, plus their RSVP status."_ Completed answers do
  not vanish; a player who said No in haste must be able to find it and change
  it without waiting to be asked again.

An empty queue is its own state: **No outstanding events**, the answered list
still reachable, and a link to the public calendar shipped by LAN-153 — the one
useful onward step available without an account.

**An approved event is visible immediately.** Brian, 2026-08-25: _"if an event
is approved then they see it… It may not message until we get closer, but the
event is there."_ Visibility does not wait for the invitation's scheduled
dispatch, so a player may answer before rung 1 is sent. W7 must therefore
suppress rungs for an invitation already answered rather than send a pointless
invitation.

### The person credential

The per-invitation `rsvp_access_tokens` row cannot express this page: its
`invitation_id` is `NOT NULL` and its `expires_at` is stamped at the event's
start, so it dies with one event. This workflow needs a **person-scoped token
associated with a season**, on the shape `club_link_tokens` already established
on `main` — digest only, one live per subject, revocable.

Brian's 2026-08-25 decision: _"the person token is associated with the season,
and then when the season closes, all those die. They should not be there."_
Season close is the terminal event; the token carries no separate lifetime.

This is a data-model addition and must be reflected in
`docs/architecture/data-model.md` with RLS and narrow grants in its creating
migration.

**Nonblocking unknown, with its handling rule.** `seasons.ends_on` is nullable
and season close is an operator action owned by Mission 10, which is not built.
A season that is never closed therefore gives the token no terminal event. The
handling rule that preserves safe execution: the token must be **revocable per
person without waiting for Mission 10**, so a leaked link can always be killed
by an operator action this mission ships. Revocation is not optional here — the
neighbouring club link deliberately shipped without it, and two unrevokable
durable credentials is not a posture this mission should add to.

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
- Expanding from one invitation to a durable per-person page is a deliberate
  capability change, and the largest one in this workflow. It reveals event
  summaries, that player's own standing answers, and aggregate counts for that
  player only; no peer identity or peer answer is exposed. Cross-person
  isolation is enforced server-side and proved by test: an identifier belonging
  to somebody else must be absent from content, DOM and response payload.
- **What the peer-visibility rule is, and is not.** "Aggregate counts, never
  names" governs what this mission's automated messages and player-facing pages
  reveal. It is **not** a confidentiality property of the underlying data.
  Verified against `main` at `80e9616` on 2026-08-25: the club link shipped by
  LAN-157 at `/e/[token]` shows any holder every invitee's name, answer, stated
  reason and attendance, with no account and — per its own ticket — no
  revocation. The packet must not imply a guarantee the system does not make.
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
- WhatsApp message 1 renders with no count of any kind; message 2, the email and
  the landing pages carry accurate counts.
- The player's page lists needs-an-answer work above already-answered upcoming
  events, shows both Yes and No with their standing status, and changes either.
- An approved event appears for its invitee before its invitation is dispatched,
  and answering it early suppresses rung 1 rather than sending it.
- The empty state reads **No outstanding events**, keeps the answered list
  reachable, and links to the public calendar.
- A person token stops resolving the moment its season is closed, and an
  operator can revoke one without a season close.
- An incomplete Yes produces exactly one further message. A second is a defect.
- Grounding is current `main` at
  `80e9616d396336a7b575a975ecb012548b4ed611`, Mission 2 packet v1's question
  model, and Meta's official WhatsApp Business Platform template examples.

## Core decisions

| Decision                                                                               | Classification                | Governing evidence or recommended default                                                      | Status                                                                   |
| -------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| WhatsApp presents Yes and No actions instead of one raw-link journey                   | `proposed for owner approval` | Brian's W2 feedback, 2026-08-24                                                                | Direction given; revised spec approval required                          |
| The action opens the answer-specific club page and records the click                   | `proposed for owner approval` | Brian's W2 feedback; constrained by Meta's split Quick Reply/URL behaviours and scanner safety | Recommended intent contract above                                        |
| A No click records No with **No reason given** until the player adds the actual reason | `proposed for owner approval` | Brian's resolution, 2026-08-24; explicitly supersedes R5's prior refusal shape                 | Direction given; revised spec approval required                          |
| A Yes remains standing while event questions are separately outstanding                | `proposed for owner approval` | Mission 2 already authorises per-event questions; Brian says the click is confirmation         | Direction given; revised spec approval required                          |
| The landing page becomes a durable page belonging to the person                        | `proposed for owner approval` | Brian 2026-08-25: "each person in the roster has their own unique page"                        | Largest capability expansion here; approval required                     |
| That page also lists already-answered events that have not happened yet                | `proposed for owner approval` | Brian 2026-08-25: "it's everything that they've said, plus their RSVP status"                  | Direction given; rendering to approve                                    |
| The person credential is season-associated and dies when the season closes             | `proposed for owner approval` | Brian 2026-08-25: "when the season closes, all those die"                                      | Data-model addition; carries a nonblocking unknown and its handling rule |
| An approved event is visible to its invitee before the invitation is dispatched        | `proposed for owner approval` | Brian 2026-08-25: "if an event is approved then they see it"                                   | Supersedes the recommendation to gate visibility on dispatch; W7 seam    |
| Social proof starts at the second rung; the first invitation is plain                  | `proposed for owner approval` | Brian 2026-08-25: first message is "just a regular invitation"                                 | Direction given; rendered in W2-01                                       |
| An incomplete Yes earns exactly one nudge and no second chase ladder                   | `proposed for owner approval` | Brian 2026-08-25: "there should be one nudge"                                                  | Direction given; W5 must not treat it as nonresponse                     |
| On the No page, **Give a reason and continue** is the single forward action            | `proposed for owner approval` | Brian 2026-08-25                                                                               | Direction given; rendered in W2-04                                       |

| Accurate aggregate Yes counts appear in player messages and pages | `proposed for owner approval` | Brian's W2 feedback, 2026-08-24 | Supersedes zero-peer-visibility if approved |
| WhatsApp 1, WhatsApp 2 and email use progressively stronger, distinct copy | `proposed for owner approval` | Brian's W2 feedback; W1 fixes the channel order | Exact reviewed mockup copy to approve |
| Direct typed WhatsApp replies remain non-authoritative | `locked` | Task 03 inbound-reply seam remains gated on Stuart's review | Unchanged |
| No separate confirmation message follows a completed answer | `locked` | The landing page and outstanding inbox provide confirmation; W1 adds no extra rung | Unchanged |
| Exact safe implementation of one-time actions, sessions and scanner resistance | `delegated to Mission Lead` | Must satisfy the visible and security acceptance without changing meaning | Delegated |

## Brian approval

- **Exact words:** Pending revised specification approval
- **Date:** Pending
