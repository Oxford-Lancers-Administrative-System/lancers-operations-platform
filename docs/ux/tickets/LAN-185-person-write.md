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
  reads (who they are, how to reach them, academic, restricted — with the
  emergency contact grouped as its own labelled subject inside restricted,
  the way the record itself reads it as one `Fact`, per `B2`). Aliases add,
  remove and flag-as-display-name. Contact values supersede (dated history,
  one preferred value per kind and scope); every other field overwrites, its
  previous value surviving in the audit trail. A reason is required to change
  an existing value and never to fill an empty one — reachable per field for
  every one of the fifteen correctable fields (first name, last name, mobile,
  personal email, college email, college, matriculation year, expected
  graduation, degree field, date of birth, and all five emergency-contact
  fields), appearing live only once that field's value actually differs from
  what is stored, and disappearing again if the operator puts the original
  value back (`B1`). Phone and email validated per field, naming the rule,
  before any write; every correct international form of a number saves, only
  a bare national number defaults to UK. Mobile is one inline field like every
  other — its normalised preview and WhatsApp-seam warning render live,
  before the save, with no second screen (`B3`; the two-step confirm page W2
  originally shipped with is gone). Refused: an email already held by another
  person (offered the merge); a concurrent save (told what changed
  underneath it). Nothing here moves a membership, prospect, role or seat.
- `/operate/people/new`: first name, last name, one contact point. The
  duplicate check runs before creation, matching name, alias, every email and
  every phone, and its result is always shown — including a negative one, in
  the same count-sentence shape `roster/new`'s returner intake already uses
  for the same check, so a duplicate check that found nobody is never
  indistinguishable from one that never ran (`B4`); answered _this is them_
  (link, create nothing), _somebody new_ (mint), or left unanswered
  (blocked). Creating over an exact contact-point match requires a reason;
  the rejected candidate is audited. Creates a Person and nothing else — no
  role, no login, no membership. A merged-away record is never offered; its
  survivor is.
- `/operate/people/[personId]/merge`: found via the same search `W1` uses,
  reached only from a record the operator already holds. The comparison is
  field by field — including contact points and aliases — with every
  difference marked and a per-field choice of which value the survivor
  keeps; fields that agree are shown too. A reason is required. What will
  move is shown before it moves. Refused: an active operator seat on the
  losing record (names the action and links to Mission 1's administration
  surface); a membership for a shared season that is not yet archived on the
  losing record (`Q-16`, below — names the season and links to the exact
  membership to archive). Every refusal this route's own read can throw
  renders as the product's own refusal state, never a Next.js crash screen
  (`B5`). A duplicate prospect pair combines onto the survivor with the
  earliest first-contact date and the furthest-along status. The losing row
  is never deleted — marked merged, dated, pointing at the survivor,
  re-pointed by every other reference the schema carries to a person, with
  one exception: a season membership archived to clear `Q-16`'s refusal
  stays on the losing record, never re-pointed, said plainly on the
  confirmation screen before the merge. The merge reads as one audited event
  on the
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
- **`Q-16`'s archived membership carries its participation history with
  it, deliberately.** Once a season-overlap merge proceeds, anything
  recorded against the loser's archived membership for that season —
  attendance, RSVPs, status history — stays with the merged-away record and
  does not join the survivor's season. Brian considered re-pointing that
  participation history and rejected it; not built, and not attempted.

## Correction round (`inv-ae866233-f12`, F1 and F2)

- **F1 — the reason rule was unreachable for twelve of fifteen correctable
  fields.** Only mobile, personal email and college email carried a _Reason
  for the change_ input; `person-write.ts`'s server-side rule was always
  correct, but the edit form and its action supplied no reason field, and
  passed no `reason`, for first name, last name, college, matriculation year,
  expected graduation, degree field, date of birth, or any of the five
  emergency-contact fields — a functional dead end once any of those twelve
  held a value. Fixed by threading a `*Reason` input and parameter through
  each, the same way the original three already worked: rendered whenever
  the field currently holds a value, required only to change it. (Round 2's
  `B1`, below, replaced "whenever the field holds a value" with "only once
  the live value actually changes" — the rule this round fixed stayed the
  same; only its rendering trigger was corrected again.)
- **F2 — the merge route's own authorization test could not distinguish a
  refusal from a completed merge.** The mocked `redirect()` throws on success
  too, so `.rejects.toThrow()` passed whether the operator was correctly
  refused or the merge actually completed. Fixed to assert the specific
  `NotPermitted` error and confirm the loser record was never touched, the
  same stronger pattern the reason-gate test in the same file already used.
  `capabilities.ts` was already correct and needed no change.

## Correction round 2 (Brian's walk at head `b6fc7a1c`, findings B1–B6)

- **B1 — the reason box rendered statically, up front, for every populated
  field.** A dozen filled fields read as demanding a dozen reasons before the
  operator had touched anything. The rule itself was already right (required
  to change a value, never to fill an empty one); only its rendering trigger
  was wrong. Fixed: `edit-person-form.tsx`'s `CorrectableField` now tracks
  each field's live value in client state and shows the reason box only once
  it actually differs from what is stored, hiding it again if the operator
  puts the original value back — per field, live.
- **B2 — the emergency contact read as five loose fields.** Grouped under its
  own labelled `Subsection` inside Restricted — first name, last name,
  relationship, phone and email as one subject, the way the record's own read
  view already renders it as a single `Fact`.
