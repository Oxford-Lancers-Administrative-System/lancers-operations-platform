# LAN-80 - Attendance

Status: workflow direction approved by Brian on 12 August 2026; verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses, responses, and attendance records are synthetic and do not correspond to real members.

Approval evidence: [LAN-90 approval comment](https://linear.app/brian-schuster/issue/LAN-90/0-define-and-approve-the-minimum-ux-for-the-first-operational-vertical#comment-44f1c4de-cc9f-4708-86b3-b2ba555bf960) · [Notion approval record](https://app.notion.com/p/3ba488886d5781ed9adedd53635d1c6f)

## Purpose

Gate attendance on a human occurrence assertion and maintain one auditable attendance model for operators and LAN-110 coaches.

The current live LAN-80 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route                             | Audience                                |
| ------ | --------------------------------- | --------------------------------------- |
| UX-70  | `/operate/events/[id]`            | Authorized occurrence operator          |
| UX-71  | `/operate/events/[id]/attendance` | Authorized attendance operator          |
| UX-72  | `/operate/events/[id]/attendance` | Authorized attendance operator          |
| UX-73  | `/operate/events/[id]/attendance` | Authorized operator attendance recorder |
| UX-74  | `/operate/events/[id]/attendance` | Authorized attendance recorder          |
| UX-75  | `/operate/events/[id]`            | Authorized occurrence operator          |
| UX-97  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                    |

## Wireframes

- **UX-70 - Confirm what happened:** [`desktop`](../wireframes/UX-70-occurrence-decision-desktop.svg) / [`phone`](../wireframes/UX-70-occurrence-decision-phone.svg)
- **UX-71 - Attendance is not available yet:** [`desktop`](../wireframes/UX-71-attendance-locked-desktop.svg) / [`phone`](../wireframes/UX-71-attendance-locked-phone.svg)
- **UX-72 - Attendance · Team Practice:** [`desktop`](../wireframes/UX-72-attendance-roster-desktop.svg) / [`phone`](../wireframes/UX-72-attendance-roster-phone.svg)
- **UX-73 - Add walk-up attendance:** [`desktop`](../wireframes/UX-73-walk-up-capture-desktop.svg) / [`phone`](../wireframes/UX-73-walk-up-capture-phone.svg)
- **UX-74 - Correct attendance:** [`desktop`](../wireframes/UX-74-attendance-correction-desktop.svg) / [`phone`](../wireframes/UX-74-attendance-correction-phone.svg)
- **UX-75 - Event marked not held:** [`desktop`](../wireframes/UX-75-event-not-held-desktop.svg) / [`phone`](../wireframes/UX-75-event-not-held-phone.svg)
- **UX-97 - Add walk-up attendance:** [`desktop`](../wireframes/UX-97-coach-walk-up-desktop.svg) / [`phone`](../wireframes/UX-97-coach-walk-up-phone.svg)

## This ticket builds

- Mark occurred and Mark not held
- Attendance locked until occurred
- Present, absent, late and excused
- RSVP mismatch visibility without auto-reconciliation
- Immediate committed-value feedback
- Minimal walk-up identity with later reconciliation
- Operator walk-up UX-73 and capability-constrained coach variant UX-97
- Audited corrections and not-held completion

## Explicitly not in this ticket

- Coach occurrence assertion
- Time-inferred occurrence
- Full walk-up onboarding
- RSVP rewriting
- Medical or performance detail

## Shared walk-up model

UX-73 is the operator walk-up surface. UX-97 is the capability-constrained coach presentation of the same LAN-80 attendance model and traces to both LAN-80 and LAN-110. Both create a minimal temporary attendance identity for later reconciliation; neither performs full onboarding.

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, re-read the live owning issue and comments and reconcile any changes recorded after Brian’s 12 August 2026 approval.
- In implementation review, provide LAN-80, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).

## Decision history relocated from source (LAN-300)

### src/app/operate/events/[id]/attendance/page.tsx — `AttendancePage` (module header)

