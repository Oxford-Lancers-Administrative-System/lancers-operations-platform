# W8 — Work the queue and nudge

- Purpose/intended outcome: An operator opens the outstanding list on a Monday,
  sees who is furthest behind, **when each was last contacted and when the
  machine will next contact them**, and nudges one person or several in one
  action — each receiving only their own compiled ask.
- Primary actor: A four-role operator.
- Trigger: a person, usually Monday. Nothing about this workflow is automatic.
- Entry point / route: **`/operate/people/missing`**, the missing-data queue,
  which ships.
- Controlling source: `S28`, `S29`; owned `R4-T`, `M3`, `T11-batch-nudge`,
  `T11-nudge-outside-cap`, `T11-terminal-failure`, `T11-visibility`,
  `OD7-depart-stops`, `OD7-no-targeted-ask`.
- User-visible result: messages go out, each person gets their own link, and the
  queue records that a human asked.

## Current `main` grounding

The queue ships with `Name · Status · To the club · Missing · Correct`, sortable
by name and by how much is missing, and Mission 5 built it knowing nothing acted
on it yet.

| What ships                                             | What is missing                                      |
| ------------------------------------------------------ | ---------------------------------------------------- |
| The table, sortable, with a per-person missing summary | —                                                    |
| A `Correct` action routing to the operator edit path   | —                                                    |
| —                                                      | **when each person was last contacted, and how**     |
| —                                                      | **when the machine will next contact them**          |
| —                                                      | **any way to ask them** — the queue can only correct |
| —                                                      | **selection, and one action across several people**  |

`T11-visibility` is the first two. `M3` and `T11-batch-nudge` are the last two.

## What a nudge is, and is not

**A nudge sends the person's own compiled ask.** Not a new message, not a
one-fact question: the same link they already hold, compiled to whatever is
still outstanding for them. `OD7-no-targeted-ask` — Brian, 2026-09-02 — settled
that the system never generates a one-fact ask, so there is nothing else it
could send.

**A nudge is a human deciding.** `R4-T`'s trigger set is onboarding-open, the
operator nudge, a standing condition, and reopen — and reopen never auto-fires.
Nothing on this screen happens on a timer.

**Batch is several people, not one message to several people.**
`T11-batch-nudge`: each person receives their own compiled ask, addressed to
them, carrying their own link. There is no group message anywhere in this
mission, and a link is scoped to one person by construction.

**Operator nudges are outside the cap** (`T11-nudge-outside-cap`). The automated
chase stops after a configured number of messages that actually arrived; a human
is never stopped by that. The queue **warns** when the automated chase for
someone is already exhausted — not to prevent the nudge, but because that is
exactly the person a human should be thinking about.

## What the queue has to show, per person

`T11-visibility`, as three columns:

| Column           | What it says                                                         |
| ---------------- | -------------------------------------------------------------------- |
| **Last contact** | When, and **what kind** — the welcome, a follow-up, or a human nudge |
| **Next**         | When the machine will next write, or that it will not                |
| **Missing**      | Already ships                                                        |

"Or that it will not" carries three real cases: the chase is exhausted; the
person is unmessageable; or delivery terminally failed. Each is a person a human
has to handle, and the queue is where that becomes visible.

## Who is on the queue, and who is not

- **A disputed fact is not outstanding.** The person answered; nothing is being
  waited on from them (`W7`).
- **A person who left mid-onboarding drops off entirely.** `OD7-depart-stops`:
  the ask simply stops, nothing more is asked, and whatever records exist stay
  as they are.
- **An under-18 person is not messaged at all**, so they are not chaseable until
  a fresh owner decision defines under-18 handling.
- **A person with no consent is unmessageable** and shows as such rather than
  being silently skipped.
- **Terminal delivery failure** puts the person on the list for a human, and
  **no automated email is sent in its place** (`T11-terminal-failure`). The cap
  is not burned by a message that never arrived.

## Required actions

1. Open the queue, sorted by how much is outstanding.
2. Read, per person, what is missing, when they were last contacted and when the
   machine will next write.
3. Select one person, or several.
4. Nudge. Each selected person receives their own compiled ask.

## State transitions

| From   | To                            | On                                              |
| ------ | ----------------------------- | ----------------------------------------------- |
| `open` | `open`                        | A nudge. The ask does not change; it is re-sent |
| —      | logged                        | Every nudge appears on that person's `W6` log   |
| `open` | `exhausted — human follow-up` | The automated chase runs out (**`W9`**)         |

A nudge never creates a second ask: `person_access_tokens` permits one live
durable credential per person per season.

## Handoffs

| To / from  | What crosses                                                                  |
| ---------- | ----------------------------------------------------------------------------- |
| `W4`, `W5` | The compiled ask a nudge sends, and whatever comes back                       |
| `W6`       | Every nudge, onto the person's activity log, attributed to the operator       |
| `W9`       | A chase that has run out, which is that workflow's own trigger                |
| `W11`      | The cadence, the gap and the cap this screen reports against                  |
| Mission 4  | Transport: the pipeline, the templates, the delivery states, the cap counting |
| Mission 5  | The queue itself, its sorting and its missing-data summary                    |
| Mission 10 | The Monday report reads this; it does not own it                              |

## Dependencies and mission boundaries

| Seam                        | This mission's side                                  | The other side                           | Blocking?                         |
| --------------------------- | ---------------------------------------------------- | ---------------------------------------- | --------------------------------- |
| Mission 4 · Communications  | What a nudge is, when it is allowed, what it carries | Sending it, and the five delivery states | **Depends on LAN-93** — see below |
| Mission 5 · People & Roster | The three columns and the nudge action               | The queue, the table, the sorting        | Not blocking; shipped             |
| Mission 10 · Reporting      | The queue's content                                  | Its Monday surfacing                     | Not blocking                      |

**LAN-93 is a stated dependency, not an option.** The cap counts messages known
to have arrived, so delivery callbacks are what make "the automated chase is
exhausted" a true statement rather than a guess. Recorded in the overview's
rollout constraints; repeated here because this is the screen that displays it.

## Exceptions and recovery

- **Nudging somebody with nothing outstanding.** Not offered; they are not on
  the queue.
- **Nudging somebody unmessageable.** Refused, with the reason — no consent, no
  channel, or under 18.
- **A nudge that fails terminally.** The person stays on the list, flagged for a
  human; no automated email replaces it.
- **Nudging the same person twice in a minute.** Permitted — operator nudges are
  outside the cap — and both appear on the log.

## Safety, privacy, consent, and authority boundaries

- **Four-role only.**
- **Each person receives only their own ask**, on their own link. No group send
  exists anywhere in this mission.
- **Nothing is ever sent by hand.** A nudge rides Mission 4's pipeline,
  template-only in production.
- **The refuse-without-basis check still applies**: a nudge to somebody without
  a recorded basis is refused, and the welcome is the only exception.
- **No free text in a nudge.** An operator chooses who, never what.

## Acceptance evidence

| Screen  | What it proves                                                                      |
| ------- | ----------------------------------------------------------------------------------- |
| `W8-01` | The queue with last contact, its kind, and the next automated contact               |
| `W8-02` | Several people selected, one action, each receiving only their own compiled ask     |
| `W8-03` | The three people the machine will not write to again, and why each is a human's job |

Shot on `/operate/people/missing`, a real implemented route, both sides, measured
1280 and 375.

Grounding: **screenshots**.

## Core decisions

| Decision                                                                            | Classification                  | Governing evidence or recommended default                                                                                                                                                                         | Status   |
| ----------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| The surface is Mission 5's shipped missing-data queue                               | locked                          | It ships, it sorts, and nothing acts on it yet                                                                                                                                                                    | settled  |
| A nudge sends the person's own compiled ask, never a new message                    | locked                          | `OD7-no-targeted-ask`, `M3`                                                                                                                                                                                       | settled  |
| Batch means several people, each getting their own ask                              | locked                          | `T11-batch-nudge`; a link is scoped to one person by construction                                                                                                                                                 | settled  |
| Operator nudges are unlimited and outside the cap                                   | locked                          | `T11-nudge-outside-cap`                                                                                                                                                                                           | settled  |
| The queue warns when the automated chase is already exhausted                       | locked                          | `T11-nudge-outside-cap`; it warns, it does not prevent                                                                                                                                                            | settled  |
| Last contact, its kind, and the next automated contact are shown                    | locked                          | `T11-visibility`                                                                                                                                                                                                  | settled  |
| Terminal delivery failure lists the person for a human, sends no email in its place | locked                          | `T11-terminal-failure`                                                                                                                                                                                            | settled  |
| Leaving mid-onboarding drops the person off the queue entirely                      | locked                          | `OD7-depart-stops`                                                                                                                                                                                                | settled  |
| Nothing on this screen fires on a timer                                             | locked                          | `R4-T`                                                                                                                                                                                                            | settled  |
| **Whether the queue defaults to onboarding players only**                           | **proposed for owner approval** | The shipped queue lists everybody with missing data, including coaches and committee. The collection loop is players only. **Recommended: default to onboarding players, with the shipped scope still reachable** | **open** |
| Sort order on first open                                                            | delegated to Mission Lead       | The column ships sortable; which way it opens is presentation                                                                                                                                                     | settled  |

## Brian approval

- Exact words:
- Date:
