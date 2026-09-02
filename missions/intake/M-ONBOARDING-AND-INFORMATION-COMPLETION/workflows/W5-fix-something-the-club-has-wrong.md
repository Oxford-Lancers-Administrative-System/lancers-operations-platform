# W5 — Fix something the club has wrong

- Purpose/intended outcome: The club holds a fact about a player that is wrong,
  or stale, or that the player would rather not give at all. **This workflow is
  the club's entire answer to self-service**, because there are no player
  logins: the same link they already hold, opened whenever they like, with every
  fact about them editable — and a rule that nothing they type ever silently
  overwrites something the club confirmed.
- Primary actor: **The player**, alone and unprompted.
- Trigger: two, and they are different in kind.
  1. **They open their link outside the welcome moment.** Nobody asked; their
     number changed, or they moved college, or they noticed a typo.
  2. **A targeted ask arrives** (`M6`) — the club doubts one fact and asks about
     exactly that fact, never the whole form, and only when nothing else is open.
- Entry point: the same signed link `W4` established. No login, no navigation,
  no second credential.
- Route/placement: `/me/[token]/details`, the page `W4` built, in its
  **returning** state; and a one-fact variant for the targeted ask.
- Controlling source: `S33`, `S34`; owned `M6`, `T11-refused`,
  `T11-provenance`; cited `T11-states` (`W4`), and boundary item 14. Resolution
  of anything disputed is `W7`'s.
- User-visible result: the correction is recorded as theirs; or the
  disagreement is raised for a human and the player is told so plainly; or the
  fact is marked refused and stops being chased.

## Why this workflow exists at all

Mission 5 shipped the operator correction path — `/operate/people/[personId]/edit`
— and accepted it **explicitly as the interim answer** until a person could fix
their own record (`OS-self-service-to-m7`). Its missing-data queue has, today,
nothing that acts on it from the player's side. This is that side.

## Current `main` grounding

- Baseline `main@332bc6b`. **No player-facing correction path exists.** The
  operator one does, at `/operate/people/[personId]/edit`, with
  `person-write.ts` behind it.
- Nearest implemented shell, and the one every screen is shot on: `/a/[token]`,
  as for `W4`. Same reasoning, same rules.

### Provenance already exists, and it is derived

This is the load-bearing discovery, and it is the second time this mission has
found the substrate already built. **`person-record.ts` already answers "who
supplied this value"** for the seven fields that have no `source` column:

> "Brian's walkthrough of LAN-184 chose to derive 'who supplied it' for these
> seven from `audit_events` instead of adding one: the most recent
> `person_<field>_updated` row this module finds naming the person is who
> supplied the value currently on file."

`readFieldProvenanceIn` returns a `<field>Source` per field — a display name, or
**`null` for a field never changed through the application**: seeded, imported,
or set at `person_created`, which names no single field and is deliberately not
treated as attributing one.

| Fact                                    | Where its provenance already lives                          |
| --------------------------------------- | ------------------------------------------------------------- |
| The seven `people` columns              | derived from `audit_events`, via `readFieldProvenanceIn`      |
| Mobile, personal email                  | `contact_points.source`                                       |
| Emergency contact                       | `person_emergency_contacts.recorded_by_person_id`             |

**So this workflow adds no provenance columns.** It adds the *ranking*, and the
`disputed` state itself — which Mission 5 deliberately did not ship. Its own
words, `REQ-no-disputed` and `REQ-no-verification-mark`: "There is no contested-
value field, no verification-mark field and no confidence class anywhere below —
not struck out, never added." That was a seam left for this mission, and this is
the workflow that fills it.

## The ranking, stated exactly

Boundary item 14: a player's answer never silently overwrites an
operator-confirmed, externally verified or derived value; it raises
`disputed — awaiting verification`. What that means, case by case, against
provenance the application can actually compute:

| What the current value is                                                  | What a differing player answer does                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Supplied by the player themselves** — the source is the subject           | **Replaces it.** They are correcting their own earlier statement       |
| **Supplied by an operator** — the source is a named person who is not them  | **Raises `disputed — awaiting verification`.** The old value stands until `W7` resolves it |
| **Externally verified or derived** — a verify-class item, or the under-18 flag | **Raises `disputed`.** The player never edits a derived value directly |
| **Unattributed** — `null` source: seeded, imported, or set at `person_created` | **Replaces it**, and records the player as the source                  |

