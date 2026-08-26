# W2 — Correct a person's record

- Purpose/intended outcome: an operator learns that something the club holds
  about a person is wrong, missing or out of date, and fixes it — attributably,
  audibly, and without destroying what was there before.
- Primary actor: a four-role operator — President, Vice-President, Secretary,
  General Manager.
- Trigger: somebody changes their number; a name was mis-keyed at a sign-up
  table; the missing-data queue says seven facts are absent; a graduate's college
  address stops working.
- Entry point: **Correct this record** on the person record (`W1-05`), and every
  row of the missing-data queue (`W7`).
- Route/placement: `/operate/people/[personId]/edit`. Neither the route nor its
  parent exists on `main`; nothing occupies the path.
- Controlling source: Task 08 §4 (the field inventory), §6 (the authority
  matrix); Task 07 §3 (operator-executable correction with actor, before/after
  and reason audited); LAN-147 questions 1, 4 and 5; the field inventory approved
  2026-08-26 and amended the same day.
- User-visible result: the record now says the right thing, the change is on the
  person's history with a name and a date against it, and no previous contact
  value has been destroyed.

## Required actions

- Edit every durable person fact the field inventory marks `build`: first name,
  last name, aliases, the two email kinds, mobile, the four academic fields,
  date of birth, and the five emergency-contact fields.
- **One edit surface, sectioned exactly as the record reads** — who they are,
  how to reach them, academic, restricted. An operator who has just looked at a
  section corrects it without learning a second layout.
- **Contact values supersede rather than overwrite.** Replacing a mobile or an
  email keeps the previous value, dated, with the new one preferred. One
  preferred value per kind.
- **Every other field overwrites**, because a corrected date of birth is not a
  second date of birth. The previous value survives in the change history, which
  is what makes it recoverable.
- Fill a field that reads `not recorded` without a reason. **Change a field that
  already has a value only with a reason**, recorded and shown on the history.
- Flag an alias as the display name, add an alias, and remove one.
- Return to where the operator came from — the record, or the next row of the
  queue.

## State transitions

- A person fact goes from `not recorded` to a value, or from one value to
  another. Nothing else on the person moves.
- A contact point goes from preferred to superseded, and a new one becomes
  preferred. The superseded row is never deleted.
- Every save appends one audit event: actor, timestamp, field, before, after,
  and the reason where one was required.
- **No membership, prospect, role or seat state changes here.** Correcting a
  person never moves them on the ladder.

## Handoffs

- To `W1` on save, or to `W7` when the operator arrived from the queue.
- To `W4` when the reason a value looks wrong is that this is the same human
  twice.
- To `W8` when the question is what the value used to be.
- To Mission 1 when the correction wanted is to a login or a club role.
- To Mission 7 when the correction is a person editing their own record through
  the signed link — that path is theirs and does not exist here.
- To Mission 8 when the request is erasure or a subject-access export rather
  than a correction.

## Dependencies and mission boundaries

- **The two email kinds need a migration.** `contact_point_kind` on `main` is
  `('email','phone')`; college and personal email are distinct dated kinds and
  this mission carries the split.
- The five emergency-contact fields do not exist on `main` at all and are built
  here, under the structural lockdown `01-overview.md` makes an invariant.
- Consent state and channel presence are not editable here because they do not
  exist on `main`; they are Missions 8 and 6.
- Seasonal facts — jersey, positions, onboarding items, formalwear, Blues,
  eligibility — are corrected on player detail, not here. A person with four
  seasons has one person record and four season records.
- Recruitment facts are Mission 6's and are absent from this surface entirely,
  which follows `W1`'s round-one decision that the recruit process appears
  nowhere on a person record.

## Exceptions and recovery

- **A value that two people disagree about.** The operator enters what they
  believe is right and records the reason. There is no held state and no queue
  for it. Brian, 2026-08-26: _"There shouldn't be a dispute here. It should just
  see the latest record… They're the operator. Nothing goes higher than the
  operator."_ **This supersedes Task 08 §6's contested-value rule, the matching
  invariant in `01-overview.md`, and this workflow's own line in the frozen
  inventory**, all of which predate it.
- **A phone number that will not normalise.** The raw value is preserved
  alongside the E.164 form, and the operator sees the normalised value read back
  before saving. An unparseable number is saved raw and flagged in the queue.
- **An email that already belongs to another person.** The save is refused and
  the duplicate check offers `W4`, because two records sharing a contact point
  is the commonest signal of the same human twice.
- **A concurrent edit.** The second save is refused with what changed underneath
  it, rather than silently winning. Nothing about a person is important enough
  to lose to a race.
- **An operator outside the four-role group.** They never reach this route: the
  destination is absent from their navigation and the action refuses on the
  query, exposing nothing.

## Safety, privacy, consent, and authority boundaries

- Four-role only, for every field.
- Emergency contact is third-party personal data. It is never a Person row,
  never a contact point, never reachable by any audience or messaging machinery,
  and out of leadership exports by default.
- Date of birth and emergency contact are four-role only and never appear on any
  list.
- Nothing here sends a message, records a lawful basis, or offers a channel
  action.
- No field on this surface is destructive. Removing an alias hides it from
  display and keeps it as dedupe evidence; there is no delete for a person.
- Every edit is attributable and audited — invariant M2, and Task 07 §3's actor,
  before, after and reason.

## Acceptance evidence

Against seeded synthetic data, an operator can:

1. fill a first-name-only legacy record's **last name** and watch its
   missing-data count fall;
2. **change a mobile number**, be shown the normalised value before saving, and
   find the previous number still present and dated;
3. **change a personal email** and be required to give a reason, where filling
   an empty one required none;
4. **add an alias and flag it as the display name**, and see the list's name
   column follow it;
5. be **refused** when saving an email that already belongs to another person,
   and be offered the merge;
6. be **refused** a concurrent save, and be told what moved underneath them;
7. read the whole edit back on the person's history with their own name against
   it;
8. confirm that nothing they did moved the person on the ladder.

## Core decisions

| Decision                                                                                        | Classification                | Governing evidence or recommended default                                                                                                                     | Status                      |
| ----------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `disputed — awaiting verification` is struck; the record shows the current value and who set it | `locked`                      | Brian, 2026-08-26. Supersedes Task 08 §6, `01-overview.md`'s invariant, and this workflow's frozen-inventory line                                             | Settled, amendments pending |
| One edit surface at `/operate/people/[personId]/edit`, sectioned as the record reads            | `proposed for owner approval` | The alternative is editing each field in place on the record. One surface is fewer moving parts and one audit boundary; in-place is fewer clicks for one typo | Recommend one surface       |
| A reason is required to change an existing value, and never to fill an empty one                | `proposed for owner approval` | Task 07 §3 requires a reason audited. Demanding one to fill a blank would make the missing-data queue miserable to work                                       | Recommend as drawn          |
| Contact values supersede; every other field overwrites, with the previous value in the history  | `locked`                      | Task 08 §4                                                                                                                                                    | Settled                     |
| An email already held by another person refuses the save and offers the merge                   | `proposed for owner approval` | Task 09 D7 locks dedup-before-create at every door; this is the same rule on the correction path                                                              | Recommend yes               |
| A concurrent edit refuses rather than wins                                                      | `proposed for owner approval` | Nothing here is high-frequency enough to justify last-write-wins                                                                                              | Recommend yes               |
| Emergency contact is edited here and locked down structurally                                   | `locked`                      | Task 08 §4 and §6                                                                                                                                             | Settled                     |
| The college/personal email split is a migration this mission carries                            | `locked`                      | `contact_point_kind` on `main` is `('email','phone')`                                                                                                         | Settled                     |
| Field-level permissioning within the four-role group                                            | `delegated to Mission Lead`   | Task 08 §6 grants the group uniformly; no source splits it further                                                                                            | Delegated                   |
| Validation messages, field order within a section, and the save control's placement             | `delegated to Mission Lead`   | No product meaning                                                                                                                                            | Delegated                   |

## Brian approval

- Exact words:
- Date:
