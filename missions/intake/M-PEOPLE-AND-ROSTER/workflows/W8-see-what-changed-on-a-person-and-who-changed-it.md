# W8 — See what changed on a person and who changed it

- Purpose/intended outcome: an operator asks how a value came to be what it is,
  and gets an answer — what changed, from what, to what, when, and by whom.
- Primary actor: a four-role operator — President, Vice-President, Secretary,
  General Manager.
- Trigger: a number that used to work does not; somebody says they never gave
  that email; two operators disagree about who edited what; a merge looks wrong
  three months later.
- Entry point: **Full history** on the person record (`W1-05`) and on player
  detail (`W6`).
- Route/placement: `/operate/people/[personId]/history`. Neither the route nor
  its parent exists on `main`; nothing occupies the path.
- Controlling source: Task 08 §5 (the audit and history of changes sit on the
  record they describe); invariant M2 (every edit attributable and audited); the
  owner session of 2026-08-26 placing per-person history here rather than in
  Mission 3's general audit browser.
- User-visible result: the append-only history of one person, newest first,
  naming actor, date, field, the superseded value and the new one.

## Required actions

- List every recorded change to this person, newest first.
- Say, per entry: **what field, from what, to what, when, and who**. A history
  that says "record updated" answers nothing.
- Show the reason where one was recorded, which `W2` requires for a change to an
  existing value.
- Show a **merge as one event**, naming the record that was merged in and what
  moved, not as a scatter of field edits.
- Show a **superseded contact point** as what it is — the old value kept and
  dated, not deleted.
- Filter by field and by actor.
- Return to the record.

## State transitions

**None. This workflow is read-only and the history is append-only.** Nothing
here edits, hides or removes an entry. An entry cannot be corrected, only
followed by another.

## Handoffs

- To `W1` and `W6`, which is where it is reached from.
- To `W2` when reading the history tells the operator what to fix.
- To `W4`'s merge event when the entry is a merge.
- To Mission 3's general audit browser for anything that is not one person's
  history — cross-cutting queries, security review, retention.
- To Mission 8 when the question is a subject-access request rather than an
  operator's own curiosity.

## Dependencies and mission boundaries

- **This is per-person history, not the audit log.** It sits here because `W2`
  and `W4` both write it and this view is what makes them verifiable; the
  general browser stays Mission 3's. Brian, 2026-08-26.
- Seasonal changes — a membership status moving, an onboarding item resolving —
  belong to the season record and appear on player detail's own status history,
  not here. A person's history is the person's.
- Every writer is inside this mission: `W2` corrects, `W3` creates, `W4` merges.
  Nothing outside it writes a person fact, so the history is complete by
  construction rather than by best effort.
- The audit substrate exists on `main` as `audit_events`; this workflow reads it
  and adds the per-person view.

## Exceptions and recovery

- **A record with no history.** A person imported or created before this mission
  shipped shows an empty history and says so, rather than implying nothing ever
  changed.
- **An actor who no longer holds a seat.** Their name still appears. An audit
  trail that forgets who did something because they left is not an audit trail.
- **A merged-away person's history.** It moves to the survivor and stays
  attributed to the record it happened on, so the provenance of an imported row
  survives the merge.
- **A very long history.** Paged, newest first, with the filters doing the work.
- **An operator outside the four-role group.** The route refuses and exposes
  nothing, including the fact that entries exist.

## Safety, privacy, consent, and authority boundaries

- Four-role only.
- **A history shows old values**, including superseded phone numbers, emails and
  a previous date of birth. It is as disclosing as the record itself and is
  guarded identically.
- Emergency contact changes appear as changes to emergency contact; the values
  are shown under the same four-role restriction as the record, and the entry is
  out of leadership exports by default with the field it describes.
- Nothing here sends a message or records a lawful basis.
- **Append-only.** No entry can be edited or removed by any path in this
  mission, and none should be added by a later one without saying so.

## Acceptance evidence

Against seeded synthetic data, an operator can:

1. read a change and see **field, from, to, when and who** on one line;
2. see the **reason** on a change that required one, and none on a fill;
3. read a **merge as a single event** naming what was merged and what moved;
4. see a **superseded contact point** presented as kept-and-dated rather than
   deleted;
5. filter to **one field** across the whole history, and to **one actor**;
6. see an **empty history** stated as empty rather than implied;
7. find the history of a **merged-away record on the survivor**, still attributed
   to where it happened;
8. confirm an operator **outside the four-role group** is refused with no entries
   in the payload.

## Core decisions

| Decision                                                                | Classification                | Governing evidence or recommended default                                                                     | Status             |
| ----------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------ |
| Per-person history lives here, not in Mission 3's general audit browser | `locked`                      | Brian, 2026-08-26. `W2` and `W4` both write it and this is what makes them verifiable                         | Settled            |
| Every entry names field, before, after, when and who                    | `locked`                      | Task 07 §3; invariant M2                                                                                      | Settled            |
| A merge renders as one event, not a scatter of field edits              | `proposed for owner approval` | A merge read as forty corrections is unreadable and hides the decision that was actually made                 | Recommend as drawn |
| Append-only, with no edit or delete on any path                         | `locked`                      | Invariant M2                                                                                                  | Settled            |
| A departed actor's name still appears                                   | `proposed for owner approval` | An audit trail that forgets who did something is not one. The alternative pleases nobody and loses the answer | Recommend yes      |
| Seasonal changes are on player detail's status history, not here        | `locked`                      | The person-versus-season test                                                                                 | Settled            |
| Retention of history entries                                            | `delegated to Mission Lead`   | No source sets one; Mission 8 owns retention policy and this workflow stores rather than expires              | Deferred           |
| Page size and filter control placement                                  | `delegated to Mission Lead`   | No product meaning                                                                                            | Delegated          |

## Brian approval

- Exact words:
- Date:
