# W3 — Record an answer somebody gave you in person

- **Purpose/intended outcome:** A player answers a coach at training instead of
  in WhatsApp. The operator records that answer against the invitation so it
  counts exactly like one the player gave themselves, stops the chase, and stays
  permanently distinguishable from the player's own words.
- **Primary actor:** The operator who was told.
- **Trigger:** A player gives an answer out of band — at training, in a group
  chat, by text to a coach, or in passing.
- **Entry point:** The participation table on `/operate/events/[id]`, which
  LAN-157 shipped and which already lists every invitee and their answer. This
  workflow adds the ability to record one from the row that shows it is missing.
- **Route/placement:** In place, on the row. Recording an answer is not a
  separate destination; the operator is already looking at the person.
- **Controlling sources:** `PILOT-verbal-rsvp` (Brian's portfolio decision of
  2026-08-19, "provenance-visible, counts as a response; wording at Mission 4
  intake"); `T03-gap-operator-correction`; `T03-arriving-rsvp-cancels`; R5's
  reason requirement; and the shipped `rsvp_responses` columns.
- **User-visible result:** The row stops saying nobody has answered, says who
  recorded it and when the player actually said it, and that person disappears
  from the chase.

## Why this exists

Without it the club is punished for talking to each other. A player who says
"yes, I'll be there" to a coach on Tuesday is, as far as the system is
concerned, silent — so they get chased on Wednesday, and escalated to the
President on Thursday. The portfolio routed this decision here by name for that
exact reason: otherwise the escalation stream produces false positives.

The club's problem is not that answers are hard to collect. It is that the
answers it already has are invisible.

## The substrate already exists

Verified in `supabase/migrations/20260810120800_domain_participation.sql` and
`20260810120000_domain_types.sql` at `80e9616`:

- `rsvp_source` is already `('signed_link', 'operator', 'channel_reply',
'import')`. The provenance value this workflow writes is `operator`, and it
  already exists.
- `rsvp_responses.recorded_by_person_id` already records who entered it.
- `responded_at` and `recorded_at` are already separate columns: when the player
  said it, and when the operator typed it. Keeping them apart is what makes a
  Tuesday answer entered on Wednesday orderable against everything else.
- `rsvp_responses_no_requires_a_reason` already refuses a No with an empty
  reason at the database level.

This workflow adds no new response concept. It adds the surface that writes an
existing one.

## The journey

1. **See who has not answered.** The operator opens the event's participation
   table and filters to the people with no answer — a capability LAN-157 already
   shipped.
2. **Record what they were told.** The row offers **Record answer**. The
   operator chooses Yes or No, and for a No types what the player actually said.
3. **Say when they said it.** The form defaults to now and can be moved earlier.
   It cannot be moved into the future, and cannot predate the invitation.
4. **Save.** The response is written with `source = operator` and the operator's
   own person id.
5. **Watch the consequences.** The row now shows the answer and its provenance.
   Pending reminders for that person are cancelled and any un-actioned
   nonresponse flag is cleared, exactly as `T03-arriving-rsvp-cancels` requires
   of any arriving RSVP. The person leaves W5's chase list.

## Provenance is permanent and visible

Brian's 2026-08-19 decision requires this answer to be provenance-visible and to
count as a response. Both halves are load-bearing.

- **The operator table** shows the answer with its source. A recorded answer
  never renders identically to one the player gave.
- **The player's own page (W2)** shows it too: their standing answer, and that
  the club recorded it on their behalf, with the date. A player who never
  touched the system must still be able to see what the club believes they
  said — and correct it, because their own answer supersedes.
- **History is append-only.** A recorded answer is a new response row, never an
  edit of an existing one. Both remain readable in order.

The reason a player can silently disagree matters more here than anywhere else
in the mission: this is the one answer in the system the player did not give
with their own hands.

## Recording a No

A player's own No may stand as **No reason given**, because W2's design is
honest about a click that carried no explanation. **An operator's No may not.**
The operator was standing in front of the person who told them. The reason is
the thing they were told, and the form requires it in the operator's own account
of it — not a checkbox, and not the W2 default text.

This is not a stricter rule invented here. R5 and the database constraint have
always required a No to carry a reason; W2 satisfies it with an honest default
for a case where no human heard anything. That case does not arise here.

## Overwriting an answer the player gave themselves

Permitted, and deliberately uncomfortable. A player who clicked Yes in October
and told a coach in November that they can no longer make it is a real and
common case, and refusing it would send the operator to ask them to redo it in
WhatsApp — which is the behaviour this whole mission exists to end.

The surface must therefore:

- show the operator the answer they are about to supersede, and who gave it,
  before they confirm;
- keep both rows in history, so the change is visible rather than silent; and
- never let the recorded answer erase the player's own words.

## Recording after the event has started

`T03-gap-operator-correction` names the post-start operator correction path as
this workflow's. W2 closes all player writes at event start; an operator's
correction is a different act with a different purpose — it makes the record
true after the fact, usually while taking the register.

A post-start recording is permitted, always carries its own provenance, and
never resurrects a message: no job is scheduled, no chase is restarted, and no
notification is sent as a result. Attendance remains a separate axis owned by
Task 04, and a recorded RSVP never implies attendance.

## Handoffs

- **← W1** — the frozen audience. Only an invited person can be recorded.
- **← Mission 2 / LAN-157** — the participation table this is recorded from.
- **→ W2** — the same standing response, and the same cancellation result. A
  player who later answers themselves supersedes the recorded answer.
- **→ W4** — the operator view distinguishes recorded from player-given answers.
- **→ W5** — a recorded answer removes that person from the chase, which is the
  false-positive problem this workflow was routed here to solve.

## Dependencies and boundaries

- Task 04 owns attendance. Recording that somebody said Yes is not recording
  that they turned up, and the two must never be conflated.
- Mission 2 owns the participation table. This workflow adds a row action and a
  provenance rendering to it; it does not build a second table.
- Inbound WhatsApp replies remain non-authoritative for Release One (W2). An
  operator reading a group chat and recording what they read is this workflow,
  not the deferred inbound-reply path — the authority is the operator's, not the
  parsed message's.

## Exceptions

| Situation                                      | Behaviour                                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| The person was never invited                   | No row exists to record against; the audience is W1's and is frozen at approval                 |
| A No is offered with no reason                 | Refused in the form and refused by the database constraint                                      |
| The stated answer time is in the future        | Refused; `responded_at` may be moved earlier, never later                                       |
| The stated answer time predates the invitation | Refused; the player cannot have answered before being asked                                     |
| The player already answered themselves         | Permitted, shown before confirming, and both rows kept                                          |
| The player answers themselves afterwards       | Their own answer supersedes, and no chase restarts                                              |
| The event has started                          | Permitted as a correction, with no job scheduled and no message sent                            |
| The event is cancelled                         | Refused; there is nothing to answer                                                             |
| Two operators record different answers         | Both are kept in order; the latest stands, and the disagreement is visible rather than resolved |

## Safety, privacy, and authority

- Recording is an operator action behind the operator boundary. It is never
  available to a club-link holder, who may read the participation table but
  writes nothing.
- The recording operator is always identified in the row. An anonymous recorded
  answer is not a valid state.
- A recorded answer carries no player credential and issues none.
- The operator's typed reason is that player's personal data and appears
  wherever a reason appears — including the club link, which shows reasons to
  anybody holding it. Operators must be told that in the form, because the
  operator is writing words that will be read by more people than the player
  said them to.

## Acceptance evidence

- An operator records Yes and No from the participation table, and the row shows
  the answer, the source, who recorded it, and when the player said it.
- A No cannot be saved without a reason, in the form and at the database.
- `responded_at` may be backdated but never postdated, and never before the
  invitation.
- Recording cancels that person's pending reminders and clears an un-actioned
  nonresponse flag in the same transaction.
- The person disappears from W5's chase list and produces no escalation.
- The player's own page shows the standing answer and that the club recorded it
  on their behalf, and lets them change it.
- A player's own later answer supersedes a recorded one, and both remain in
  history.
- A post-start recording writes no job and sends no message.
- A recorded RSVP never marks attendance.
- Grounding is `main` at `80e9616d396336a7b575a975ecb012548b4ed611`.

## Core decisions

| Decision                                                                 | Classification                | Governing evidence or recommended default                                                          | Status                               |
| ------------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------ |
| An operator-recorded answer counts as a response and stops the chase     | `locked`                      | Brian's portfolio decision, 2026-08-19; `PILOT-verbal-rsvp`; `T03-arriving-rsvp-cancels`           | Settled                              |
| Provenance is permanently visible and never renders as the player's own  | `locked`                      | Brian's portfolio decision, 2026-08-19 — "provenance-visible"                                      | Settled                              |
| It is recorded in place on the LAN-157 participation table               | `proposed for owner approval` | The operator is already looking at the person who has not answered                                 | Recommended                          |
| An operator's No requires a real reason and may not use W2's default     | `proposed for owner approval` | R5 and the database constraint; the operator was told the reason                                   | Recommended                          |
| An operator may supersede an answer the player gave themselves           | `proposed for owner approval` | Refusing it sends the operator back to WhatsApp, which this mission exists to end                  | Recommended, shown before confirming |
| `responded_at` may be backdated, never postdated                         | `proposed for owner approval` | The columns already exist; a future answer is not a thing that happened                            | Recommended                          |
| A post-start recording is permitted and sends nothing                    | `proposed for owner approval` | `T03-gap-operator-correction`; correction is not communication                                     | Recommended                          |
| The player may change a recorded answer from their own page              | `proposed for owner approval` | This is the one answer the player did not give with their own hands                                | Recommended                          |
| Which operator roles may record                                          | `proposed for owner approval` | Default: any authorized operator who can already see the participation table. Narrowing is Brian's | **Open — needs Brian**               |
| Exact form copy and the operator-facing warning about who reads a reason | `delegated to Mission Lead`   | Must satisfy the visible and privacy acceptance without changing meaning                           | Delegated                            |

## Brian approval

- **Exact words:** Pending
- **Date:** Pending
