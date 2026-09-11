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

## LAN-257 — linking a person is not editing them, and UX-13 says so

Found by the LAN-239 QA sweep (walker M5, finding M5-02) and fixed under
LAN-273. This section amends "Transactional person/contact/membership result"
above; where the two disagree, this one is later and wins.

**What shipped, and why it was wrong.** "Use selected person" wrote every typed
contact onto the chosen person. A number that differed from the one on file
went in as a second, _non-preferred_ row. That demoted nothing, which was the
conservative half — but no screen in the product lists a non-preferred contact
point (`currentContact()` picks the preferred one), so the row was invisible.
The operator saw their number accepted, saw the person's real number on the
confirmation, and had no way to learn a third value now existed. Meanwhile
"This is them" on `/operate/people/new`, the equivalent decision one door
along, wrote nothing at all. Two link flows, two behaviours, neither stated.

**What ships now — one behaviour, both doors.** A link **discards** the typed
values. Linking says "this human is that human"; it is not an edit of that
human's record, and an intake form is not where somebody's known-good number is
superseded or quietly doubled. This is the rule `insertAliasIfDistinct` already
applied to a name form, for the same reason, and it is the behaviour
`/operate/people/new` already had.

Both confirmations now say what happened:

- **UX-13** (`/operate/roster/[membershipId]?created=1`). The subtitle no
  longer claims a person was created when one was not — a linked intake reads
  "&lt;season&gt; membership was added to a person already on record." A typed
  contact that was discarded is named by field, with a link to the person's own
  edit surface, which is where a contact actually changes.
- **`/operate/people/[personId]`** after "This is them" carries the same notice.

Named **by kind, never by value**: the discarded number or address is personal
data, and a query string is bookmarked, kept in browser history, and written to
every access log in between. A value the person already holds is not reported
at all — nothing was discarded, and saying "not recorded" about a value printed
on the record below would be its own false statement. The discard is audited on
`returner_membership_confirmed` as `contact_kinds_not_recorded`.

**A contact point the app writes is on the record.** A person this submission
_mints_ still gets their typed contacts. Intake's one email field writes
`contact_points.scope = null` — "not classified yet", because guessing personal
versus college from a domain would be inventing data about a real person — and
until LAN-273 the person record showed only the personal and college rows, so
that address appeared on no screen at all. The record now carries an
`Email · not classified` row when there is one, and nothing when there is not.

## UX-conformance checklist

| Acceptance criterion                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All owned screen IDs render at their registered routes                   | **Met.** UX-10/11/12 at `/operate/roster/new`, UX-13 at `/operate/roster/[membershipId]`; asserted in `src/app/operate/roster/screens.test.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Primary and secondary actions use the exact approved labels              | **Met as amended above.** Every shipped label is asserted character-for-character                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Material alternate states are reachable and testable                     | **Met.** Candidates found, no candidates, validation, membership refusal, refusal without a resolvable membership, and the confirmation                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Keyboard focus, labels, status meaning, error association, touch targets | **Evidenced, within a stated limit.** Real `<label>` per field; focus moves to the _first invalid_ control (asserted, and asserted not to be simply the first field); the message is reachable through `aria-describedby` rather than merely present; **every** action on all four screens carries a 44px minimum, as does the UX-11 candidate radio. All of them fail if removed. **The limit:** jsdom does not lay out, so the target assertions read requested values, not measured boxes — and there is no automated accessibility audit in this repository at all |
| No inaccessible data in the DOM for an unauthorized role                 | **Met.** Asserted against `container.innerHTML`, so a value in a hidden input or an attribute fails it                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| No unrecorded deviation from `../slice-ux.md`                            | **Met by this section.** Nine departures, seven of them Brian's                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Every field reachable and submittable at 375px                           | **Met by owner acceptance only.** jsdom does not evaluate MUI breakpoints, so no test in this repository can evidence it — hiding a field below `md` passes every assertion. Brian confirmed it on the running application                                                                                                                                                                                                                                                                                                                                             |

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).

## Decision history relocated from source (LAN-300)

### src/lib/services/roster.ts — module header

> ## What this module is for
>
> One authorized operator enters a returning player, by hand, on a phone, and
> the application mints the durable and seasonal identifiers together: a
> `people` row (or a person the operator explicitly picked), its contact
> points, and one `season_memberships` row in the open season carrying
> `entry = 'returning'`.
>
> ## The two rules that shape every function here
>
> **1. Nothing is written until a human has decided who this is.** Requirement
> 2 asks for a verified path that dedupes against existing Persons _before_
> creating anything, and the reason is in the source data: 26% of the current
> squad is recorded by first name only, and there is no stable join key
> anywhere in the club's files. So `findPersonCandidates()` is a separate,
> read-only call, and `enterReturningPlayer()` refuses to guess — it takes an
> explicit `decision` naming either an existing person or a deliberate new one.
> There is no code path through this module that creates a person because
> nothing matched. "Nothing matched" is still an operator's call to make.
>
> **2. Contact detail is stored exactly as it was typed.**
> `docs/architecture/data-model.md` is explicit — "Raw intake is stored
> unvalidated by design; normalisation is separate and reversible" — and the
> schema comment on `contact_points.raw_value` says the same. A reversed TLD, a
> trailing space and a missing leading zero are all real defects in the club's
> files, and rejecting or silently repairing them loses the contact entirely.
> So `raw_value` receives the operator's string byte-for-byte. Trimming and
> case-folding happen **only** to compare, never to store.
>
> The one deliberate exception is the name fields, which the database itself
> constrains to be non-blank and which are identity rather than contact detail;
> those are trimmed. That asymmetry is intentional and is stated here so it is
> not "fixed" later.
>
> ## Where the transition record lives
>
> The membership transition — `null → onboarding`, and since LAN-182 that is
> the only one an intake writes — is written to
> `season_membership_status_events`, which is the typed first-class home the
> frozen model gives it, and it carries the acting operator as
> `actor_person_id`. It is deliberately **not** duplicated into
> `audit_events`: register D9 refuses that, the `audit_events` table comment
> says so, and `recordAudit`'s own documentation repeats it.
>
> `audit_events` receives the two facts that have no typed home — that this
> operator minted a durable identity, and that this operator completed a
> returner intake and confirmed the membership. Neither carries `from_state` or
> `to_state`, so neither restates a transition the typed table already owns.
> `public.transition_ledger` reads both streams as one. This reconciliation is
> recorded in the pull request; see LAN-74's acceptance criteria.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
