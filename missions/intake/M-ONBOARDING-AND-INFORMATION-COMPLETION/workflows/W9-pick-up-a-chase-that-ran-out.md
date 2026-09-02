# W9 — Pick up a chase that ran out

- Purpose/intended outcome: The machine has asked somebody as many times as it
  is allowed to and got nothing back. **It stops, permanently, and tells a
  human** — carrying a count and a link but no names. That human contacts the
  person themselves, and records what happened.
- Primary actor: Whoever holds the **configured escalation office**, initial
  value President.
- Trigger: an automated chase exhausts — the configured number of messages
  *that actually arrived* have gone out and nothing came back.
- Entry point: a message to the configured office. From there,
  `/operate/people/missing`, and then one person's record.
- Controlling source: `S30`, `S31`; owned `T11-escalation-target`,
  `T11-escalation-personal-data-free`; cited `T11-cap-delivered`,
  `T11-visibility` (`W8`), `T10-activity-log` (`W6`).
- User-visible result: a person who stopped answering is picked up by a human,
  and what that human did is on the record.

## The shape of it

Three moments, and only two of them have a screen.

1. **The escalation message.** Sent to the configured office. It says a chase
   has run out and how many people it concerns, and carries a link into the
   operator area. **It carries no names.**
2. **The list behind the link** — `/operate/people/missing`, scoped to the
   people whose chase has exhausted. This is where names appear, because this is
   behind a login.
3. **The record of what the human did.** They rang, or caught them at training,
   and that goes on the person's own log.

## Why the message has no names, and no screen

`T11-escalation-personal-data-free`. The escalation goes out over the same
transport as everything else — WhatsApp, or email — to whoever currently holds
an office. That is a channel the club does not control the endpoint of: an
officer's personal phone, a handset that may be shared, a mailbox that outlives
their term.

So the message is deliberately worthless to anybody who is not already an
operator: *"3 people have stopped answering. Open the queue."* The names sit
behind the login, where the four-role boundary already governs who sees them.

**It gets no screen of its own** because it is a message, not a page — and
drawing one would mean inventing a surface this application does not have. Its
content is specified here; the two screens are the two places an operator
actually goes.

## Why an office, not a person

`T11-escalation-target`: the target is a **configured office**, initial value
President, matching the pattern the club already uses. Presidents change every
year. An escalation addressed to a person stops working the day they hand over,
and does so silently — which is the worst possible failure for the one message
that exists to catch what everything else missed.

The office is configuration, and the surface that sets it is **`W11`**'s
alongside the cadence, the gap and the cap.

## What "exhausted" means exactly

`T11-cap-delivered`: the cap counts messages **known to have arrived**. A
message that failed to deliver does not burn a rung, and terminal delivery
failure is a different state with a different escalation (`W8-03`,
`T11-terminal-failure`).

- The chase stops **permanently**. It never resumes on its own, and no new
  season restarts it for that person.
- **Nothing is removed.** `OD7-depart-stops` governs leaving; exhaustion is not
  leaving. The person stays on the roster, their items stay outstanding, and
  they remain entirely welcome.
- **Only a human restarts it**, and the way they do that is `W8`'s nudge, which
  is outside the cap.

## Required actions

1. The office receives the escalation and opens the link.
2. They see the people whose chase has exhausted, with what each is missing and
   when each was last contacted.
3. They contact one of them **themselves** — in person, or by phone.
4. They record what happened on that person's log.

Step 3 is deliberately outside the system. This workflow's job is to get a name
in front of a human and to remember what the human then did; the club does not
need software to have a conversation.

## State transitions

| From                          | To                            | On                                      |
| ----------------------------- | ----------------------------- | ----------------------------------------- |
| `open`                        | `exhausted — human follow-up` | The last permitted delivered message goes unanswered |
| `exhausted — human follow-up` | `open`                        | **An operator nudges** (`W8`). Never automatic |
| —                             | logged                        | The human's own contact, recorded on the person's log |

