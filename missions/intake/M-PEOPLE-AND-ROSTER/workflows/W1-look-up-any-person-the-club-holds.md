# W1 — Look up any person the club holds

- Purpose/intended outcome: an operator finds any human connected to the club
  and reads what is known about them. Today this is impossible — no person route
  exists anywhere in the application, and a Person can only be reached through a
  membership or an operator seat.
- Primary actor: a four-role operator — President, Vice-President, Secretary,
  General Manager.
- Trigger: "who is this, and what do we have on them?" A coach names somebody at
  Monday review; a person rings the Secretary; a recruit turns up at training; an
  alumnus needs reaching.
- Entry point: **People** in the operate navigation, beside Roster.
- Route/placement: `/operate/people` for the list, `/operate/people/[personId]`
  for the record. Neither exists on `main`; nothing occupies the path.
- Controlling source: Task 08 §5 (People surface for non-players, approved with
  that brief) and §6 (authority); LAN-147 questions 1 and 6; the field inventory
  approved 2026-08-26.
- User-visible result: the person's durable record, showing what is known, what
  is `not recorded`, what is `disputed — awaiting verification`, and how
  confident each value is.

## Required actions

**The list.**

- Show every person with a **tie to the season in view**: a season membership in
  any status, a prospect record, a season-scoped role assignment, or a
  committee-year role in the committee year **paired with** that season.
- Search by first name, last name, or alias — including an alias that is not the
  person's display name.
- Sort on every column that can be meaningfully ordered.
- Filter thinly: standing, and missing required data. The roster is the surface
  that carries the full filter set; People is for finding one human.
- Widen to **everyone the club has ever held**, deliberately and reversibly.
  This is the rare path, not a mode the surface sits in — Brian expects it
  perhaps once in a while and mostly from the General Manager.
- Open a person.

**The record.** The thirteen durable person facts from the approved field
inventory, plus:

- aliases, with the display name identified;
- standing on the pipeline ladder, read-only;
- role assignments covering any season, read-only;
- alumni standing, derived, with its operator override visible as an override —
  **the derivation already exists** as the `person_standing` view, which
  computes live-membership counts and honours `past_member_override`; this
  workflow surfaces it rather than inventing it;
- the under-18 flag where date of birth is recorded;
- a list of the person's season records, each linking to its player detail;
- the change history for this record (`W8`).

Every field displays its **source/confidence class** — player-provided,
operator-confirmed, externally verified, derived — so unequal information never
looks equal.

## State transitions

**None. This workflow is read-only.** It writes nothing and changes nothing.
Correction is `W2`, merging is `W4`, and adding is `W3`.

## Handoffs

- To `W2` when a value is wrong or missing.
- To `W4` when the person on screen turns out to be a duplicate of another.
- To `W6` when the operator opens one of the person's season records.
- To `W8` when the question is how a value came to be what it is.
- To Mission 1's operator administration when the question is about a login or a
  club role, neither of which this surface grants or edits.

## Dependencies and mission boundaries

- **Season scoping is the shape, not a default.** Brian, 2026-08-26: _"the only
  people that should show up within that season are the people that only have
  records or ties for that particular season… When I go to the people record,
  I'm not seeing every person ever."_ The **person record is season-agnostic**;
  its **appearance in the list** requires a tie. This is the same
  person-versus-season test applied to a surface rather than a field.
- **A committee year is paired to one season, deliberately, and dates do not
  enter into it.** Brian, 2026-08-26: _"AGM 2026-2027 is only ever associated
  with that season… If AGM happens in fucking November of 2026 for the 2027
  year, they can sit there, but it has no bearing on the current season at
  all."_ The four-role group holds committee-year roles, not season roles, so
  without this rule the people who run the club appear in no season's list.
  Nothing in the schema pairs the two cycles and no schema change is made: the
  pairing is derived from the shared label, refusing rather than guessing when
  no counterpart exists. Accepted as technical debt, in Brian's words _"that's
  fucking technical debt. We'll live with that."_ Date overlap was considered
  and rejected — an AGM that drifts into another season does not drag its
  committee into that season's records.
- Prospect standing renders read-only; every stage transition, the recruits list
  and the notes are Mission 6's.
- **On WhatsApp** and consent state do not render at this mission's acceptance —
  no substrate exists on `main`. Their absence is by design.
- The subject-access export action Task 07 §3 places on this surface is Mission
  8's to build and does not render here.
- Role assignments render read-only. Granting a role or a login stays Mission 1's.
- Seasonal facts — the ladder position, milestones, positions, jersey,
  onboarding, formalwear, Blues, eligibility, participation — are **not on this
  page**. They live on player detail, keyed to a membership. A person with four
  seasons has one person record and four season records.

## Exceptions and recovery

- **Nothing found.** An empty result says so plainly and offers the widen-to-all
  action, because the commonest cause is that the person belongs to another
  season.
- **A person who is almost nothing.** First name and a phone and no more — the
  legacy record the source data says is 26% of the club. It renders as a real
  record with `not recorded` stated on each absent field, never as an error and
  never with a defaulted value.
- **A person with no tie to any season.** Task 08 §2 permits an unassigned
  Person — a potential coach, an outside contact. They appear in no season's
  list and are reachable only through the widened view or a direct link.
  Recorded as a known consequence of season scoping, not a defect.
- **A merged-away duplicate.** Never listed and never offered. The shipped
  matching already excludes them, for the reason `roster.ts` gives: offering one
  invites an operator to resurrect a record the club has already decided is a
  duplicate. Reaching its id directly redirects to the surviving record.
- **An operator outside the four-role group.** The refusal names the capability
  required and exposes nothing. The data is absent from the DOM and the payload,
  not hidden in it (LAN-75 contract).

## Safety, privacy, consent, and authority boundaries

- Four-role only, for both the list and the record.
- Anything the viewer's role does not grant is absent from the DOM and payload.
- Emergency contact is visible here and locked down structurally: never a Person
  row, never a contact point, never reachable by any audience or messaging
  machinery, out of leadership exports by default.
- Date of birth and emergency contact are four-role only and never appear on any
  list.
- Nothing on this surface sends a message, records a lawful basis, or offers a
  channel action beyond the voice call Task 08 §5 permits.
- The duplicate-check disclosure rule applies to search as it does to matching:
  a search discloses names and contact details of people who are not its
  subject, which is why the capability is asserted on the query, not the screen.

## Acceptance evidence

Against seeded synthetic data, an operator can:

1. find a **coach who holds no membership**, from the coach's own name;
2. find a **first-name-only legacy person**, and see every absent field stated
   as `not recorded` rather than blank or defaulted;
3. find somebody by an **alias that is not their display name**;
4. open a **recruit** and see their standing, without any funnel control;
5. confirm a **merged-away duplicate** appears nowhere and its direct link
   lands on the survivor;
6. confirm the list holds **only people tied to the season in view**, and that
   widening reveals the others;
7. confirm an operator **outside the four-role group** is refused, with no
   person data in the response payload;
8. read every field's **source/confidence class** on the record.

## Core decisions

| Decision                                                                                                     | Classification                | Governing evidence or recommended default                                                                                                        | Status                |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| People is scoped to the season in view; the person record itself is season-agnostic                          | `locked`                      | Brian, 2026-08-26                                                                                                                                | Settled               |
| Routes `/operate/people` and `/operate/people/[personId]`                                                    | `locked`                      | Brian, 2026-08-26 — "as far as the routes, they make sense"                                                                                      | Settled               |
| List columns: name (alias-aware) · standing · what they are to the club · contactability · missing-data flag | `proposed for owner approval` | Task 08 §5 specifies search and nothing else for People. Brian approved the set in principle and asked to see it rendered                        | Confirm at the mockup |
| Default view is the current season; widening is deliberate and reversible                                    | `locked`                      | Brian, 2026-08-26                                                                                                                                | Settled               |
| Filters stay thin — standing and missing-required-data only; sorting is aggressive                           | `locked`                      | Brian, 2026-08-26 — "keep the filter thin for now… we should be able to sort aggressively"                                                       | Settled               |
| A committee-year role counts as a tie to the seasons its period overlaps                                     | `proposed for owner approval` | `role_assignments` scopes a role to a committee year **or** a season, never both. Without this rule committee members appear in no season's list | Recommend yes         |
| No season picker; the surface follows the current season as the roster does                                  | `proposed for owner approval` | Choosing an arbitrary season is season-lifecycle work and belongs to Mission 11                                                                  | Recommend deferring   |
| Four-role only; unauthorised data absent from DOM and payload                                                | `locked`                      | Task 08 §6; LAN-75 contract; supersedes LAN-146 A2                                                                                               | Settled               |
| Merged-away people are never listed and never offered                                                        | `locked`                      | Invariant I6; the shipped matching already excludes them                                                                                         | Settled               |
| Seasonal facts are absent from person detail and live on player detail                                       | `locked`                      | The approved field inventory                                                                                                                     | Settled               |
| Prospect standing renders read-only                                                                          | `locked`                      | Brian, 2026-08-26; every transition is Mission 6's                                                                                               | Settled               |
| Query shape, indexing and pagination                                                                         | `delegated to Mission Lead`   | No product meaning; the club holds hundreds of people, not millions                                                                              | Delegated             |

## Brian approval

- Exact words: "Okay, here you go. I approve."
- Date: 2026-08-26
- By: Brian Schuster

Specification approved. Mockups not yet built or approved.

Approved after two rulings recorded above: a committee year pairs to the season
sharing its label and dates are irrelevant, and there is no season picker
anywhere in the application. One decision remains `proposed` by design — the
list columns, which Brian approved in principle and asked to judge rendered.

## Mockup review — round one, 2026-08-26

Brian reviewed the ten screens. Nothing below overwrites the approved
specification above; it records what his review decided and what it superseded.

### Decided, and applied to the mockups

| Decision                                                                                                           | His words                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| People is an **Administration** destination, not a fourth entry beside Roster                                      | "People should be considered an administrative task. It's not something that falls into the top left."                                                 |
| An operator outside the four-role group never sees the entry; the server guard behind it is unchanged              | "If you're an operator outside the four roles, you just never see this page. It's just something that never pops up for you."                          |
| The widen action is **See people outside this season**                                                             | "We need a more clear way of saying see people outside of the season… Everyone the club has ever held is a weird language there."                      |
| **No narrative text in any surface.** Labels, values and states, plus the sentence an empty or refusal state needs | "The narrative text is I hate it. Every place I see it, I fucking hate it. The UI shouldn't have narrative text anywhere."                             |
| The four source-and-confidence labels are replaced by who supplied the value, and a `Verified` mark                | "We don't need the labels. However, I like seeing if it's externally verified versus not… Who provided the detail would be important: who did it?"     |
| A coach is part of the season. `No membership` is struck; standing is empty and the role names the tie             | "If a person gets added as a coach, they are part of this season. They are a member of this season. They're just not a player… I don't see the error." |
| The `Open →` control on each season row is struck; the season label is the link and carries its own standing       | "I don't know what 'open' means… it's not clear to me what that 'open' button does."                                                                   |
| The record's layout stands for now                                                                                 | "I don't like the record as it sits here. We'll keep it as is for now. The people record shouldn't be used that often, so I think that's fine."        |
| `W1-02` is accepted as it stands                                                                                   | "The W1-02 is fine."                                                                                                                                   |

### Superseded by this review

**`disputed — awaiting verification` is struck from this surface.** Brian,
2026-08-26: _"There shouldn't be a dispute here. It should just see the latest
record… They're the operator. Nothing goes higher than the operator."_ The field
shows the current value and who set it. This supersedes Task 08 §6's contested-value
rule and the matching sentence in `01-overview.md`'s cross-cutting invariants,
both of which predate it. Neither is overwritten; both need a dated amendment.

**The recruitment facts leave the person record.** Brian, 2026-08-26: _"There's
nothing on here related to recruits. There should be nothing here related to the
recruit process. It's a person record."_ Source, first contact, committed and
conversion were `display` on person detail in the approved field inventory and
are now absent from this surface entirely; they are Mission 6's, on Mission 6's
surface. The **standing** survives, because that is what the person is, and no
control on the page moves it. `field-inventory.md` needs the dated amendment.

### Still open after round one

- **The list columns.** Unchanged since the specification: approved in principle,
  to be judged rendered. `W1-01`'s table head.
- **Widen-to-everyone: four-role or General-Manager-only.** Unchanged.
- **Whether `W1-04` shows only the people outside the season, or one list of
  everybody.** Drawn as outside-only, which is the literal reading of his words.
- **Whether `W1-08` still earns a screen** now that the recruitment block is gone.
- **One garbled dictation line** — "The player, certainly, the change to see what
  it is shouldn't be here" — is unresolved and awaiting his restatement.
