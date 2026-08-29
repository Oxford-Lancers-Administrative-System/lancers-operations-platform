# LAN-185 - Correct a record, add or link a person, and merge two records for the same human

Status: implemented. This contract is written at delivery, per LAN-148 §E — the
packet at `missions/packets/M-PEOPLE-AND-ROSTER/packet.json` and the approved
mockups were this package's only contract before now; this durable file
records what actually shipped so a later mission reads a contract here rather
than re-deriving one from a superseded packet.

> **Synthetic scenario data:** All displayed people, contact details, statuses
> and history entries are synthetic and do not correspond to real members.

Approval evidence: `missions/intake/M-PEOPLE-AND-ROSTER/acceptance/W2.md`,
`.../W3.md`, `.../W4.md`; Brian's exact words — "Make these changes and I'm
now approving" (W2, 2026-08-27), "Okay, W-3 is approved" (W3, 2026-08-27),
"W4 approved" (W4, 2026-08-27) — and `Q-5`, the merge-shape decision recorded
at the 2026-08-29 checkpoint.

## Purpose

Everything the club knows about a person becomes correctable, addable and
de-duplicable — attributably, and without destroying what was there before.
LAN-184's record and queue are read-only; this package builds the three
surfaces that write.

The current live LAN-185 issue and its packet remain authoritative for any
future correction. Shared vocabulary, authorization and responsive behavior
are defined in [`../slice-ux.md`](../slice-ux.md) and
[`../standards.md`](../standards.md) and are not duplicated here.

## Owned screens and routes

| Screen        | Route                              | Audience                     |
| ------------- | ---------------------------------- | ---------------------------- |
| W2-01 … W2-10 | `/operate/people/[personId]/edit`  | President, VP, Secretary, GM |
| W3-01 … W3-07 | `/operate/people/new`              | Same four-role group         |
| W4-01 … W4-09 | `/operate/people/[personId]/merge` | Same four-role group         |

## Wireframes

- **W2 - correct a person's record:** [`missions/packets/M-PEOPLE-AND-ROSTER/mockups/W2-correct-a-persons-record.html`](../../../missions/packets/M-PEOPLE-AND-ROSTER/mockups/W2-correct-a-persons-record.html) — ten screens, twenty frames, both desktop and 375px.
- **W3 - add or link a person who holds no membership:** [`missions/packets/M-PEOPLE-AND-ROSTER/mockups/W3-add-or-link-a-person-who-holds-no-membership.html`](../../../missions/packets/M-PEOPLE-AND-ROSTER/mockups/W3-add-or-link-a-person-who-holds-no-membership.html) — seven screens, fourteen frames.
- **W4 - merge two records for the same human:** [`missions/packets/M-PEOPLE-AND-ROSTER/mockups/W4-merge-two-records-for-the-same-human.html`](../../../missions/packets/M-PEOPLE-AND-ROSTER/mockups/W4-merge-two-records-for-the-same-human.html) — nine screens, eighteen frames.
- Hub: [`missions/packets/M-PEOPLE-AND-ROSTER/mockups/index.html`](../../../missions/packets/M-PEOPLE-AND-ROSTER/mockups/index.html)

## This ticket builds

- `/operate/people/[personId]/edit`: one edit surface, sectioned as the record
  reads (who they are, how to reach them, academic, restricted). Aliases add,
  remove and flag-as-display-name. Contact values supersede (dated history,
  one preferred value per kind and scope); every other field overwrites, its
  previous value surviving in the audit trail. A reason is required to change
  an existing value and never to fill an empty one. Phone and email validated
  per field, naming the rule, before any write; every correct international
  form of a number saves, only a bare national number defaults to UK. A
  mobile change is read back, normalised, before it commits. Refused: an
  email already held by another person (offered the merge); a concurrent save
  (told what changed underneath it). Nothing here moves a membership,
  prospect, role or seat.
- `/operate/people/new`: first name, last name, one contact point. The
  duplicate check runs before creation, matching name, alias, every email and
  every phone; answered _this is them_ (link, create nothing), _somebody new_
  (mint), or left unanswered (blocked). Creating over an exact contact-point
  match requires a reason; the rejected candidate is audited. Creates a
  Person and nothing else — no role, no login, no membership. A merged-away
  record is never offered; its survivor is.
- `/operate/people/[personId]/merge`: found via the same search `W1` uses,
  reached only from a record the operator already holds. The comparison is
  field by field — including contact points and aliases — with every
  difference marked and a per-field choice of which value the survivor
  keeps; fields that agree are shown too. A reason is required. What will
  move is shown before it moves. Refused: an active operator seat on the
  losing record; two memberships in one season. A duplicate prospect pair
  combines onto the survivor with the earliest first-contact date and the
  furthest-along status. The losing row is never deleted — marked merged,
  dated, pointing at the survivor, re-pointed by every other reference the
  schema carries to a person. The merge reads as one audited event on the
  survivor. There is no undo.