- **B3 — mobile was a second screen; every other field was inline.** Changing
  the mobile number used to throw the operator onto a whole separate
  "Correct this record" screen with its own lone reason box and Save button —
  "The UX is super inconsistent here" (Brian). Fixed by deleting that second
  screen (`MobileConfirmStep`, `pendingMobileConfirmation`, `confirmMobile`)
  entirely: `validatePhoneNumber` and `describeWhatsappSeamConsequence` are
  both pure and explicitly documented safe to call from a client component,
  so the normalised preview and the WhatsApp-seam warning now render inline,
  live, as the operator types — the same one-page, one-Save shape every
  other field uses. The server action re-validates and re-normalises before
  it ever commits; nothing about the write path changed.
- **B4 — a duplicate check that found nobody answered nothing.** `/operate/
people/new` rendered no panel at all when `findPersonDuplicates` returned
  zero candidates, so the Create button just read "Create `<name>`" — visually
  indistinguishable from the check never having run, and REQ-duplicate-check
  requires the result to be answered. Fixed to always render the panel once
  the check has run, with the same count-sentence shape (and the same
  `data-testid="candidate-count"`) `roster/new/returner-intake-form.tsx`'s
  `CandidatesStep` already uses for the identical check elsewhere in the
  application, rather than inventing a second shape.
- **B5 — a merge-route refusal rendered as a Next.js crash screen.** Opening
  `/operate/people/<id>/merge?with=<a-merged-away-id>` (or `?with=<self>`, or
  a nonexistent id) let `previewPersonMerge`'s `ConstraintViolated` /
  `NotFound` reach `MergePage` unhandled, rendering a runtime error screen
  with a stack frame instead of a refusal. The guard was always correct;
  only its surfacing was wrong. Fixed by wrapping the call in a try/catch and
  rendering a `Refusal` component — the same shape `events/[id]/edit/
page.tsx` already uses for an uneditable draft — naming the refusal and
  linking back to the record.
- **B6 — the season-overlap refusal named an action the application cannot
  perform, and Brian ruled on it as `Q-16`** (see below). Built exactly as
  answered: the refusal now names the season, links to the loser's own
  membership, and clears once that membership is archived; the merge then
  proceeds with that one membership excluded from the re-point — the same
  deliberate-exclusion shape `repointProspects()` already uses for a
  converted prospect — and stays on the merged-away record, said plainly on
  the confirmation screen before the merge. The active-seat refusal's
  message was checked against the same actionability bar and needed no
  change — it already names the action (end the seat) and the destination
  (Mission 1's administration surface).

### `Q-16` — the season-overlap refusal, once a membership is archived

Brian, correction round 2 (superseding `Q-5`'s bare "resolve that on the
roster" for this one refusal; everything else `Q-5` states is unchanged):

> A merge may proceed once the losing record's membership for the shared
> season is archived. The refusal says so explicitly: it names the season,
> links to that membership, and tells the operator to archive it on the
> roster before merging. On the merge itself, the archived membership stays
> on the merged-away record — never deleted, never re-pointed onto the
> survivor. The confirmation screen says plainly that it stays there.

Two things this decision deliberately does not solve, both accepted costs
rather than gaps: re-pointing the archived membership onto the survivor
would violate `season_memberships_one_per_person_per_season` and re-break the
very thing archiving cleared, so it is excluded with a comment saying why.
Anything recorded against that membership — attendance, RSVPs, status
history — stays with the merged-away record and does not join the survivor's
season; Brian considered re-pointing that participation history and rejected
it. Not built, and not attempted.

### `Q-17` — a second package's test file appears in this diff

This round's own tests proved themselves clean against `main`, but CI still
failed at the correction round's head — four times out of four, never on
anything B1–B6 touch. Investigated rather than assumed: `npx vitest run
--project database` alone (no `unit` project) passed every time;
`unit`+`database` together — exactly how `npm run test`/CI's own `test:ci`
invoke it — failed, identically, on one single test in
`src/lib/services/messaging-scheduler.test.ts` (LAN-169, a different
mission), and reproduced the same way on round 1's own head once actually
run against a freshly reset database rather than a reused one. Established
cause: that one test's own single `runMessagingSweep()` call assumed its
fixture's fresh escalation would be dispatched within that one tick, but
`readDueJobs` orders strictly oldest-due-first with a fixed batch limit, and
the seeded database carries its own ambient backlog of jobs already due,
every one older than a job this fixture creates with `scheduled_for =
now()`. Nothing scoped that backlog to the test, so a slower run (contention
from the `unit` project's own parallel load, more of the backlog crossing
due in the meantime) could leave the fixture's own escalation still queued
after one tick — a timing dependency that was already latent, not something
this round's diff introduced, but one this round's own added test load
plausibly pushed CI's already-thin margin past.

Brian (correction round 2, `Q-17`):

> Fix it inside this PR, accepting that another mission's test file appears
> in this package's diff and that the two changes merge as one, in exchange
> for saving a separate PR cycle.

Fixed entirely inside `messaging-scheduler.test.ts`'s own fixture — sweeping
in a bounded loop until the fixture's own escalation is actually dispatched,
rather than assuming one tick is enough — never touching
`messaging-scheduler.ts` or weakening the privacy assertion it makes.
Injection-proven the same way as B1–B6: the single-call version was
reintroduced, observed to fail under the identical `unit`+`database`
invocation against a freshly reset database, restored, and then shown
passing three consecutive full-suite runs, each against its own freshly
reset database. `Q-17` is this file's authority for being in this package's
diff at all — LAN-185 does not own `messaging-scheduler.test.ts` or any
other part of LAN-169's messaging package, and this is the one, narrow,
Brian-approved exception.

## Acceptance criteria

The twenty-two checkboxes under **Acceptance** on the LAN-185 Linear issue are
the criteria verbatim; see `receipt.json`'s `acceptance_criteria` for how
each was demonstrated.
