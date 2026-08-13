# LAN-74 - Returner intake

Status: workflow direction approved by Brian on 12 August 2026; verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses, responses, and attendance records are synthetic and do not correspond to real members.

Approval evidence: [LAN-90 approval comment](https://linear.app/brian-schuster/issue/LAN-90/0-define-and-approve-the-minimum-ux-for-the-first-operational-vertical#comment-44f1c4de-cc9f-4708-86b3-b2ba555bf960) · [Notion approval record](https://app.notion.com/p/3ba488886d5781ed9adedd53635d1c6f)

## Purpose

Let an authorized operator add a returning person and current-season membership without silent duplicates.

The current live LAN-74 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route                            | Audience                   |
| ------ | -------------------------------- | -------------------------- |
| UX-10  | `/operate/roster/new`            | Authorized roster operator |
| UX-11  | `/operate/roster/new`            | Authorized roster operator |
| UX-12  | `/operate/roster/new`            | Authorized roster operator |
| UX-13  | `/operate/roster/[membershipId]` | Authorized roster operator |

## Wireframes

- **UX-10 - Add returning player:** [`desktop`](../wireframes/UX-10-returner-entry-desktop.svg) / [`phone`](../wireframes/UX-10-returner-entry-phone.svg)
- **UX-11 - Review possible matches:** [`desktop`](../wireframes/UX-11-returner-candidates-desktop.svg) / [`phone`](../wireframes/UX-11-returner-candidates-phone.svg)
- **UX-12 - This person already has a current-season membership:** [`desktop`](../wireframes/UX-12-returner-current-membership-refusal-desktop.svg) / [`phone`](../wireframes/UX-12-returner-current-membership-refusal-phone.svg)
- **UX-13 - Returning player added:** [`desktop`](../wireframes/UX-13-returner-created-desktop.svg) / [`phone`](../wireframes/UX-13-returner-created-phone.svg)

## This ticket builds

- `/operate/roster/new`
- First name, last name, email and phone — see the departures table below; the
  wireframes say "Given name" / "Family name" and add a "Known as" field
- A membership recorded as `entry = 'returning'`; the wireframes show a fixed
  "Returning" marker on screen, which was removed
- Duplicate check before every write
- Candidate matches by name and supplied contact
- Explicit existing-person selection or explicit new-person confirmation
- Current-season membership refusal
- Transactional person/contact/membership result and roster return

## Explicitly not in this ticket

- Self-service `/verify/[token]`
- Silent merge
- Silent person creation
- Open recruitment
- Historical import

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, re-read the live owning issue and comments and reconcile any changes recorded after Brian’s 12 August 2026 approval.
- In implementation review, provide LAN-74, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Implemented — owner-approved departures from the wireframes, 12 August 2026

Brian reviewed UX-10, UX-11, UX-12 and UX-13 on the running application, at
desktop and 375px, and accepted them. In doing so he changed seven things. They
are recorded here, in the ticket contract, because
[`../slice-ux.md`](../slice-ux.md) § 1 puts recorded owner decisions above this
document and above the SVGs — and because **LAN-75 onwards is built from the same
wireframes**, which now disagree with what ships.

The SVGs under `../wireframes/` are unchanged and are therefore stale on these
points. Whether they are redrawn is Brian's call, and belongs to LAN-90.

| Screen | The wireframe                                            | What ships                                           | Why                                                                                                                                                                                         |
| ------ | -------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-10  | "Family name" then "Given name", in that order           | **"First name" then "Last name"**                    | The frozen model's vocabulary was appearing on an operator's screen, in an order nobody says names in. The columns keep `given_name` / `family_name`; only the labels and the order changed |
| UX-10  | "Known as" field                                         | **removed**                                          | "Not a good way to talk about it." Intake therefore writes no `person_aliases` row; the service still accepts one for imports                                                               |
| UX-10  | "Entry marker: Returning (fixed)" chip                   | **removed**                                          | It displayed an internal value the operator could neither change nor interpret. The membership is still written `entry = 'returning'`, and UX-13 says so in words                           |
| UX-10  | Info strip: "No person or membership is created until…"  | **removed**                                          | Narrated the mechanism at somebody trying to do a job. The behaviour is unchanged and is proved in `src/app/operate/roster/new/actions.test.ts`                                             |
| UX-12  | Warning strip: "The write is refused before any person…" | **removed**                                          | Repeated the heading and the sentence above it, and dressed a normal, correct outcome as a fault                                                                                            |
| UX-12  | "Open current membership" / "Back to candidate review"   | **"View \<first name\>'s roster entry" / "Go back"** | Neither old label said what it did                                                                                                                                                          |
| UX-13  | "View membership" / "Back to roster"                     | **"Back to roster"** only                            | "View membership" led to the page it was already on                                                                                                                                         |

Two further departures were not requested and are recorded as implementation
decisions rather than owner ones:

- **UX-11 desktop is a card list, not a table.** The wireframe shows one header
  row over the candidate rows; the implementation repeats each field's label
  inside every row. All the information is present and the phone layout is the
  same component; the desktop hierarchy differs.
- **UX-11 carries a third action, "Back to details."** Neither wireframe shows
  it. It is the recovery the shared contract's Validation and Error rows imply,
  but it is an added action and this is where that is said.

## UX-conformance checklist

| Acceptance criterion                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| All owned screen IDs render at their registered routes                   | **Met.** UX-10/11/12 at `/operate/roster/new`, UX-13 at `/operate/roster/[membershipId]`; asserted in `src/app/operate/roster/screens.test.tsx`                                                                                                                                                                                                                                                                                                                                                                                      |
| Primary and secondary actions use the exact approved labels              | **Met as amended above.** Every shipped label is asserted character-for-character                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Material alternate states are reachable and testable                     | **Met.** Candidates found, no candidates, validation, membership refusal, refusal without a resolvable membership, and the confirmation                                                                                                                                                                                                                                                                                                                                                                                              |
| Keyboard focus, labels, status meaning, error association, touch targets | **Evidenced, within a stated limit.** Real `<label>` per field; focus moves to the _first invalid_ control (asserted, and asserted not to be simply the first field); the message is reachable through `aria-describedby` rather than merely present; actions request a 44px minimum. All four fail if removed. **The limit:** jsdom does not lay out or evaluate breakpoints, so the touch-target assertion reads the requested value, not a measured box — and there is no automated accessibility audit in this repository at all |
| No inaccessible data in the DOM for an unauthorized role                 | **Met.** Asserted against `container.innerHTML`, so a value in a hidden input or an attribute fails it                                                                                                                                                                                                                                                                                                                                                                                                                               |
| No unrecorded deviation from `../slice-ux.md`                            | **Met by this section.** Nine departures, seven of them Brian's                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Every field reachable and submittable at 375px                           | **Met by owner acceptance only.** jsdom does not evaluate MUI breakpoints, so no test in this repository can evidence it — hiding a field below `md` passes every assertion. Brian confirmed it on the running application                                                                                                                                                                                                                                                                                                           |

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).