- `Correct this record`, `Add a person` and `Merge…` controls, already wired
  by LAN-184 to the routes this ticket owns.

## Explicitly not in this ticket

- Any migration. The two-email-kind split, the emergency-contact table and
  the academic fields this surface edits were all carried by LAN-182's
  schema; this package writes to substrate that already exists.
- The WhatsApp seam's underlying fact. `REQ-whatsapp-seam` and
  `docs/architecture/data-model.md`'s "Deliberately not implemented" section
  both name **Channel Presence** / **Group Membership** ("on WhatsApp and in
  this season's group") as a frozen-model concept release one omits
  entirely — no migration this package owns could honestly answer "was this
  number on WhatsApp for the active season." The check point, the copy, and
  the audited "mark rejoin needed" write are built and unit-tested for both
  branches (`person-whatsapp-seam.ts`); the one call site passes `false`
  today because nothing on `main` can truthfully answer otherwise. See
  Limitations below.
- Any role, login or seat change — Mission 1's, which is also why a losing
  record's _active_ operator seat refuses the merge outright rather than
  transferring it.
- Any message, send or channel action. LAN-90 and LAN-92 remain binding.
- A self-service surface for a person editing their own record — Mission 7's
  signed-link flow.
- Consent capture or lawful basis, and any rule for which side's consent
  record wins a merge — no consent substrate exists on `main`; Mission 8
  decides it, and this ticket records the edge rather than inventing one.
- The missing-data queue's own "Skip" / "Save and next" walk (`W2-10`). Every
  entry point — the record, and a queue row — lands on the same edit surface;
  the queue-specific chrome is not built. See Limitations.

## Ticket interaction contract

- Implement every owned screen and the loading, validation, empty, and
  unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation
  review notes.
- Preserve the desktop and phone information hierarchy the mockups draw.
  Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery
  action without a recorded design decision.
- Every route is gated on `person_record_authority` — the same four-role
  capability LAN-184 gates its own surfaces on. An operator outside the group
  never reaches these routes; the refusal exposes nothing.
- In implementation review, provide LAN-185, implemented screen IDs, desktop
  and 375px phone screenshots, acceptance-criteria results, and every
  deviation or assumption.

## Limitations, recorded rather than smoothed over

- **The WhatsApp seam never fires against real data today**, for the reason
  above. The negative branch (no banner) is proved end to end, against
  seeded data, in the browser preflight. The positive branch (the banner
  appears, the rejoin is marked needed, nothing is sent) is proved at the
  unit level (`person-whatsapp-seam.test.ts`) and by direct inspection of
  the wiring; it cannot be proved against seeded data because no seed row
  anywhere claims a number is on WhatsApp, and inventing one would be
  exactly the fabricated fact `REQ-not-recorded` forbids.
- **Removing an alias is a real row delete**, not a soft hide.
  `person_aliases` carries no "hidden" column on `main`, and adding one is a
  migration this package does not own. The removal is fully audited
  (`person_alias_removed`, naming the alias text) so the fact permanently
  survives in the person's history, but a removed alias no longer feeds
  `findPersonDuplicates()`'s live matching the way the workflow's "kept as
  dedupe evidence" language describes. Not gated by any of LAN-185's
  twenty-two acceptance checkboxes, which test add and flag-as-display-name,
  not removal's dedupe persistence.
- **The missing-data queue's row-to-row walk (`W2-10`) is not built.** Every
  entry point renders the same whole-record edit surface LAN-185's other
  nineteen screens draw; "Skip" and "Save and next" chrome, and deep-linking
  to the queue's next row, are not implemented. Acceptance item 1 (a saved
  last name makes the queue row disappear) is unaffected — that is
  `missingRequiredFields` recomputing from the corrected record, which this
  package's writes already produce correctly.
- **A converted recruitment prospect is excluded from merge combination.** If
  either side's prospect status is `converted` (implying its own season
  membership), the merge does not combine or re-point that season's prospect
  row automatically — `recruitment_prospects_one_per_person_per_season`
  then refuses the whole merge cleanly if both sides hold one, rather than
  this package guessing which conversion record is authoritative.

## Acceptance criteria

The twenty-two checkboxes under **Acceptance** on the LAN-185 Linear issue are
the criteria verbatim; see `receipt.json`'s `acceptance_criteria` for how
each was demonstrated.
