# W7 — Settle a disputed fact

- Purpose/intended outcome: `W5` lets a player say the club is wrong without
  overwriting it. **This is the other half**: an operator sees the club's value,
  the player's answer and the whole history, and decides — leaving the flag, the
  correction and the confirmation each attributable.
- Primary actor: A four-role operator.
- Trigger: a fact goes to `disputed — awaiting verification` when a player's
  answer differs from an operator-recorded value (`W5`).
- Entry point / route: **`/operate/people/[personId]`**, the person record,
  which ships. Reached from the missing-data queue, the roster, or a link in the
  chase.
- Controlling source: `S35`, `S36`; owned `T07-merge-precedence`; cited
  `T11-provenance` (`W5`), and boundary item 14.
- User-visible result: one value stands, the other is retained, and the record
  says who decided and when.

## Where this sits

`W5` raises; `W7` settles. Nothing else raises a dispute and nothing else
settles one.

The surface is the person record, not the roster record: the facts a player can
contest — name, contact, college, course, date of birth — are **person** facts,
and `/operate/people/[personId]` is where they already render, each already
carrying who supplied it.

## Current `main` grounding

The person record is further along than the roster one for this purpose.

| What ships at `/operate/people/[personId]`                            | What is missing                             |
| ----------------------------------------------------------------------- | --------------------------------------------- |
| A `Fact` row per person fact                                          | —                                             |
| `By` / `DerivedBy` — a bordered caption naming who supplied the value  | —                                             |
| A **history section**, expandable, filterable by field and by actor    | —                                             |
| A missing-required banner                                              | —                                             |
| —                                                                      | **the disputed state itself**                 |
| —                                                                      | **a second, contested value alongside the first** |
| —                                                                      | **a resolve control**                         |

Mission 5 was explicit that it shipped none of the last three
(`REQ-no-disputed`, `REQ-no-verification-mark`): "There is no contested-value
field, no verification-mark field and no confidence class anywhere below — not
struck out, never added." That is the seam this workflow fills, and the
attribution badge it fills it with is already there.

## What resolving means

The operator sees three things, all of which the record can already express:

1. **The club's value**, with the `By` badge naming who recorded it.
2. **The player's answer**, with its own badge naming them and the date.
3. **The history**, which already filters by field and by actor.

And chooses one. Whichever loses is **retained, never deleted** — the audit
posture is append-only and a superseded value survives.

**Three things stay attributable afterwards**, which is the whole requirement of
the inventory's own wording:

| Event            | Attributed to                                   |
| ---------------- | ------------------------------------------------- |
| The flag         | The player, at the moment they submitted `W5`   |
| The correction   | Whoever's value was wrong, and when it was set   |
| The confirmation | The operator who resolved it, dated              |

## Which consent record wins on a merge

`T07-merge-precedence` is this workflow's own open item, and it is a rule rather
than a screen.

`season_messaging_consents` is **unique on `(person_id, season_id)`**. A merge of
two people who both hold a consent row for the same season therefore cannot keep
both, and the database will refuse the merge outright rather than choose.

**Recommended: the most restrictive state wins, not the most recent.** If either
record says `refused` or `withdrawn`, the surviving person is `refused` or
`withdrawn`. Consent is permission to contact somebody; a merge is a
record-keeping operation, and record-keeping should never be able to manufacture
permission that a person had actually declined. The losing row is retained like
any other merged-away value, so the decision is auditable and reversible.

This has **no surface of its own**. Mission 5's merge comparison already lists
what stays with the losing record, and this is one more line in it.

## Required actions

1. Open a person with a disputed fact.
2. Read both values, both attributions, and the history.
3. Resolve: keep the club's value, or take the player's.
4. Optionally record why — free text, four-role only, never in a report.

## State transitions

| From                            | To                          | On                                       |
| ------------------------------- | --------------------------- | ------------------------------------------ |
| a fact                          | `disputed`                  | `W5`, never here                          |
| `disputed`                      | resolved to the club's value | An operator keeps what the club had      |
| `disputed`                      | resolved to the player's     | An operator takes the player's answer    |
| the losing value                | retained                    | Always. Never deleted                     |

**A disputed fact is not a gate.** `R3-G` holds: it blocks nothing, and a person
can train, be selected and travel with a fact in dispute indefinitely.

## Handoffs

| To / from | What crosses                                                              |
| --------- | ---------------------------------------------------------------------------- |
| `W5`      | The dispute, with both values and both sources                              |
| `W6`      | The resolution, into the record and the activity log                        |
| `W8`      | A disputed fact is **not** outstanding and is not chased — a person already answered |
| Mission 5 | The person record, its history section, the merge, and the missing queue    |

## Dependencies and mission boundaries

| Seam                        | This mission's side                          | The other side                                  | Blocking?              |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------- | ------------------------ |
| Mission 5 · People & Roster | The disputed state and its resolution         | The record, the history, the merge, the queue   | Not blocking; shipped  |
| Mission 8 · Consent/Privacy | Consent precedence as a merge **mechanism**   | Correction and retention **policy**             | Not blocking           |

## Exceptions and recovery

- **The player changes their answer again while it is disputed.** The newer
  answer supersedes the waiting one; never more than one pending answer.
- **Both values are wrong.** The operator edits the field outright through the
  shipped path; the dispute closes as resolved by correction.
- **A disputed person is merged.** The dispute travels with the surviving
  record, because the fact does.
- **Nobody ever resolves it.** It stays disputed. No timeout decides it, and it
  never blocks anything.

## Safety, privacy, consent, and authority boundaries

- **Four-role only** to resolve.
- The player is never told which officer recorded the value they contested, and
  never sees the resolution note.
- **Date of birth** is resolvable but never displayed on any list or queue.
- Free text is four-role only and never reaches a report verbatim.
- A merge never manufactures consent that a person declined.

## Acceptance evidence

| Screen  | What it proves                                                                 |
| ------- | -------------------------------------------------------------------------------- |
| `W7-01` | A disputed fact on the person record: both values, both attributions, one control |
| `W7-02` | Afterwards — flag, correction and confirmation, each attributable, in the shipped history |

Shot on `/operate/people/[personId]`, a real implemented route, both sides,
measured 1280 and 375. `T07-merge-precedence` gets no screen: it is a write-time
rule, and its only surface is one more line in Mission 5's existing merge
comparison.

Grounding: **screenshots**.

## Core decisions

| Decision                                                        | Classification                  | Governing evidence or recommended default                                                                | Status   |
| --------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| The surface is the person record, not the roster record        | locked                          | The contestable facts are person facts, and already render there with their attribution                  | settled  |
| Both values are shown, with both attributions                  | locked                          | Boundary item 14; the `By` badge already ships                                                           | settled  |
| The losing value is retained, never deleted                    | locked                          | Append-only audit posture                                                                                | settled  |
| Flag, correction and confirmation stay separately attributable | locked                          | The frozen inventory's own wording for this workflow                                                     | settled  |
| A disputed fact gates nothing and is never chased               | locked                          | `R3-G`; the person has already answered                                                                  | settled  |
| Resolution is four-role                                        | locked                          | `T07-permissions`                                                                                        | settled  |
| **On a merge, the most restrictive consent state wins**        | **proposed for owner approval** | `season_messaging_consents` is unique per person per season, so a merge must choose. **Recommended: restrictive, not recent** — record-keeping must never manufacture permission a person declined | **open** |
| Whether resolving may carry a note                             | delegated to Mission Lead       | Free text either way, restricted either way                                                              | settled  |

## Brian approval

- Exact words:
- Date:
