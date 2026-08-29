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