> ## One route, four screens, and the gate between them
>
> The screen registry gives all four `/operate/events/[id]/attendance`, and
> that is not an oversight: they are states of one thing. The event's status
> chooses between UX-71 and UX-72, `?add=walk-up` opens UX-73, and UX-74's
> correction happens in place on the row it belongs to — see
> `./attendance-row.tsx` for why that is not a fifth screen.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/attendance/page.tsx — `AttendancePage` (module header)

> ## Authorization, and the two things it is not
>
> The page gates on `attendance_recording` — the four calendar roles and the
> three coaching seats. See `./actions.ts` for why it is that union, and for
> the reading of § 8 this replaced: an ordinary-operator floor admitted an
> ordinary player who happened to hold an operator account, which is the thing
> LAN-80's own criterion says must be refused.
>
> That is not the boundary, and neither is this route. Every write re-resolves
> the operator from the verified session inside its own server action, and the
> service refuses any event that is not `occurred` after taking a row lock on
> it. A page rendered a minute ago against an occurred event whose assertion has
> since been corrected produces a refusal, not a write.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/attendance.ts — module header

> Attendance — locked Requirement 7, invariants P5, P6 and P8. LAN-80.
>
> ## The one rule the whole module exists to hold
>
> **A Yes never becomes a Present.** RSVP is intent and attendance is
> observation, and they are two authoritative records with no path between
> them. There is deliberately no function here that reads `rsvp_responses` or
> `current_rsvp` and writes `attendance_records`; the board below reads the
> standing answer only so a recorder can see it beside the person's name, and
> `tests/…/attendance.test.ts` asserts that a `yes` with nothing recorded stays
> absent from `attendance_records` entirely.
>
> The database agrees structurally: `attendance_records` has no foreign key to
> an invitation or a response, which is what makes invariant P6's walk-up — a
> person who was never invited and never answered — an ordinary row rather than
> an exception.
>
> ## What is enforced where
>
> Nothing in this file re-implements a rule the schema already carries, and the
> two that matter are worth naming:
>
> - **Invariant P5** — attendance belongs to an event that is really going
>   to have happened, and since LAN-151 occurrence is derived rather than
>   asserted (D30). The rule is in two halves, deliberately. The database
>   holds the part no legitimate write can produce: a cascading composite
>   foreign key plus
>   `check (event_status in ('approved', 'cancelled'))`, so no row in the
>   table has ever belonged to a draft, including rows written by a script
>   that never called this module. `cancelled` is inside that check since
>   LAN-156 because cancelling an event cascades its status onto the
>   register and W6 says those rows survive it — the event was approved when
>   the register was taken, and calling it off does not unmake that.
>
>   What the database therefore does _not_ hold is "attendance is only ever
>   created against an approved event". That is this module's, in
>   `closedReasonFor`, which every write path asks. A cancelled event's
>   register is closed.
>
>   The other half is the **clock**, which a check constraint cannot read, so
>   it is enforced here: the register opens on D71's buffer before the event
>   starts and never closes (D72), which `./attendance-window.ts` decides.
>   Note that this is deliberately _not_ "the date has passed" — a coach
>   standing at the pitch as people arrive is the person this surface exists
>   for, and refusing them until the evening is over would be a rule nobody
>   asked for. That half is a genuine service-layer guarantee rather than a
>   courtesy, which is why `requireOpenRegister` takes the row lock before
>   asking.
>
> - **Invariant P8** — player capacity anchors to the season membership;
>   coach, committee, guest and recruit anchor to the durable person. Held by
>   `attendance_records_anchor_matches_capacity`. This module never lets a
>   caller choose both: a target resolves to exactly one anchor, from rows
>   that already exist for the event.
>
> ## What a caller may name
>
> A recorder posts a **participant key**, and the key is resolved against the
> event's own invitations and its own attendance rows. It is not a pair of
> columns the browser fills in. That matters because the alternative — trusting
> a posted capacity and anchor id — would let anybody with a session record
> attendance for an arbitrary membership at an arbitrary event, which is a
> write against a person who was never involved. Adding somebody who genuinely
> was not invited is a separate, deliberate action: `recordWalkUpAttendance`.
>
> ## Mismatches are shown and never resolved
>
> `public.rsvp_attendance_mismatches` computes them and this module reads it.
> Nothing here writes, hides, suppresses or "reconciles" one — the frozen model
> says mismatches are "computed, surfaced as exceptions, and never silently
> reconciled", and a said-no-but-showed-up is a fact about the evening rather
> than a data-entry error to clean up.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/attendance.ts — `readAttendanceBoard`'s mismatch filter

