# LAN-110 - Coach attendance

Status: workflow direction approved by Brian on 12 August 2026; verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses, responses, and attendance records are synthetic and do not correspond to real members.

Approval evidence: [LAN-90 approval comment](https://linear.app/brian-schuster/issue/LAN-90/0-define-and-approve-the-minimum-ux-for-the-first-operational-vertical#comment-44f1c4de-cc9f-4708-86b3-b2ba555bf960) · [Notion approval record](https://app.notion.com/p/3ba488886d5781ed9adedd53635d1c6f)

## Purpose

Give active Head Coach, OC and DC assignments a narrow recorder over LAN-80 attendance after occurrence.

The current live LAN-110 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route                             | Audience                                   |
| ------ | --------------------------------- | ------------------------------------------ |
| UX-90  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |
| UX-91  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |
| UX-92  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |
| UX-93  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |
| UX-94  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |
| UX-95  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |
| UX-96  | `/operate/events/[id]/attendance` | Signed-in coach without LAN-110 capability |
| UX-97  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |

## Wireframes

- **UX-90 - Attendance is not open:** [`desktop`](../wireframes/UX-90-coach-occurrence-locked-desktop.svg) / [`phone`](../wireframes/UX-90-coach-occurrence-locked-phone.svg)
- **UX-91 - Team Practice attendance:** [`desktop`](../wireframes/UX-91-coach-attendance-desktop.svg) / [`phone`](../wireframes/UX-91-coach-attendance-phone.svg)
- **UX-92 - Team Practice attendance:** [`desktop`](../wireframes/UX-92-coach-saving-desktop.svg) / [`phone`](../wireframes/UX-92-coach-saving-phone.svg)
- **UX-93 - Team Practice attendance:** [`desktop`](../wireframes/UX-93-coach-saved-desktop.svg) / [`phone`](../wireframes/UX-93-coach-saved-phone.svg)
- **UX-94 - We could not save this change:** [`desktop`](../wireframes/UX-94-coach-save-failed-desktop.svg) / [`phone`](../wireframes/UX-94-coach-save-failed-phone.svg)
- **UX-95 - Correct attendance:** [`desktop`](../wireframes/UX-95-coach-correction-desktop.svg) / [`phone`](../wireframes/UX-95-coach-correction-phone.svg)
- **UX-96 - You cannot record attendance for this event:** [`desktop`](../wireframes/UX-96-coach-unauthorized-desktop.svg) / [`phone`](../wireframes/UX-96-coach-unauthorized-phone.svg)
- **UX-97 - Add walk-up attendance:** [`desktop`](../wireframes/UX-97-coach-walk-up-desktop.svg) / [`phone`](../wireframes/UX-97-coach-walk-up-phone.svg)

## This ticket builds

- Post-occurrence gate
- All four attendance states and corrections
- Saving, Saved and failed-save feedback
- Latest committed value, last actor and time
- Capability-constrained minimal walk-up UX-97 reusing LAN-80
- Unauthorized-coach denial
- Attendance-only navigation and no unrelated or sensitive fields

## Explicitly not in this ticket

- Mark occurred or Mark not held
- Second attendance workflow
- Roster/contact/availability access
- RSVP reasons
- Event administration
- Position-coach access by inference

## Capability-constrained walk-up

UX-97 is the coach-only variant of LAN-80 walk-up capture. It stays on `/operate/events/[id]/attendance`, uses attendance-only navigation and displays only event context, minimal walk-up identity, one of the four attendance states and the later-reconciliation notice. UX-73 remains the operator variant and is not weakened or replaced.

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, re-read the live owning issue and comments and reconcile any changes recorded after Brian’s 12 August 2026 approval.
- In implementation review, provide LAN-110, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Recorded deviations — Brian, 14 August 2026

Four, all decided by Brian while reviewing the built screens, and all
deliberate. The wireframes above are not re-drawn; this section is the record,
and it is what an implementation review should be read against.

### 1. The register is read in groups, not as one list

UX-72 and UX-91 both show a flat list of participants. The built screens group
it, and the operator's board is grouped the same way — Brian's answer when asked
whether it applied to both was "both boards".

| Group             | Holds                                  | Open by default |
| ----------------- | -------------------------------------- | --------------- |
| **Attending**     | Standing RSVP of yes                   | Yes             |
| **Everyone else** | Not attending, and no response         | No              |
| **Walk-ups**      | No invitation at all; recorded present | Yes             |

Each group is sorted by name. A search opens every group and clearing it
restores what they were, so a name is never hidden behind a closed disclosure.
Pressing an attendance state never moves anybody between groups: the split is by
standing RSVP and by whether there was an invitation, never by what was
recorded.

**Why walk-ups are their own group rather than in either other one.** Brian's
instruction was that a walk-up "should be its own separate group that attended
and should automatically be marked as present". It could not have gone in
either: "Everyone else" says the club was not expecting them, next to people who
are not there, and **Attending** means _said yes_ throughout this product.
Locked Requirement 7 and `../slice-ux.md` § 6 both hold intent and reality
apart — "a Yes never becomes Present automatically" — so filing somebody who
turned up under the word for what they answered would be the conflation the
frozen model forbids.

### 2. The walk-on form was rebuilt, and a walk-on goes into recruitment

UX-73 and UX-97 show one **Name** field, one combined **Email or phone** field,
an **Attendance** selector and a **Possible roster match** dropdown. None of
those survives.

| Field          | Required | Notes                                         |
| -------------- | -------- | --------------------------------------------- |
| **First name** | Yes      | Same label and order as `/operate/roster/new` |
| **Last name**  | Yes      | Stricter than intake — see below              |
| **Phone**      | Yes      | How the club follows them up                  |
| **Email**      | No       |                                               |

Brian, on the built screen: "it should be almost identical to adding a player…
first name, last name, phone, and email, to grab as much as they can". The
roster match went with it — "they know who's on their roster, there are only 40
people" — so a walk-on is always a new person and a duplicate is
reconciliation's problem.

**Required is stricter than the returner intake, on purpose.** Intake asks only
for a first name, because the club's own files are full of records that never
had more, and `people.family_name` is nullable for that reason. A walk-on is the
opposite case: nobody knew them ten minutes ago and the point of writing them
down is that somebody follows them up, so a walk-on with no surname and no
number is a row nobody can act on.

**No attendance state is asked for.** A walk-on is recorded **Present** and the
form says so; the four buttons on their row correct it afterwards. The value is
fixed in the server action rather than defaulted in the form, so a `presence` in
a crafted request body changes nothing.

**What it writes.** The person, their contact points, and a
`recruitment_prospects` row at `identified` naming the session as its source —
and **no season membership**. "Not in the roster, not in the season roster, but
in the person in the recruitment… they're not on the team yet." All three in one
transaction. Attendance capacity moved from `guest` to `recruit` to match.

LAN-85 still owns everything after this point: following the prospect up,
converting them, and what the club does with them across future events. Brian's
stated intent is that a walk-on becomes part of the recruitment list that future
events draw on; the audience builder has no recruit group today, and building
one was deliberately left out of this ticket.

### 3. The coach's list looks forward, and is no longer occurred-only

UX-91's sidebar reads **Occurred events only**, and the built screen does not.
Brian, on the review: "We should be looking forward… I want to see what's coming
up, and anything before today is just Earlier. That's it."

Two sections — **Upcoming** (today first, badged and outlined, then everything
ahead of it soonest first) and **Earlier** (before today, most recent first).

This required the list to include sessions that have **not** been marked
occurred, because an event that has not happened cannot have been asserted to
have happened and a forward-looking list of occurred events is permanently
empty. Those cards say **Attendance not open** and open UX-90 rather than a
register.

**What it widens, exactly.** A coaching assignment now sees the name, date and
venue of approved sessions as well as occurred ones — the club's own fixture
list, for sessions the coach is running. It does not widen anything else: no
audience, no responses, no counts, no draft, pending, rejected, withdrawn,
cancelled or not-held event, and no way to change any of it. `/operate/events/[id]`
still refuses a coach outright, and every § 3 exclusion — roster, contact,
RSVP reasons, availability, delivery, reports — is unchanged.

### 4. Removal is not offered to a coach

Not a wireframe deviation so much as a boundary worth recording here too.
**Remove this record** exists to unwind an occurrence assertion, which LAN-110's
fixed boundaries keep away from a coaching assignment, so the control is not
rendered for one and `removeAttendanceAction` guards on
`event_occurrence_assertion`. The four calendar roles are unaffected.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).

## Decision history relocated from source (LAN-300)

### src/app/operate/events/[id]/attendance/page.tsx — `AttendancePage` (module header)

> ## What this page never puts in the payload
>
> A reason behind a "no", a contact detail, an availability or injury note, a
> delivery diagnostic, or anything about the roster beyond a name. Not filtered
> out here — never selected. `slice-ux.md` § 3 forbids every one of them on this
> surface for a coach, and there is no second version of this payload for
> anybody else, so the rule cannot be true on one path and false on another.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/destinations.ts — COACH_DESTINATIONS

> The whole of a narrow attendance recorder's navigation — UX-91's sidebar and
> its phone bottom bar, both of which show exactly one destination. LAN-110.
>
> `slice-ux.md` § 3: a coaching assignment "receives only the occurred-event
> attendance surface. No general operator navigation …". One entry is what
> "only" means, and the second line says what is behind it.
>
> The wireframe's own second line was **Occurred events only**, and it stopped
> being true on 14 August 2026: Brian asked for the list to look forward, which
> a list of occurred events cannot do — see `./coach-event-buckets.ts`. The
> deviation is recorded in `docs/ux/tickets/LAN-110-coach-attendance.md`.
>
> It reuses `/operate/events`, and that is not a shortcut. § 4's route contract
> is closed, and adding `/operate/attendance` to it would be a UX change this
> ticket is explicitly forbidden from making ("Do not add a new role,
> destination, workflow, field, status, or delivery action without a recorded
> design decision"). The route is shared and the _presentation_ is
> capability-scoped, exactly as § 4 says of the attendance route itself.
>
> The label is **Attendance** rather than Events because that is what the
> wireframe shows and what the destination is for a coach: the list is filtered
> to occurred events, and every row leads to an attendance board.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/shell-nav.tsx — module header, "Exactly one navigation landmark"

> The shell's navigation — LAN-195. One element set, laid out two ways by CSS
> rather than rendered twice: a sticky sidebar from `md` up, a hamburger-opened
> left drawer below it. Replaces the fixed bottom bar LAN-195 retired, which at
> 375px carried nine equal-flex destinations in illegible ~41.6px slots — see
> `docs/ux/slice-ux.md` § 7's LAN-195 amendment and the approved mockup on
> `chore/nav-drawer-mockup`.
>
> ## Exactly one navigation landmark, always — never a hidden second one
>
> There is one `<nav aria-label="Operator">` in this file and it is mounted
> unconditionally. MUI's own stock responsive-drawer example mounts a
> `permanent` `Drawer` and a `temporary` `Drawer` side by side, one hidden by
> CSS: `display: none` does pull an element out of the accessibility tree, but
> while both are mounted there are still two sets of `Link`s in the DOM and two
> places a test — or a screen reader landmark list — can find navigation. This
> component never builds that second copy. `open` only ever toggles whether
> the one nav is _reachable_; it never causes a second one to exist.
>
> ## No hydration flash — solved without `useMediaQuery`
>
> The approved mockup branched on a `useMediaQuery` read to choose between the
> sidebar and the drawer, and its own README named the cost: server-rendered
> HTML reflects whatever the media query resolves to before hydration —
> mobile, absent a match — which can read as a one-frame flash at desktop
> width. This component makes no such read. `open` is a plain `useState(false)`
> with no viewport dependency at all, so the server and the freshly-hydrated
> client always agree on it, and the desktop/phone _geometry_ (`position`,
> `width`, `top`) is decided entirely by the same CSS breakpoints the sticky
> sidebar already used — a browser paints the final, correct layout on first
> paint, the same way it already does today. Nothing here waits on JavaScript
> to decide which layout to show.
>
> The one piece of `open`-driven state that _is_ visible in the exported
> styles — `visibility` and `transform`, both set unconditionally below and
> then forced back to their desktop values inside an explicit
> `theme.breakpoints.up("md")` block — is deliberately written this way rather
> than as an ordinary `{ xs, md }` breakpoint object. An ordinary breakpoint
> object wraps _every_ key, `xs` included, in its own `@media` query, and a
> property that only exists inside a media query cannot be asserted by a
> closed-drawer regression test without also faking a real browser viewport.
> Writing the mobile-default value unconditionally, with the desktop value as
> an explicit override, keeps exactly the same real-browser result (the `md`
> override wins at desktop width, by ordinary CSS cascade) while leaving the
> unconditional declaration directly assertable.
>
> ## What changed from the retired bottom bar, and why
>
> Brian's four approved choices from the mockup (2026-08-30): the top bar
> carries only the hamburger, three dismiss paths (an explicit close control,
> backdrop tap or Escape, and selecting any destination), a 280px drawer
> (wider than the 226px desktop sidebar — real labels like "Messaging
> schedule" were cramped at 226), and the secondary detail line now rendering
> at phone width too, which was hidden before only because the 48px bottom-bar
> row had nowhere to put it. All four are structure and copy the mockup
> settled; this component builds them against the application's own MUI/`sx`
> conventions rather than the mockup's own styling.
>
> A client component only because the current destination has to be
> highlighted and the drawer's open/closed state has to live somewhere. It
> receives a display name and nothing else — no roles, no ids, no email —
> because a client component's props are serialized into the page and are
> readable by anyone who has it.
>
> **This is not an authorization boundary and must never become one.** Every
> destination guards itself server-side; hiding a link would be a courtesy.
> All three are shown to every operator, per `slice-ux.md` § 3.
>
> The one exception § 3 itself writes is the coaching assignment, which
> "receives only the occurred-event attendance surface". That is why the
> destinations arrive as a prop rather than being imported here: LAN-110's
> coach shell is a different _list_, resolved on the server from the verified
> session, and a client component must not be the thing that decides it. The
> section and role captions travel the same way and for the same reason.
>
> What arrives is still display text and hrefs alone — no role codes, no
> capability map, no ids — because a client component's props are serialized
> into the page and readable by anyone holding it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/coach-not-permitted.tsx — module header

> UX-96 — an active operator who cannot record attendance, on the attendance
> route. LAN-110.
>
> ## Why this is not UX-05 with different words
>
> UX-05 tells an operator that _an action_ is closed to them and points at a
> destination that is not. This screen answers a narrower question — "may I
> take the register for this event?" — and the wireframe's copy is specific in
> a way the general refusal cannot be: it names the three assignments that
> carry the capability, and it states what the page is **not** showing, which
> is the half a coach standing at the side of a pitch actually needs to hear
> before they go and find somebody who can.
>
> ## What it says about the reader
>
> Nothing it does not already know. "This account does not have an active Head
> Coach, Offensive Coordinator or Defensive Coordinator assignment" is a
> statement about the requirement and about the verified holder's own account.
> It names no other person, no other account, and nobody who does hold the
> seat — the same rule `guards.ts` keeps for every refusal in the slice.
>
> ## The recovery action
>
> The wireframe shows **Sign out** alone, and for the reader it was drawn for —
> a coach whose seat has ended, who has nowhere else in the shell to go — that
> is the whole of it. `returnHref` is offered only when the operator genuinely
> has a destination they can open, because `slice-ux.md` § 7 forbids removing a
> recovery action and sending somebody to sign out when they had somewhere to
> be would be exactly that. When there is nowhere, the screen is the wireframe.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/coach-event-list.tsx — module header

> The coaching assignment's event list. LAN-110.
>
> It reads through `listCurrentSeasonEvents` — the same service, the same season
> resolution, the same query — rather than through a second reader of its own,
> and filters the statuses in `./coach-event-buckets.ts`. LAN-110's own criterion
> is that "no code path duplicates LAN-80's attendance model", and a private
> events query for coaches would be the first step towards two answers to "which
> events are there".
>
> It reads the unguarded service call rather than `listEventsForOperator`, and
> that is not a gap: the page's own gate has already resolved this coach as a
> linked, active operator, and calling the guard again would resolve the same
> session a second time to reach the same answer. What the coach may _see_ is
> narrowed below and in `./coach-event-buckets.ts`, which is where LAN-110 put
> it — approved and occurred, no status from the query string, and none of the
> counts.
>
> A function the page awaits rather than a component it returns. An async
> component element returned from another async component is resolved by the
> framework but not by a direct `render(await Page())`, so writing it that way
> would have made the coach's list untestable at exactly the level the rest of
> this screen is tested at.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/attendance/actions.ts — removeAttendanceAction

> Removes one attendance record.
>
> The only way to unwind an occurrence assertion made against the wrong event:
> a row recorded against the wrong person is otherwise permanent, and an event
> carrying attendance cannot be cancelled until it is gone. It is not the way to
> change somebody's state — that is a save, which is audited as a correction and
> keeps the history.
>
> ## Why this one guards on the calendar, and the other two do not. LAN-110
>
> Because removing a record is an act on the club's record of an event rather
> than an observation about a person, and LAN-110's boundary puts changes to
> the calendar's record outside what a coaching seat holds.
>
> It is also not in what LAN-110 permits. The capability is "record and correct
> Present, Absent, Late or Excused"; a correction keeps the observation and the
> history, and a removal destroys the evidence that anybody watched at all.
>
> This narrows LAN-80, which had removal on `attendance_recording`, and narrows
> nothing else: the four calendar roles that could remove a record still can.
>
> The guard was `event_occurrence_assertion` until LAN-151 retired it, and is
> now `event_calendar_management`. The boundary is unchanged, deliberately and
> verifiably: the two capabilities carry the identical role list — President,
> Vice-President, Secretary, General Manager and IT Officer — so exactly the
> same people may remove an attendance record as before, and no coaching seat
> may.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/coach-event-buckets.ts — module header

> How the coach's list is ordered — Brian, 14 August 2026.
>
> "We should be looking forward… I want to see what's coming up, and anything
> before today is just Earlier. That's it."
>
> Two sections, and no third:
>
> - **Upcoming** — today, then everything ahead of it, soonest first. Today's
>   sessions are badged and drawn out of the page, and sorted to the top of
>   the section, because the register a coach opens the application to fill
>   in is almost always one of them.
> - **Earlier** — everything before today, most recent first, because the
>   other reason to open this is to correct the session you were at last
>   week.
>
> ## Why this list is not occurred-only
>
> It cannot be. Looking forward means showing events that are not yet open, and
> saying so on the card: they carry **Attendance not open**, and opening one
> gives UX-90 rather than a register.
>
> The two sections and the open/not-open line are **not** the same question,
> and W-F1 is what happens when they are treated as one. Which section a
> session sits in is about the day — today and ahead, or behind. Whether its
> register may be opened is about the instant, six hours before it starts
> (D71). For several hours of every session's own day the honest answers differ:
> it is in **Upcoming**, and its register is open.
>
> That is a widening of what a coaching assignment sees, and it is recorded as
> a deviation in `docs/ux/tickets/LAN-110-coach-attendance.md`. What it adds is
> the club's own fixture list — a name, a date and a venue for sessions the
> coach is running. It adds no audience, no responses, no counts, and no way to
> change anything: `/operate/events/[id]` still refuses them outright.
>
> ## What is deliberately not in either section
>
> A draft, and a cancelled event. Neither is a session anybody is going to;
> showing a coach the calendar's unfinished drafts would be the event
> administration § 3 withholds, and listing a cancelled game under Upcoming
> would be worse than not listing it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/coach-event-buckets.ts — isOpenForAttendance

> Can a register be opened for it yet? Drives the "Attendance not open" line.
>
> **The same question the register itself asks**, through the same function —
> finding W-F1, and the reason it is worth a paragraph. This used to ask
> `hasOccurred`, which compares _dates_: it answered "not open" for the whole
> of the day a session happens, while the register — moved to D71's buffer,
> which is an _instant_ six hours before the start — was open, working, and
> reachable from the operator's event page.
>
> What that cost is the whole point of the mission. At 19:45 on a Wednesday,
> with tonight's 20:00 practice open for recording since 14:00, the coach's
> only screen said attendance was not open. The card went on saying it until
> the following day.
>
> So the coach's card, the event page's panel and the register are one
> function with three call sites. `registerSaved` is carried on the list entry
> for exactly this: D72 says a register with anything in it never closes, and
> a card that dropped that half would disagree with the register again, more
> quietly.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/gate.tsx — module header

> The gate every page under `/operate` opens with.
>
> One implementation, called by each page, rather than three lines copied into
> each page: a screen that forgets one of the four outcomes is the way this
> kind of boundary fails, and the failure is silent. Here there is one place to
> read and one place to review.
>
> It is not a replacement for the layout's own check — it is the second of two
> independent checks. The layout guards the frame; this guards the page. Either
> refuses on its own, and neither depends on the other having run.
>
> The four outcomes:
>
> - **no session** — redirect to `/login`, preserving this route so the
>   operator lands where they were going.
> - **unlinked / deactivated** — the approved account state, and no page
>   content at all.
> - **active, capability refused** — UX-05, naming what the action requires.
>   The refusal comes from `assertCapability()` throwing, not from an `if`
>   written here: the page renders the refusal, the guard makes it.
> - **active and permitted** — the operator, for the page to use.
>
> `capability` is omitted for the ordinary operator surfaces (§ 8's first row).
> Omitting it means "any linked, active operator", never "anybody".
>
> ## The fifth outcome: a narrow attendance recorder. LAN-110
>
> `slice-ux.md` § 3 gives an operator whose only authority is coaching _one_
> surface, and a capability check cannot express that on its own: Roster and
> the event detail are open to every linked operator, so there is no capability
> for a coach to fail. `options.narrowRecorder` is that decision, and it
> defaults to `"refuse"` — a page says nothing and is closed to a coach.
>
> Defaulting closed is the whole value of putting it here. The alternative,
> listing the surfaces a coach may not open, is a list that a page added next
> year is silently absent from, and the failure is a coach quietly holding the
> roster. This way the failure is a coach refused a screen they should have
> had, which somebody reports on the first day.
>
> Two surfaces opt in, and they are the two § 3 names: the attendance board,
> and the event list that reaches it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
