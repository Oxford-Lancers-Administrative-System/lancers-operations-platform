# Frozen workflow inventory — M-PEOPLE-AND-ROSTER

Definition: one primary actor's end-to-end journey from trigger and entry point to
one user-visible result.

Eight workflows. Every actor is a four-role operator — President, Vice-President,
Secretary or General Manager — because Task 08 §6 restricts every surface in this
mission to that group and this mission builds nothing player-facing.

1. `W1` — **Look up any person the club holds**: an operator needs to find a
   human — a coach, a committee member, an unconverted prospect, an alumnus, a
   player — and read what the club knows about them → the People list, searched
   by name, known-as or alias, and that person's record showing every durable
   field with its provenance class, with `not recorded` stated explicitly and
   anything their role does not grant absent rather than hidden.
2. `W2` — **Correct a person's record**: an operator learns a value is wrong or
   missing → the corrected record, attributed and audited, with contact values
   superseded rather than overwritten and a contested value flagged
   `disputed — awaiting verification` against the operator's recorded reason.
3. `W3` — **Add or link a person who holds no membership**: a coach, committee
   member or outside contact needs a record → a Person exists, either newly
   minted or linked to the existing record the duplicate check surfaced, never
   silently created and never silently merged.
4. `W4` — **Merge two records for the same human**: an operator finds the same
   person twice → one surviving record with both identities preserved, every
   reference re-pointed, and the merge audited with its reason.
5. `W5` — **Work this season's roster**: an operator needs to see and act across
   the squad → the wide command surface with the approved column set, combinable
   filters, sortable columns, search, and missing-data flags — replacing the four
   columns the vertical slice shipped.
6. `W6` — **Open one player's record**: an operator needs everything about one
   player → the authoritative individual view carrying identity, dated contacts,
   channel presence, academics, restricted fields, membership state and full
   status history, onboarding items with their per-item provenance, football
   assignments, availability, eligibility, kit, Blues counts, and this season's
   participation history — with the shipped activation control preserved.
7. `W7` — **Work the missing-data queue**: an operator needs to know who is
   incomplete and in what → a real, filterable list of people with required facts
   `not recorded` or `disputed`, per-field indicators, and the roster flag that
   leads into it.
8. `W8` — **See what changed on a person and who changed it**: an operator needs
   to know how a value came to be what it is → the append-only change history on
   the record it describes, naming actor, date and the superseded value.

## Excluded stages and invariants

**Excluded stages.** No journey in this mission composes, schedules, sends or
transports a message; records or reads a consent basis; imports anything; creates
a season; assigns a club role or an operator seat; deletes or erases a person;
advances a recruitment funnel; changes an onboarding item's behaviour; or lets a
person edit their own record. Each has a named owner in `00-boundary.md`.

**No workflow for the phone.** Mobile is a viewport, not a journey. Task 08 §5's
condensed roster is how `W5` and `W6` render at 375px, and every mockup carries
both frames, so a separate mobile workflow would double-count the same journey.

**Invariants binding every workflow** — stated once in `01-overview.md`, not
restated per workflow: the four-role privacy boundary and absent-not-hidden
rendering; the person-versus-season test; the frozen state vocabulary with
`not recorded` never defaulted; attribution and audit on every edit, with
contact values superseding rather than overwriting; nothing sent and no lawful
basis recorded; and a field rendered only where its substrate exists on `main`.

## Decision coverage

137 decisions across 12 sources carry exactly one disposition each, recorded in
`state.json.decision_coverage` and rendered to `decision-coverage.md` once this
inventory is frozen. 53 land on a workflow above; 52 belong to another mission;
24 are deliberately shared with their other owners named; 4 are excluded on their
source's own evidence; 3 are superseded with the dated approval that superseded
them; 1 is delegated to the Mission Lead.

Three of those deserve naming here because they are the seams most likely to be
re-argued later:

- **The queue and the chase.** Task 11 §1 states the division outright — Task 08
  defined the missing-data state and queue, Task 11 defines the chase — and §7
  consumes this queue rather than redefining it. `W7` builds the queue; every
  request, cadence and per-fact `refused` state is Mission 7's.
- **The duplicate check.** Task 09 D7 locks dedup-before-create at every door.
  `W3` and `W4` build the matching and merge machinery and apply it on this
  mission's own path; Mission 6 wires its four doors to it and decides per-door
  behaviour, including the recorded walk-up drift.
- **Correction versus rights.** Task 07 §3 places operator-executable correction
  on the person surface with actor, before/after and reason audited. `W2` builds
  that; the rights-based request intake, erasure and subject-access export stay
  with Mission 8.

## Inventory amendments

None.

## Brian approval

- Exact approved list/count: eight workflows, `W1`–`W8`, in the order and under
  the names listed above — W1 Look up any person the club holds · W2 Correct a
  person's record · W3 Add or link a person who holds no membership · W4 Merge
  two records for the same human · W5 Work this season's roster · W6 Open one
  player's record · W7 Work the missing-data queue · W8 See what changed on a
  person and who changed it.
- Exact words: "Okay, I think this is good."
- Date: 2026-08-26
- By: Brian Schuster

Approved after Brian tested the count in both directions — why not six, why not
twelve — and after two clarifications recorded during that review:

- **W3 is not a correction of Mission 1.** The operator invitation path already
  performs a duplicate-checked create-or-link matching on given name, family
  name, known-as, aliases, login email and phone, and so does the returner
  intake through `roster.ts`; the code records that duplication as deliberate,
  each door checking the fact that decides whether it may proceed. W3 is a third
  door for a person who has neither a membership nor a login, reusing the same
  matching rule. Mission 1's surface is untouched. Whether the three
  implementations are later consolidated is implementation detail.
- **W8 covers the audit log** and stays separate because W2 and W4 both write
  history and the history view is what makes them verifiable.

One structural addition agreed in the same exchange: because W1, W5 and W6 all
read the same field inventory, all 27 rows are dispositioned **once**, in a
single table approved before W1's specification, rather than three times inside
three specs.
