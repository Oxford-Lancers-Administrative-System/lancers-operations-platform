# LAN-81 - Monday report

Status: workflow direction approved by Brian on 12 August 2026; verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses, responses, and attendance records are synthetic and do not correspond to real members.

Approval evidence: [LAN-90 approval comment](https://linear.app/brian-schuster/issue/LAN-90/0-define-and-approve-the-minimum-ux-for-the-first-operational-vertical#comment-44f1c4de-cc9f-4708-86b3-b2ba555bf960) · [Notion approval record](https://app.notion.com/p/3ba488886d5781ed9adedd53635d1c6f)

## Purpose

Preview and generate a narrow, immutable exception-and-action snapshot from `/operate/report`.

The current live LAN-81 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route             | Audience                   | Status                    |
| ------ | ----------------- | -------------------------- | ------------------------- |
| UX-80  | `/operate/report` | Authorized report operator | **Withdrawn 15 Aug 2026** |
| UX-81  | `/operate/report` | Authorized report operator | Superseded 15 Aug 2026    |
| UX-82  | `/operate/report` | Authorized report operator | **Withdrawn 15 Aug 2026** |
| UX-83  | `/operate/report` | Authorized report operator | Superseded 15 Aug 2026    |

## Wireframes

These are the 12 August package and remain the record of what was approved
then. Since the 15 August amendment below they are **not** the specification for
`/operate/report`.

- **UX-80 - Prepare Monday report:** [`desktop`](../wireframes/UX-80-report-preview-desktop.svg) / [`phone`](../wireframes/UX-80-report-preview-phone.svg)
- **UX-81 - Monday exception and action report:** [`desktop`](../wireframes/UX-81-stored-report-desktop.svg) / [`phone`](../wireframes/UX-81-stored-report-phone.svg)
- **UX-82 - Report versions:** [`desktop`](../wireframes/UX-82-report-versions-desktop.svg) / [`phone`](../wireframes/UX-82-report-versions-phone.svg)
- **UX-83 - No stored report for this date:** [`desktop`](../wireframes/UX-83-report-empty-desktop.svg) / [`phone`](../wireframes/UX-83-report-empty-phone.svg)

## This ticket builds

- Reporting date and computed preview
- Lead order: nonresponses; Not attending reasons; RSVP/attendance mismatches; absences/missing attendance; onboarding exceptions; uninvited-audience defects
- Stored events/statuses and response breakdown
- Attendance and current availability levels
- Snapshot metadata and immutable versions
- Stored-content-only report view

## Explicitly not in this ticket

- Repeated response issue
- Broad analytics dashboard
- Narrative availability or diagnosis
- Rewriting a prior snapshot
- Three-week horizon

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, re-read the live owning issue and comments and reconcile any changes recorded after Brian’s 12 August 2026 approval.
- In implementation review, provide LAN-81, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Owner amendment — 15 August 2026

Brian reviewed the built report over four rounds and changed what it is. The
full record, screen by screen, is in
[`../slice-ux.md`](../slice-ux.md) under **LAN-81 owner amendment**. In short:

- **UX-80 and UX-82 are withdrawn.** There is no preview step, no **Generate
  report** button and no version list. Opening `/operate/report` shows the
  report; pressing **Show Report** files a snapshot. Versions are still filed
  and still immutable — invariant M5 is untouched — and are never shown.
- **UX-81 and UX-83 are superseded** by the structure Brian specified: last
  week's events with RSVP counts and turnout, an attendance grid of people
  against events with two values per event, availability, next week, walk-ups,
  recruitment, onboarding, and the week in numbers.
- **One week forward** is added, read-only. This amends the criterion that the
  report adds no planning horizon; the three-week horizon stays LAN-109's.

The wireframes remain as the record of what was approved on 12 August. They are
no longer the specification for this route.

## Acceptance criteria

- The route renders for the correct role and record scope. UX-80 and UX-82 are
  withdrawn and render nowhere; UX-81 and UX-83 are superseded by the structure
  in the amendment above. This criterion is amended by that decision — it was
  written when four screens were expected.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).