**The fourth row is the one that needs arguing, and it is proposed rather than
assumed.** `readFieldProvenanceIn` returns `null` for a value nobody set through
the application — which is exactly what a `W1` import produces. The
recommendation is that the player wins there, for two reasons: nobody
attributable ever asserted the old value, so a named player's statement about
themselves is strictly better provenance than an unattributed one; and `W1`
already decided the same thing from the other end — "a carried-forward person's
own facts are never overwritten by the file. A difference becomes something the
player confirms on the form, not a silent update."

**Raising a dispute never destroys the player's answer.** Both values are kept:
the club's, still standing, and the player's, waiting. `W7` chooses.

## Refusal, and the collision with W4's required set

`T11-refused`: refusal is **per fact**. The player says, in effect, "I would
rather not give you this." The chase for that fact stops and stops counting, the
fact stays visible on the record, and **reopening is a human act** — the machine
never revives it.

**This collides with `W4`, which is approved.** `W4` makes ten fields required
and blocks the form until they are filled. If refusal only exists here, then a
player who genuinely cannot or will not give a date of birth is **trapped at step
1 forever** and can never reach the Code of Conduct, the photo release or
anything behind them. That is not what "blocked from going" was meant to buy.

**Proposed amendment to `W4`, for Brian's approval:** refusal is available
wherever a fact is asked, `W4` included. "Required" then means **answer it or
refuse it, explicitly** — which still blocks silently skipping a field, still
satisfies the direction of 2026-09-02, and never traps anybody behind a fact
they will not give. A refusal is visible, uncounted, unchased, and waits for a
human.

If Brian would rather `W4` stay strictly as approved, the alternative is that a
blocked player contacts the club and an operator records the refusal for them —
which works, costs a phone call, and puts the club back in the business of doing
by hand the thing this mission exists to stop.

## Required actions

1. **Open the link, unprompted.** The ask is not `invited`; there may be no open
   ask at all. Opening one that has nothing outstanding is `already-complete` —
   which is `W4`'s screen, and from it the player can still choose to edit.
2. **Change a value.** What happens next depends on the ranking above, and the
   player is told which of the two it was **before** they submit, not after.
3. **Decline a value** — "I would rather not say" — per fact, with an optional
   reason. The ask records `refused` for that fact.
4. **Submit.** The ask moves to `corrected`.
5. **Or answer a targeted ask** (`M6`): one fact, its own page, nothing else on
   it, and no way to wander into the rest of the form from it.

**Read-back applies** on any mobile changed here, exactly as at first capture.

## State transitions

| From                | To                | On                                                              |
| ------------------- | ----------------- | ----------------------------------------------------------------- |
| `submitted`         | `opened`          | They return through the same link                                |
| `opened`            | `corrected`       | They change an already-confirmed value and submit                |
| per fact            | `refused`         | They decline that fact                                           |
| `refused`           | outstanding again | **A human reopens it.** Never the machine, never a new season alone |
| a fact              | `disputed`        | Their answer differs from an operator-confirmed or derived value |
| `disputed`          | resolved          | **`W7`**, not here                                               |

Consent is untouched by all of this: `OD7-oneway-tick` means this page cannot
untick it, however many times it is opened.

## Handoffs

| To        | What crosses                                                                    |
| --------- | --------------------------------------------------------------------------------- |
| `W7`      | Every `disputed` fact, with both values, both sources and both dates              |
| `W6`      | Every correction and refusal, into the record and the sectioned activity log      |
| `W8`      | A refused fact stops being chased and stops counting toward the queue's ranking   |
| Mission 5 | The corrected values themselves, and its missing-data queue, which this feeds     |
| `W4`      | The page itself. This workflow is its returning state, not a second surface       |

## Dependencies and mission boundaries

| Seam                        | This mission's side                                       | The other side                                  | Blocking?                    |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------- | ------------------------------ |
| Mission 5 · People & Roster | The `disputed` state, the ranking, the refusal            | The person record, the edit path, the queue     | Not blocking; all shipped    |
| Mission 8 · Consent/Privacy | Capture mechanics only                                    | Correction *policy*, subject-access, erasure    | Not blocking                 |
| `W7`                        | Raising the dispute and keeping both values               | Resolving it                                    | Independently walkable       |

