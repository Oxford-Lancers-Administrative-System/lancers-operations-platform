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
- **Validate every phone and email before the save is offered.** An email must be
  a syntactically valid address; a phone must be a plausible number, UK mobiles
  first. The refusal is per field, names the rule rather than saying "invalid",
  and the save is unavailable rather than failing afterwards.
- **Check the number against WhatsApp before saving it.** Where the number being
  replaced is on WhatsApp for the active season, say so and say what follows,
  before the save rather than after it.
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

## The mobile-number seam — recorded 2026-08-26, inherited by Mission 6

**Superseding a mobile number invalidates a season fact this mission does not
own.** The number is the person's and is corrected here. **On WhatsApp** — being
reachable on WhatsApp and in this season's group — is a _season_ record, and it
left this mission for Mission 6 on 2026-08-26 under the person-versus-season
test. Nothing today notices that one depends on the other, so a corrected number
leaves Mission 4 scheduling against a presence that was verified for a different
number.

Brian raised it, 2026-08-26: _"The phone number changes, which means WhatsApp
will be impacted, which is a big part of what the app does."_

The division that follows from the same test that split them:

- **This workflow raises the flag.** Superseding a mobile marks that person's
  On WhatsApp presence for the current season **unverified**. It is the only
  place that knows the number changed. It is deliberately not `not on WhatsApp`:
  the new number may well be on WhatsApp, and nothing here can know.
- **Mission 6 verifies.** It owns On WhatsApp and already fires the community
  group invite at every recruit door; re-confirming an existing member is that
  machinery pointed at somebody who is already on the roster.
- **Mission 4 must not send into an unverified presence.** An unverified
  presence is not a green light.
- **`W7` is where it becomes work**, if the required set grows to include it.
  That is an owner decision and is not assumed here.

**Amended 2026-08-27.** Brian settled the operator-facing half: this workflow
does not merely mark a flag, it **tells the operator at the moment of the
change** — the check is whether the number being replaced is on WhatsApp for the
active season, and if it is, the consequence is stated before the save. `W2-05`
is that screen. What remains Mission 6's is the verification itself and the
rejoin.

**The substrate is still absent.** On WhatsApp has no substrate on
`main`, so there is no flag to set and no state to write. This is recorded as a
seam — the same treatment `W4` gives the prospect collision — so Mission 6
inherits it rather than rediscovering it. `W2-04`'s read-back is the natural
moment for the operator to be told.

## Exceptions and recovery

- **A value that two people disagree about.** The operator enters what they
  believe is right and records the reason. There is no held state and no queue
  for it. Brian, 2026-08-26: _"There shouldn't be a dispute here. It should just
  see the latest record… They're the operator. Nothing goes higher than the
  operator."_ **This supersedes Task 08 §6's contested-value rule, the matching
  invariant in `01-overview.md`, and this workflow's own line in the frozen
  inventory**, all of which predate it.
- **Validation, and the negative cases that matter more.** Brian, 2026-08-27:
  _"there should also be negative cases so that correct numbers don't get
  invalidated."_ A correct number being refused is the worse failure: it stops
  an operator recording something true, and it will be met by typing something
  false. The set that must pass, at minimum: `+44 7700 900988`, `07700 900988`,
  `07700900988`, `+44 7700 900 988`, and a non-UK number in international form.
  The set that must fail: too few digits, letters, an empty country code, and an
  address with no domain or no local part.
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
8. confirm that nothing they did moved the person on the ladder;
9. be **refused a malformed email and a malformed number**, per field, with the
   rule named;
10. **save every correct form of a number** — `+44` and national, spaced and
    unspaced, and a non-UK international number — and have none of them refused;
11. change a number that is **on WhatsApp for the active season** and be told,
    before saving, that the group membership ends and a rejoin will be asked for;
12. change a number that is **not** on WhatsApp for the season and see no such
    notice.

## Core decisions

| Decision                                                                                         | Classification                | Governing evidence or recommended default                                                                                                                     | Status                      |
| ------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `disputed — awaiting verification` is struck; the record shows the current value and who set it  | `locked`                      | Brian, 2026-08-26. Supersedes Task 08 §6, `01-overview.md`'s invariant, and this workflow's frozen-inventory line                                             | Settled, amendments pending |
| One edit surface at `/operate/people/[personId]/edit`, sectioned as the record reads             | `proposed for owner approval` | The alternative is editing each field in place on the record. One surface is fewer moving parts and one audit boundary; in-place is fewer clicks for one typo | Recommend one surface       |
| A reason is required to change an existing value, and never to fill an empty one                 | `proposed for owner approval` | Task 07 §3 requires a reason audited. Demanding one to fill a blank would make the missing-data queue miserable to work                                       | Recommend as drawn          |
| Contact values supersede; every other field overwrites, with the previous value in the history   | `locked`                      | Task 08 §4                                                                                                                                                    | Settled                     |
| An email already held by another person refuses the save and offers the merge                    | `proposed for owner approval` | Task 09 D7 locks dedup-before-create at every door; this is the same rule on the correction path                                                              | Recommend yes               |
| A concurrent edit refuses rather than wins                                                       | `proposed for owner approval` | Nothing here is high-frequency enough to justify last-write-wins                                                                                              | Recommend yes               |
| Emergency contact is edited here and locked down structurally                                    | `locked`                      | Task 08 §4 and §6                                                                                                                                             | Settled                     |
| The college/personal email split is a migration this mission carries                             | `locked`                      | `contact_point_kind` on `main` is `('email','phone')`                                                                                                         | Settled                     |
| Phone and email are validated before the save is offered, per field, naming the rule             | `locked`                      | Brian, 2026-08-27                                                                                                                                             | Settled                     |
| A correct number is never refused; the negative cases are acceptance criteria in their own right | `locked`                      | Brian, 2026-08-27 — "negative cases so that correct numbers don't get invalidated"                                                                            | Settled                     |
| Changing a number that is on WhatsApp for the active season raises it before the save            | `locked`                      | Brian, 2026-08-27                                                                                                                                             | Settled                     |
| Whether the save also sends the rejoin request, or only marks it needed                          | `proposed for owner approval` | This mission sends nothing; dispatch is Mission 4's. Marking it needed keeps that true                                                                        | Recommend mark only         |
| Field-level permissioning within the four-role group                                             | `delegated to Mission Lead`   | Task 08 §6 grants the group uniformly; no source splits it further                                                                                            | Delegated                   |
| Validation messages, field order within a section, and the save control's placement              | `delegated to Mission Lead`   | No product meaning                                                                                                                                            | Delegated                   |

## Brian approval

- Exact words:
- Date:
