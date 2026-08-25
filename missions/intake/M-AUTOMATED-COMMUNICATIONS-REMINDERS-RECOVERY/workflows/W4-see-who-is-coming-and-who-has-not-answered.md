# W4 — See who is coming, and who has not answered

- **Purpose/intended outcome:** An operator opens an event and can tell, without
  asking anybody, who is coming, who is not, who has not answered, and — the part
  that does not exist today — what the club has actually done about the silence.
- **Primary actor:** Any operator who can already see the event.
- **Trigger:** Planning an event, or checking before chasing.
- **Entry point:** `/operate/events/[id]`, the participation table LAN-157
  shipped. No new page.
- **Route/placement:** In place. This workflow makes an existing column true and
  adds one thing next to it.
- **Controlling sources:** `E2` (operator RSVP monitoring), `T03-e2-adequate`
  ("the E2 monitoring views are adequate as they stand and are extended here with
  reminder and escalation state"), and the delivery vocabulary already shipped in
  `src/app/operate/events/[id]/delivery/presentation.ts`.
- **User-visible result:** The operator knows whether a silent person has been
  chased, how far, and what happens next — so they can decide whether to
  intervene rather than guessing.

## What already exists, and what is missing

Verified in the running application on 2026-08-25 at `80e9616`:

- The table lists every invitee with **Name, As, Invitation sent, Delivery,
  Answer, Reason, Attendance** and a column per event question.
- It sorts on every column and filters by name, capacity, answer, attendance and
  delivery, combining as you type.
- The three headline numbers — invited, said yes, showed — are already there.
- A club link opens the same table without the Delivery column.

One thing is not true. **The Delivery column reads "Nothing queued" for all 47
people**, because R6's scheduler does not exist: `notification_jobs` carries
`scheduled_for`, an idempotency key and six states, and nothing writes to it.
The column is honest today and useless.

This workflow is what makes that column mean something, and adds the one fact it
still cannot express: **where in the chase a silent person has got to.**

## The two changes

### 1. Delivery becomes true

The column reports the real state of that person's most recent job, using the
vocabulary already shipped: **Queued**, **Attempted**, **Delivered**, **Failed**,
**Retryable**. "Nothing queued" remains correct and visible where it is true —
an event whose invitations have not been dispatched yet, or a person with no
usable route.

The existing Delivery filter therefore starts doing work, and **Needs attention**
— already defined as failed or retryable — becomes the operator's shortest path
to the people W6 must repair.

### 2. Chase position, for people who have not answered

Alongside Delivery, an unanswered person shows how far the ladder has run and
what is next:

- **Invited · reminder Thu 18:00** — the first message went, the next rung is
  scheduled.
- **WhatsApp 2 sent · email Fri 09:00** — mid-ladder.
- **Email sent · escalation Sat 12:00** — final player-facing rung done.
- **Escalated to the President** — W5 has taken it; no further player rung.
- **Chase stopped** — they answered, or an operator recorded one, and the
  remaining jobs were cancelled.

This is a reading of `notification_jobs`, not a new record. W7 owns the offsets
that decide those times; W5 owns the escalation; W6 owns failure. W4 only shows
them together against a person.

## What this workflow does not do

- **It does not chase.** Seeing that eight people have not answered is not doing
  something about it — LAN-157's own ticket draws that line and it stands.
- **It does not repair.** A failed delivery is visible here and fixed in W6.
- **It does not change the audience.** That is frozen at approval by W1.
- **It does not add a second table.** Mission 2 owns this surface; this workflow
  extends it.
- **It does not show delivery to a club-link holder.** That tier excludes the
  Delivery column today (D3, D65) and continues to.

## Handoffs

- **← W1** — the committed messaging plan whose execution this reports.
- **← W3** — a recorded answer appears here as an ordinary answer, and its chase
  reads **Chase stopped**.
- **→ W5** — the operator sees who is genuinely unresolved before chasing.
- **→ W6** — **Needs attention** is the entry point for repair.
- **← W7** — the offsets that determine the "next rung" times shown here.

## Exceptions

| Situation                                       | Behaviour                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| No jobs exist for the event yet                 | Delivery reads **Nothing queued**, which is true, and no chase position is shown |
| A person has no usable route                    | **Not dispatched — no channel**, counted and visible rather than silently absent |
| The person answered                             | No chase position; the row is an ordinary answered row                           |
| The event has started                           | Chase positions stop advancing; what happened remains readable                   |
| The event is cancelled                          | Remaining jobs read cancelled; history is retained                               |
| A job is mid-flight when the page is read       | The state shown is the last recorded one, never a guess about the provider       |
| The reader holds a club link rather than a seat | Delivery and chase position are absent entirely                                  |

## Safety, privacy, and authority

- Delivery and chase state are operator-tier only. The club link tier already
  excludes Delivery and must exclude chase position for the same reason.
- No provider identifier, template id, phone number or message body appears in
  this surface. A person's route is described, never quoted.
- Reading this surface writes nothing and dispatches nothing.

## Acceptance evidence

- With jobs present, Delivery reports the real state per person using the
  shipped vocabulary, and the Delivery filter selects on it.
- **Needs attention** returns exactly the failed and retryable people.
- An unanswered person shows the rung already sent and the next one due; an
  answered person shows none.
- An escalated person reads **Escalated to the President** and shows no further
  player-facing rung.
- A person whose answer arrived reads **Chase stopped** in the same transaction
  that cancelled their jobs.
- Someone with no usable route reads **Not dispatched — no channel** and is
  counted.
- A club-link holder sees neither Delivery nor chase position, proved by test.
- The three headline numbers, sorting, filtering and question columns behave
  exactly as they do today.
- Grounding is `main` at `80e9616d396336a7b575a975ecb012548b4ed611`.

## Core decisions

| Decision                                                                | Classification                | Governing evidence or recommended default                                          | Status      |
| ----------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------- | ----------- |
| The existing table is extended rather than replaced                     | `locked`                      | `T03-e2-adequate`: the E2 views are adequate and are extended here                 | Settled     |
| Delivery uses the vocabulary already shipped                            | `locked`                      | `delivery/presentation.ts` defines queued, attempted, delivered, failed, retryable | Settled     |
| Chase position appears against people who have not answered             | `proposed for owner approval` | `T03-e2-adequate` names reminder and escalation state as this workflow's extension | Recommended |
| Chase position shows the next rung and its time, not just the last sent | `proposed for owner approval` | An operator deciding whether to intervene needs to know if the system already will | Recommended |
| Chase position is operator-tier and absent from the club link           | `proposed for owner approval` | The club link already excludes Delivery for the same reason (D3, D65)              | Recommended |
| This workflow never chases, repairs, or changes the audience            | `locked`                      | LAN-157's own boundary; W5, W6 and W1 own those                                    | Settled     |
| Exact column placement and wording of the chase phrases                 | `delegated to Mission Lead`   | Must satisfy the visible acceptance without adding a second table or a new page    | Delegated   |

## Brian approval

- **Exact words:** Pending
- **Date:** Pending