## Handoffs

| To / from  | What crosses                                                              |
| ---------- | --------------------------------------------------------------------------- |
| `W8`       | The queue the link lands on, and the nudge that restarts a chase           |
| `W6`       | The recorded follow-up, onto the person's sectioned activity log           |
| `W11`      | The configured office, the cap, and the gap this workflow reports against  |
| Mission 4  | Transport for the escalation itself, and the delivery states behind the cap |
| Mission 10 | The Monday report surfaces exhausted chases; it does not own them          |

## Dependencies and mission boundaries

| Seam                       | This mission's side                                | The other side                          | Blocking?                        |
| -------------------------- | ---------------------------------------------------- | ----------------------------------------- | ---------------------------------- |
| Mission 4 · Communications | The escalation's content, its target, its timing   | Sending it, and the delivery callbacks  | **Depends on LAN-93** for the cap |
| Mission 10 · Reporting     | Exhaustion as a fact                               | Its Monday surfacing                    | Not blocking                     |

## Exceptions and recovery

- **Nobody holds the configured office.** The escalation has nowhere to go. It
  is retained and shown in the operator area rather than discarded — a message
  that silently vanishes is worse than one nobody reads.
- **Several chases exhaust at once.** One message with a count, not one message
  per person. The count is the whole payload.
- **The person answers after exhaustion.** The chase stays stopped; their answer
  is recorded as normal, and whatever remains outstanding waits for a human.
- **The escalation itself fails to deliver.** It is a message like any other and
  is visible in the operator area regardless.

## Safety, privacy, consent, and authority boundaries

- **No names, no counts per person, no item detail in the message.** A count and
  a link.
- **The link leads to a login**, not to a page. It confers nothing.
- **Free text an operator records** about a conversation is four-role only and
  never reaches a report verbatim.
- **Exhaustion is not a sanction.** It changes nothing about the person's
  standing, and nothing about it gates anything.

## Acceptance evidence

| Screen  | What it proves                                                                |
| ------- | ------------------------------------------------------------------------------- |
| `W9-01` | Where the link lands: the exhausted people, with names, behind the login       |
| `W9-02` | What the human did, recorded on that person's own log                          |

The escalation message itself has no screen: it is a message, and drawing one
would invent a surface the application does not have. Its exact content is in
this specification.

Shot on `/operate/people/missing` and `/operate/roster/[membershipId]`, both real
implemented routes, both sides, measured 1280 and 375.

Grounding: **screenshots**.

## Core decisions

| Decision                                                            | Classification                  | Governing evidence or recommended default                                                      | Status   |
| --------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ | -------- |
| The escalation carries a count and a link, never names              | locked                          | `T11-escalation-personal-data-free`                                                            | settled  |
| The target is a configured office, initial value President          | locked                          | `T11-escalation-target`; presidents change and a person-addressed escalation fails silently    | settled  |
| The office is configured on `W11`'s surface                         | locked                          | It sits with the cadence, gap and cap                                                          | settled  |
| The chase stops permanently and only a human restarts it            | locked                          | `R4-T`; the restart is `W8`'s nudge, outside the cap                                           | settled  |
| Exhaustion removes nobody and changes no standing                   | locked                          | `R3-G`; the boundary's "no automated timeout ever removes anybody"                             | settled  |
| The human's own contact is recorded on the person's log             | locked                          | `S31`, `T10-activity-log`                                                                      | settled  |
| One message with a count, not one per person                        | locked                          | `T11-escalation-personal-data-free`; the count is the payload                                  | settled  |
| **What happens when nobody holds the configured office**            | **proposed for owner approval** | An escalation with no recipient must not vanish. **Recommended: retain it and show it in the operator area**, rather than falling back to a named person or dropping it | **open** |
| The exact wording of the escalation                                 | delegated to Mission Lead       | Its content is fixed — a count and a link, no names. The sentence around them is presentation  | settled  |

## Brian approval

- Exact words:
- Date:
