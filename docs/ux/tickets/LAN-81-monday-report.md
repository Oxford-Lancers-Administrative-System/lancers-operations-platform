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

## Decision history relocated from source (LAN-300)

### src/app/operate/report/page.tsx — `ReportPage` (module header)

> ## The order, and whose order it is
>
> Brian's, from the 15 August 2026 review, in his words: last week's events
> with their RSVP numbers and attendance percentage at the very top; then the
> people who need chasing, as a grid; then availability; then the week ahead;
> then walk-ups, recruitment and onboarding.
>
> Every heading names a thing the club already has a word for. There is no
> "Fix these things" — his objection to it was exact: those items "all look
> like events", so they are properties of an event's row, not a bucket of
> their own. A register nobody took is a missing percentage on that event. A
> person approved and never invited is a flag on that event.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/report/page.tsx — `ReportPage` (module header)

> ## It still reads a stored snapshot
>
> `readReportForDate` returns the snapshot filed for this date today, filing
> one first if today has not produced one. So the screen renders stored content
> and never a live recompute — invariant M5's whole point. The reader is never
> told any of that; one line at the bottom says the report is kept as it was.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/weekly-report.ts — module header

> The Monday report — locked Requirement 9, invariant M5. LAN-81.
>
> ## What it is, after Brian's 15 August review
>
> **A to-do list, not a dashboard.** The first build presented six counted
> exception categories and asked the operator to open each one; Brian's verdict
> on it was that it is "just lists of information, and it's not particularly
> well organized". So the report is now two lists in the club's own words —
> _chase these people_, _fix these things_ — with the onboarding backlog as a
> short third block, and nothing else competing with them.
>
> The six categories still exist: they are what the two lists are built from,
> and every one of them is still stored in the snapshot. What changed is that
> a category is no longer a thing the reader has to navigate.
>
> ## Versioning is real, and invisible
>
> Invariant M5 makes a published report immutable: `weekly_reports` is
> insert-only, has no `status` column, and derives "superseded" from a later
> row pointing at it. That is unchanged and unchangeable — but Brian's second
> verdict was that he should "just have a report for the day of, and that's
> it", and he was right that the version machinery had no business on screen.
>
> So the interface never mentions a version, and `readReportForDate` files one
> whenever **Show Report** is pressed — and only then, aside from the cases
> where nothing readable is on file. Arriving, sorting and refreshing show what
> is already stored. Nobody is asked about versions, and "what did leadership
> see on the 12th?" is answered by the snapshot they were looking at.
>
> The screen therefore still renders **stored content and never a live
> recompute** — the property the whole table exists for, and the one thing that
> would have been quietly lost by making the page "just show the numbers".
>
> ## Almost none of the query work is here
>
> Four of the five views the issue names carry it: `invitation_response_state`
> (invariant P7's partition, already excluding non-soliciting events per E6),
> `nonresponse_queue`, `uninvited_audience_members` and `current_availability`.
> This module composes them; it re-derives none of them. A second definition of
> "nonresponse" written here would drift from the one the attendance board
> reads, and the two would disagree in public.
>
> The fifth, `rsvp_attendance_mismatches`, was read here until LAN-151 and is
> not any more — the one place this module deliberately does derive something
> itself. The view answers "has this event occurred?" against `now()`, and it
> has no reporting date to work from, so reading it here would have made a
> report about last March depend on the day the report was asked for. A walk-up
> is an attendance row with no invitation behind it (invariant P6), which needs
> no occurrence test at all, so it is stated directly against
> `attendance_records` at the point of use. `attendance.ts` still reads the
> view, and remains its only reader.
>
> ## Privacy
>
> The snapshot contains the reasons people gave for **Not attending**, because
> the approved MVP boundary leads the report with them. It contains no
> availability narrative, no diagnosis and no free-text health field — the
> schema has no column capable of holding one, `tests/schema-security.test.ts`
> scans for one, and availability appears here as a count per level and nothing
> else. Nothing in this module exports, emails or distributes a report; the only
> reader is an operator holding `leadership_report`.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/weekly-report.ts — `METRIC_DEFINITION_VERSION`

> It has moved four times in a day, and each move earned it. `.1` was six
> counted exception categories; `.2` was two action lists; `.3` reorganised
> around events with a week either side; `.4` splits every event in the
> attendance grid into what somebody said and what they then did; `.5` turns
> onboarding into the same kind of grid.
>
> It is **not** the sixteen definitions recovered from the Master Table; the
> issue puts those out of scope.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/weekly-report.ts — `REPORT_WINDOW_DAYS` / `REPORT_LOOKAHEAD_DAYS`

> The forward half is a bounded amendment to LAN-81, made by Brian on 15 August
> 2026 after seeing the backward-only report — "we don't have to do the 3
> weeks, but can we do 1 week". It is deliberately **one** week and read-only:
> the three-week planning horizon, and anything that edits from here, remain
> LAN-109's. Both halves are printed on the report and stored in the snapshot,
> so no reader has to infer them and a later change is visible in old reports
> rather than retroactive.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/weekly-report.ts — `EventOutcome`

> The report opens with these because Brian opens the report with these: "I
> want to see the last week in attendance. I want to see the event. I want to
> see the RSVP numbers. I want to see the attendance percentage." Everything
> that used to live under a heading called "Fix these things" is a property of
> an event, so it is a property of this row.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/weekly-report.ts — `GridCell`

> Two values per event rather than one verdict, because Brian's whole reason
> for the section is the gap between them — "did they RSVP, or did they not
> RSVP? Did they attend, or did they not attend? We're looking for
> discrepancies there." A single collapsed state hides exactly the comparison
> he is making.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/weekly-report.ts — `WeeklyReportContent`

> Every section is named for a thing the club already has a word for — an
> event, a walk-up, recruitment, onboarding. Brian's instruction on 15 August
> 2026, after an abstract "Fix these things" bucket: "I'm organizing around
> things that they would know how to use."

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/weekly-report.ts — `readReportForDate`

> Brian's decision of 15 August 2026, taken after the cost was measured rather
> than guessed at — one snapshot is 6.6 KB stored and 36 ms of querying, against
> a full season of 110 events and 4,892 invitations. Being frugal about filing
> them was protecting the meaning of the version chain, not the disk.
> The screen therefore still renders **stored content and never a live
> recompute** — invariant M5's whole point, and the property that would have
> been quietly lost by making the page "just show the numbers".

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