> D74, and the defect it exists to prevent — LAN-152, corrected by LAN-165.
>
> The board on `main` once reported **zero recorded and thirty mismatches
> at the same time**, on every occurred event whose register nobody had
> opened. It is a counting fault rather than a display one, and it lives in
> one classification: `said_yes_no_attendance_recorded` fires per person,
> so a session nobody assessed came back as thirty separate accusations
> that thirty people had let the club down. An unrecorded event read as a
> bad one, which is the exact reading D74's two-state axis forbids.
>
> A mismatch is a **disagreement between two records**. Where the second
> record does not exist there is no disagreement — there is an absence,
> and the club already has a word for it: _not recorded_. That is true of
> every yes with nothing recorded, not only while the whole register is
> untouched: LAN-152's first fix suppressed the classification only when
> _nothing at all_ had been saved against the event, so the moment one
> person was recorded, every other unrecorded yes flipped back into a
> "mismatch" — a 47-invited, 29-yes event recording one matching Present
> moved Mismatches from a would-be 29 to 28, not to 0. `said_yes_marked_
absent`, `said_no_but_attended` and `attended_without_invitation` all
> require an attendance row to exist at all, so `said_yes_no_attendance_
recorded` is the only classification this view can emit for a person
> with nothing recorded — dropping it, per person, is both necessary and
> sufficient: it reads zero mismatches while the sheet is untouched (no
> other classification can fire yet) and it stops flagging an unrecorded
> yes the instant somebody else on the same sheet is saved.
>
> Filtered **here** rather than in `public.rsvp_attendance_mismatches`
> deliberately. The view is the durable home for this rule and it should
> carry it, but the view is schema, and this mission's schema belongs to
> the status-and-occurrence migration package; two packages writing
> migrations at once is what the collision rules exist to prevent.
>
> Nothing else over-counts in the meantime, and the reason is now narrower
> than it was: **this function is the view's only reader.** `weekly-report.ts`
> was the other one, and LAN-151 stopped it reading the view entirely,
> because the view derives occurrence against `now()` and a report about
> last March must not depend on today's date — it counts walk-ups straight
> off `attendance_records`.
>
> So the rule is applied wherever the view is read today, and what this
> filter protects against is a **future** reader: one written after this
> package, going to the view directly, and not looking here.
>
> That makes moving the rule into the view a real follow-up rather than a
> tidy-up: a direct reader of `rsvp_attendance_mismatches` written after
> this package, and not looking here, would over-count every unrecorded
> yes on a sheet somebody has started. It is recorded in the residual-risk
> section of the pull request that merges LAN-165.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/attendance/actions.ts — module header

> The attendance server actions — LAN-80.
>
> ## Which capability, and the one this file got wrong first
>
> `attendance_recording` — the union of the four calendar roles and the three
> coaching seats. `docs/ux/slice-ux.md` § 8 splits attendance in two and both
> halves land here:
>
> - **General attendance** — "Authorized operator after `occurred`". The
>   surface the Exec, the Secretary and the General Manager use, so gating it
>   on the narrow coaching grant would lock them out of their own screen.
>
> - **Coach attendance** — Brian's 12 August 2026 decision puts the Head
>   Coach, Offensive Coordinator and Defensive Coordinator on this workflow
>   explicitly, which is why those three seats are in the grant too.
>
> The first implementation used `requireOperator()`, the ordinary-operator
> floor, reading § 8's "authorized operator" as "any linked operator".
> Independent review showed that fails one of LAN-80's own criteria: Brian's
> coach decision requires that "an unauthorized coach and ordinary player are
> refused at the service boundary, including direct action calls", and a floor
> admitting every linked operator does not refuse an ordinary player who
> happens to hold an operator account. The floor was not merely generous; it
> was wrong against a recorded criterion.
>
> `attendance_recorder` stays the three coaching seats — plus, since LAN-124,
> the administrative IT Officer seat — and is untouched by this. It answers a
> different question — "is the constrained screen yours"
> — which LAN-110 asks. A Secretary holds `attendance_recording` and not that
> one, and gets the operator's board.
>
> ## What is still refused, and by whom
>
> - **The event's state.** Every write goes through the service, which locks
>   the event and refuses one that has not occurred — approved, with its date
>   passed (D30); underneath that, the cascading composite foreign key makes a
>   row against anything but an approved event impossible to write at all.
>   Two independent refusals, neither relying on the other.
>
> - **Who the write is about.** A posted participant key is resolved against
>   rows that already exist for _this_ event. A key naming somebody else's
>   membership is a `NotFound`, not a new attendance record.
>
> - **The occurrence assertion.** There is no longer one anywhere. LAN-151
>   retired it: an event has occurred when its date has passed and it was not
>   cancelled, and nobody types that. The rule it used to carry — a recorder
>   may say who turned up and may not say that there was anything to turn up
>   to — now holds because the second half is not a decision at all.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/actions.ts — recordAttendance

> Record attendance for an occurred event. The four calendar roles, plus the
> ten fixed coaching seats.
>
> The behaviour shipped in LAN-80 and lives in
> `src/app/operate/events/[id]/attendance/actions.ts`, beside the board that
> posts to it — same as `approveEvent` above.
>
> **The capability changed, and this line is why the change was caught.** This
> declaration said `attendance_recorder`, "HC/OC/DC only", from LAN-73 onward;
> LAN-80 first shipped the behaviour under `requireOperator()` and left this
> untouched, so the repository carried two different answers to "who may record
> attendance" and neither was the decision. Independent review found it here.
> Both now name `attendance_recording`, and `src/lib/auth/capabilities.ts`
> records what it grants and why.
>
> `attendance_recorder` is still LAN-110's and still answers a different
> question: not "may you record" but "is the constrained coach screen yours".
> LAN-129 widened both to all ten fixed coaching seats, per
> `REQ-coach-operator-onboarding`; the two grants still differ by the four
> calendar roles, which is the whole point of their being two.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/attendance/attendance-row.tsx — module header

> One participant on the attendance board — UX-72, and UX-74's correction in
> place. LAN-80.
>
> ## Why the correction is not a second screen
>
> UX-74 is "Correct attendance", and what it shows is the latest committed
> value, the four states, and a note that the correction changes attendance
> only. Every one of those is already on this row. Sending an operator standing
> at the side of a pitch to a separate screen to change Absent to Present —
> because they misheard a name in the dark — is the interaction the phone
> layout exists to avoid, and § 7 requires the four states to stay reachable at
> 375px. So the first save and the correction are the same control, and the
> difference between them lives in the audit trail where it belongs.
>
> ## Why each row is its own form
>
> § 9 wants `Saving…`, then the committed value with its actor and time, or a
> failure that keeps the unsaved selection visible beside what is really
> recorded. That is per-row state, and a single form around the whole board
> could only have one of it.
>
> Each button is a real submit carrying its own `value`, so the four states
> work with JavaScript disabled and with a screen reader driving the page. The
> pending state comes from `useActionState`, not from a click handler, so it
> cannot disagree with what the form is actually doing.
>
> ## What is on screen, and what is not
>
> The person's name, their standing RSVP, the four states, and the committed
> line. Not the reason behind a "no", not a contact detail, not an availability
> or injury note — none of which this row is given, because the service never
> selects them.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/attendance/attendance-row.tsx — RemoveAttendance

> Takes one attendance record away entirely.
>
> ## Why this is on the screen at all
>
> Because a row recorded against the wrong person, or against the wrong event
> in a list, is otherwise permanent. A save corrects an observation — "they
> were late, not absent" — and there is no save that means "there is no
> observation here at all".
>
> It also unblocks cancelling an event. Invariant P5's cascading foreign key
> refuses to move an event out of `approved` while attendance hangs off it, and
> the service's own refusal reads "remove them before changing what happened at
> the event". The service function existed from the start; the control did not,
> so that instruction was a dead end. Independent review found it, and this is
> the half that was missing.
>
> ## Why it is not one of the four buttons
>
> Removing a record is not correcting one. A correction says "they were late,
> not absent" and keeps the history; this says "there is no observation here",
> which is a real loss of evidence about who was at a practice. So it is behind
> a disclosure, the way abandoning a draft is, and it asks a question with the
> destructive answer second.
>
> It is still audited: `attendance.removed` records the actor and the value
> that was removed, so the deletion is itself part of the trail.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/attendance/attendance-groups.tsx — module header

> The board's three groups, and the disclosure over them — Brian, 14 August 2026. Which people are in which group, and why there are three, is in
> `groupParticipants` in `./presentation.ts`; this is only about opening and
> closing them.
>
> ## What is open when
>
> **Attending** is open, **Everyone else** is closed, **Walk-ups** is open, and
> the recorder can change any of them. That is the register's own shape: the
> people who said they were coming are the list you work through, the rest is a
> place to go when somebody turns up who should not have, and the walk-ups are
> the receipt for what you just did.
>
> ## Searching opens all of them, and closing the search puts them back
>
> A search that only looked inside the section you happened to have open would
> be a search that lies — the recorder types a name, sees nothing, and concludes
> the person is not on the event. So while a search is active every group is
> open regardless of what it was.
>
> And when the search is cleared they return to **what they were before it**,
> not to the default. That is the difference between a disclosure the recorder
> controls and one that resets itself under them: somebody who deliberately
> opened Everyone else, searched for a name and cleared the search would
> otherwise find it shut again.
>
> The reconciliation happens during render rather than in an effect, so the
> groups are already open in the render that first shows the results — see the
> note beside it.
>
> ## Why the groups are computed here and not on the server
>
> They are computed in `presentation.ts`, which both sides import; this
> component calls it. The reason it is called _here_ rather than in the page is
> the search: the page already filters, and grouping the filtered list in one
> place means the counts beside each heading always describe the rows actually
> under it. A count computed server-side before filtering would say 14 above a
> section showing one.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/attendance/attendance-groups.tsx — DEFAULT_OPEN

> Recruits open, Attending open, Everyone else closed — and **Walk-ups open**.
>
> Recruits is open for the same reason Attending is — Brian, on the fidelity
> mockup: "recruits open because they are the point of a recruitment event."
>
> Walk-ups is not an inconsistency with Everyone else being closed. A walk-up
> group is empty at almost every event, and an empty group is not drawn at
> all, so the open state costs nothing until there is something in it. When
> there is, it is because the recorder just added somebody thirty seconds ago
> and was returned to this board to see it: closing the only confirmation
> that the walk-up was recorded would be the one place a disclosure actively
> hides what the operator did.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/attendance/action-state.ts — module header

> What the attendance forms hand back to the screens.
>
> Beside `actions.ts` rather than in it: a `"use server"` module may only
> export async functions, so a shared constant or a type exported from there
> would be a build error. Same split as `../../form-state.ts`.
>
> This module and `./presentation.ts` are the only things the client components
> import besides the service layer's _types_, so nothing here drags `pg` into
> the browser bundle.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/attendance/attendance-filter-logic.ts — module header (filterParticipants)

> The board's filters, applied in memory.
>
> In memory rather than in SQL because the list is one event's audience — tens
> of people, already read in full to compute the counts above — and a recorder
> switching filters mid-evening should not re-run a `full outer join` for it.
> The counts deliberately describe the **whole** event rather than the filtered
> view, so a filter never makes the club look like it invited fewer people.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/attendance-vocabulary.ts — file header

> The attendance vocabulary and the shapes the screens render — pure, and with
> no import that reaches a database. LAN-80.
>
> ## Why this is a separate module
>
> `./attendance.ts` is `server-only` and imports `@/lib/db`, which imports
> `pg`. The attendance board's four state buttons are a **client** component —
> they need `useActionState` for the Saving/Saved/failed line — and a client
> component that imported the four state names from the service would drag the
> PostgreSQL driver into the browser bundle. The build says so, in exactly
> those words.
>
> So the split is the same one `./event-input.ts` already makes for the event
> form, for the same reason: values the browser needs live in a module with no
> server dependency, and `./attendance.ts` re-exports every one of them so a
> server caller never has to know the split exists.
>
> Nothing here decides anything. It is names, and the shape of a row.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