**Correction *policy* is Mission 8's, and this is only the mechanism.** What a
person is entitled to have corrected, and in what time, is policy; that a person
can say "this is wrong" and be heard is mechanism.

## Exceptions and recovery

- **They change nothing and submit.** Nothing is recorded, the ask does not move
  to `corrected`, and no activity-log noise is generated.
- **They refuse a fact they previously gave.** The old value is retained — the
  audit posture is append-only and a superseded value is never overwritten — and
  the fact stops being chased.
- **They dispute a fact already disputed.** The newer answer supersedes the
  waiting one; there is never more than one pending player answer per fact.
- **A targeted ask arrives while something else is open.** It does not: `M6` is
  permitted only when nothing else is open, so the compiled ask always wins.
- **The link is dead.** `W4`'s uniform page, unchanged.
- **They are under 18.** The flag stops the club messaging them at all, so no
  targeted ask ever reaches them; the link they hold still works.

## Safety, privacy, consent, and authority boundaries

- **No login, and no new credential.** The same season-scoped signed link.
- **Free text is restricted.** A refusal reason or a correction note is
  four-role-group only and never reaches a report verbatim.
- **A player never sees another person's anything**, including who at the club
  supplied a value they are disputing. They are told *the club* recorded it, not
  which officer.
- **Date of birth stays restricted** when corrected, exactly as when captured.
- **Nothing here can grant, change or remove consent.**

## Acceptance evidence

| Screen  | What it proves                                                                     |
| ------- | ------------------------------------------------------------------------------------ |
| `W5-01` | The record opened later, unprompted: every fact editable, and who supplied each     |
| `W5-02` | Changing something the club confirmed — what the player is told, before submitting  |
| `W5-03` | Declining to give a value, per fact                                                 |
| `W5-04` | The targeted ask: one fact, its own page, no way into the rest of the form          |

Grounding: **screenshots**, on the `/a/[token]` shell, both sides, 1280 and 375.

## Core decisions

| Decision                                                                     | Classification                  | Governing evidence or recommended default                                                                                              | Status   |
| ---------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| This is the same page and the same link as `W4`, in its returning state      | locked                          | No player logins; one credential per person per season                                                                                 | settled  |
| Provenance is the derived one Mission 5 already built, not new columns       | locked                          | `readFieldProvenanceIn`, and Brian's own LAN-184 walkthrough choice (`Q-13`)                                                            | settled  |
| A player's answer never silently overwrites an operator-confirmed value      | locked                          | Boundary item 14                                                                                                                       | settled  |
| The player is told which of the two will happen **before** they submit       | locked                          | A correction that silently becomes a dispute is a correction the player thinks they made                                               | settled  |
| Both values are kept when a fact is disputed                                 | locked                          | Append-only audit posture; `W7` needs both to resolve                                                                                  | settled  |
| Refusal is per fact, stops the chase, and only a human reopens it            | locked                          | `T11-refused`                                                                                                                          | settled  |
| Resolution of a disputed fact is `W7`'s, not this workflow's                 | locked                          | Boundary; `W7` is the resolution surface                                                                                               | settled  |
| **An unattributed value can be replaced by the player**                      | **proposed for owner approval** | `readFieldProvenanceIn` returns `null` for seeded and imported values. Nobody attributable asserted them, and `W1` already refuses to let the file overwrite a person's own facts. **Recommended** | **open** |
| **Refusal is available wherever a fact is asked, `W4` included**             | **proposed for owner approval** | Otherwise a player who will not give one required fact is trapped at `W4` step 1 forever. "Required" becomes *answer or refuse, explicitly*. **Recommended — and it amends an approved workflow, so it needs Brian's word** | **open** |
| Whether a refusal may carry a reason, and whether it is optional             | delegated to Mission Lead       | Free text either way, restricted either way                                                                                            | settled  |
| How the targeted ask names the one fact it wants                             | delegated to Mission Lead       | `M6` fixes that it is one fact; the wording is presentation                                                                            | settled  |

## Brian approval

- Exact words:
- Date:
