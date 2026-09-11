# LAN-184 - Look up any person the club holds, and work the missing-data queue

Status: implemented. This contract is written at delivery, per LAN-148 §E — the
packet at `missions/packets/M-PEOPLE-AND-ROSTER/packet.json` and the approved
mockups were this package's only contract before now; this durable file
records what actually shipped so a later mission reads a contract here rather
than re-deriving one from a superseded packet.

> **Synthetic scenario data:** All displayed people, contact details, statuses
> and history entries are synthetic and do not correspond to real members.

Approval evidence: `missions/intake/M-PEOPLE-AND-ROSTER/acceptance/W1.md` and
`.../W7.md` — "Otherwise, Workflow 1 looks good to me. I approve." (2026-08-26)
and "W-7 is approved. Everything's approved." (2026-08-27), both by Brian
Schuster, with every amendment through `W1-A6` applied and recorded in
`missions/intake/M-PEOPLE-AND-ROSTER/workflows/W1-look-up-any-person-the-club-holds.md`.

## Purpose

Every human the club holds is findable and readable by the four-role group,
and the club's missing-data problem is a real, workable list rather than a
flag on the roster. Read-only: correction, creation and merge are LAN-185's.

The current live LAN-184 issue and its packet remain authoritative for any
future correction. Shared vocabulary, authorization and responsive behavior
are defined in [`../slice-ux.md`](../slice-ux.md) and [`../standards.md`](../standards.md)
and are not duplicated here.

## Owned screens and routes

| Screen        | Route                        | Audience                                              |
| ------------- | ---------------------------- | ----------------------------------------------------- |
| W1-01 … W1-04 | `/operate/people`            | President, VP, Secretary, General Manager, IT Officer |
| W1-05 … W1-12 | `/operate/people/[personId]` | Same four-role group                                  |
| W7-01 … W7-07 | `/operate/people/missing`    | Same four-role group                                  |

## Wireframes

- **W1 - the People list and the person record:** [`missions/packets/M-PEOPLE-AND-ROSTER/mockups/W1-look-up-any-person-the-club-holds.html`](../../../missions/packets/M-PEOPLE-AND-ROSTER/mockups/W1-look-up-any-person-the-club-holds.html) — ten screens, twenty frames, both desktop and 375px.
- **W7 - the missing-data queue:** [`missions/packets/M-PEOPLE-AND-ROSTER/mockups/W7-work-the-missing-data-queue.html`](../../../missions/packets/M-PEOPLE-AND-ROSTER/mockups/W7-work-the-missing-data-queue.html) — seven screens, fourteen frames, both desktop and 375px.
- Hub: [`missions/packets/M-PEOPLE-AND-ROSTER/mockups/index.html`](../../../missions/packets/M-PEOPLE-AND-ROSTER/mockups/index.html)

## This ticket builds

- `/operate/people`: search by first name, last name or alias (including a
  non-display alias); the five approved columns (name, status, to the club,
  contactable, missing); sort on every column; two thin filters (status,
  missing data); scoped to the season in view with a deliberate, reversible
  widen to everyone outside it; both empty states.
- `/operate/people/[personId]`: the durable record in the approved section
  order (who they are, how to reach them, academic, restricted, where they
  stand, their seasons, what changed); `not recorded` stated explicitly on
  every absent field; a contact value or alias shows who supplied it; no
  verification mark, no confidence class, no contested-value state; roles and
  seasons render read-only with routes to where they are changed; the merged-
  away redirect and its one-sentence survivor notice; the `What changed`
  section expanding in place to the real audit and status-transition history
  with field and actor filters, with no separate history route.
- `/operate/people/missing`: every person with at least one required fact
  absent, naming the facts per row and never a value; filter by which fact is
  missing and by status; sort by how much is missing and by name; both empty
  states; a row routes to correction and back.
- `People` and `Missing data` join the Administration group in the shell,
  gated the same way as the two routes above.

## Explicitly not in this ticket

- Any write path: correction (`/operate/people/[id]/edit`), creation
  (`/operate/people/new`) and merge (`/operate/people/[id]/merge`) are
  LAN-185's. This ticket renders the controls that route to them.
- A per-fact `refused` or `not applicable` state on the queue — Mission 7's.
- Any recruitment stage, funnel or recruit-stage field on the person record —
  Mission 6's.
- A season picker anywhere.

## Ticket interaction contract

- Implement every owned screen and the loading, validation, empty, and
  unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation
  review notes.
- Preserve the desktop and phone information hierarchy the mockups draw.
  Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery
  action without a recorded design decision.
- Column visibility, and every restricted field (date of birth, emergency
  contact), is a function of category grants (`src/lib/auth/person-authority.ts`)
  and is absent from the DOM and the response payload for a viewer who does
  not hold it — not merely unrendered.
- In implementation review, provide LAN-184, implemented screen IDs, desktop
  and 375px phone screenshots, acceptance-criteria results, and every
  deviation or assumption.

## Acceptance criteria

The fifteen checkboxes under **Acceptance** on the LAN-184 Linear issue are
the criteria verbatim; see `receipt.json`'s `acceptance_criteria` for how each
was demonstrated. In summary:

- All owned screen states render at their registered routes for the correct
  role and record scope.
- Primary and secondary actions use the exact approved labels shown in the
  mockups.
- No inaccessible data is present in the DOM or response payload for an
  unauthorized role — proved by a test that inspects the payload.
- A merged-away duplicate appears nowhere and its direct link resolves to the
  survivor.
- Both empty states (system-empty and filtered-empty) exist and are
  distinguishable, on both the People list and the queue.
- The implementation review shows no unrecorded deviation from
  [`../slice-ux.md`](../slice-ux.md) or this contract.

## Decision history relocated from source (LAN-300)

### src/app/operate/people/page.tsx — `PeoplePage` (file header)

> `W1-01` … `W1-04` — the People list, its search, its two empty states and
> the widened (outside-season) view. LAN-184, `REQ-person-record`.
>
> The list scopes to the season in view (`DEC-w1-01`): a season membership in
> any status, a prospect record, a season-scoped role assignment, or a
> committee-year role paired with that season by its shared label. Widening is
> deliberate and reversible, per Brian's own ruling that the surface should
> not sit in the wide view as a mode — it is `?scope=outside`, one link away
> from the default in both directions.
>
> The desktop table and the phone cards render from the same `entries`, the
> same idiom `roster/page.tsx` already uses, so the two can never drift apart.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/people/missing/page.tsx — `MissingDataPage` (file header)

> `W7-01` … `W7-05`, `W7-07` — the missing-data queue. LAN-184,
> `REQ-missing-queue`. Extended by `W8`/`W9`/`W11` (LAN-218) with two columns
> — when each person was last contacted and what kind it was, and when the
> machine will next write, or that it will not — and one action: select one
> person or several, and nudge.
>
> Every person tied to the season in view (or, widened, outside it) with at
> least one required fact absent, naming which facts per row and never a
> value. `DEC-w7-07`, drawn deliberately rather than hidden: there is no
> `refused` or `not applicable` state here, so a departed alumnus with no
> personal email — `W7-07` — sits in this queue indefinitely until Mission 7
> builds the state that would retire the row.
>
> `W8`'s own locked recommendation: this page defaults to onboarding players
> only, with Mission 5's full shipped scope one click away
> (`?players=all`) — a second, independent widen from the existing
> in-season/outside-season one, because "everybody with missing data" and
> "everybody, including people outside this season" answer different
> questions.
>
> Correction round 1, `C-2` (Brian, 2026-09-03 walkthrough): no reachable
> mobile number ranks first, above every other ordering this page applies —
> see the comment beside the reachability sort below.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/people/missing/page.tsx — Inline: reachability sort (`MissingDataPage` body)

> Correction round 1, `C-2` (Brian, 2026-09-03 walkthrough): "a missing
> number, an incorrect number, or a number we can't contact means they're
> out of the loop. That's a terrible problem" — a class-1 issue, because
> everything runs on WhatsApp, and one the plain "how much is missing"
> count already buries no higher than a missing degree subject. Applied
> last, after every other ordering above (the operator's own explicit
> Name/Missing sort, or the onboarding-only default), as a stable
> partition — nobody with no reachable number's relative order among
> themselves, or a fully-reachable person's, ever changes; only the two
> groups swap which comes first. `Array.prototype.sort` has been a stable
> sort since ES2019, so this is safe without a second key.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/people/[personId]/page.tsx — `PersonRecordPage` (file header)

> `W1-05` … `W1-12` — the person record, its restricted section, its
> merged-away redirect and its history section. LAN-184, `REQ-person-record`,
> `REQ-history-on-record`, `REQ-restricted-fields`.
>
> ## What is not on this page, and why
>
> `person-record.ts`'s `PersonRecord` — the frozen LAN-183 shape this package
> calls rather than extends — carries `source` for a contact point and for an
> alias, and for nothing else: `people.given_name`, `family_name`, `college`,
> `matriculation_year`, `expected_graduation_year`, `degree_field` and
> `date_of_birth` have no provenance column on `main`, and
> `person_emergency_contacts.recorded_by_person_id` exists in the schema but
> is not part of what `readPersonRecord()` returns.
>
> `Q-13` (Brian's walkthrough of this page at 2934b787, 2026-08-29): for
> those same seven fields, `readPersonRecord()` now derives "who supplied it"
> from `audit_events` instead of a stored column — the most recent
> `person_<field>_updated` row `person-write.ts`'s `updatePersonField` wrote
> naming this person. `DerivedBy` below renders that name where one was
> found, and reads "not recorded" — plainly, not silently — where it was
> not: a value that arrived by seed or import and was never edited through
> the application has no such row. Almost nothing has been changed through
> the application yet, so this renders sparsely today and becomes truthful as
> the club uses it; that is the intended shape, not a gap. Inventing a
> caption the data cannot back is still the false statement amendment
> `W1-A2` struck the `Verified` mark for being — reading one back out of the
> record's own history is not that. The emergency contact keeps carrying no
> caption at all: its `recorded_by_person_id` column is real but still not
> part of what this package reads, and stays a later package's decision.
>
> ## Redaction, applied even though nothing here can exercise it today
>
> `redactPersonRecord()` runs on every load. `person_record_authority` is
> currently all-or-nothing — every category reads the same capability — so
> `visible` equals `record` for every operator who reaches this page at all.
> It runs anyway because `REQ-authority`'s "column visibility is a function
> of category grants" is a property of this page's _code_, not of today's
> capability map, and the day a coaching seat is granted `"contact"` this is
> the line that has to already be here.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/people/[personId]/page.tsx — Element: unclassified email row (now `identity-contact-sections.tsx`, `ContactSection`)

> LAN-257 — `contact_points.scope` is null for an email nobody has
> yet said is personal or college, which is exactly what
> `/operate/roster/new` writes for a person it mints: its one field
> is "Email", and guessing the scope from the domain would be
> inventing data about a real person. Null is the truth, and the
> missing-data queue is what fills it in — but until this row
> existed the address the club held was on no screen at all, which
> is the same invisible write LAN-257 is about. Rendered only when
> there is one, so a classified record is unchanged.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/people/[personId]/page.tsx — Element: student number / BAFA rows (now `academic-restricted-sections.tsx`, `AcademicSection`)

> LAN-267. Two personal facts under the same handling as the rest
> of this section — shown here to an authorised operator, never on
> a list, board or queue, and named in the privacy notice.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/people-directory.ts — module header

> ## Why this module exists rather than extending `person-record.ts`
>
> LAN-183's `searchPeople()` finds a person by name or alias with no season
> scoping at all — the person record is season-agnostic by design
> (`DEC-w1-01`) and nothing about _finding_ one person needed a season. This
> mission's two new surfaces need the opposite question answered: which
> _people_ have a tie to the season in view. That tie is this package's own
> business rule — `W1`'s specification names four kinds of tie a person may
> hold, and nothing on `main` before this package computed any of them — so it
> lives here rather than bent onto a module whose whole job is the single-person
> read. `readPersonRecord()` and `missingRequiredFields()` are still the ones
> this module calls for what they already answer.
>
> ## The four kinds of tie, and the committee-year pairing rule
>
> `W1`'s specification: "a season membership in any status, a prospect record,
> a season-scoped role assignment, or a committee-year role in the committee
> year paired with that season." The pairing is Brian's own ruling, 2026-08-26:
> a committee year ties to the season sharing its label, and nothing else —
> dates never enter into it, and there is no foreign key pairing the two
> cycles in the schema. This module derives the pairing from the shared label
> exactly as the specification requires and adds none of its own.
>
> ## Fetch wide, filter and sort in JavaScript
>
> `DEC-w1-12` and its `W7` counterpart delegate query shape, indexing and
> pagination to the Mission Lead, "the club holds hundreds of people, not
> millions." So the query below applies only the tie condition; every filter
> — search, status, which fact is missing — and every sort are applied here in
> JavaScript, once, over a list that is never going to be the reason a page is
> slow. That also keeps one alias-matching rule in one place rather than a
> second copy of `searchPeople()`'s `like` pattern living beside it.
>
> ## Presence, not value — `REQ-restricted-fields`
>
> The query below reads _whether_ college, matriculation year, date of birth
> and the emergency contact are recorded, never what they are. A boolean is
> not the disclosure `REQ-restricted-fields` forbids; the fact that Bertram is
> missing eight things is exactly what the People list's Missing column and
> the whole of the missing-data queue exist to say, and neither ever renders a
> value to say it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
