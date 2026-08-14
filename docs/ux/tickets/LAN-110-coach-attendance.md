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

### 2. The walk-up form no longer asks for an attendance state

UX-73 and UX-97 both show an **Attendance** selector. It is gone: a walk-up is
recorded **Present**, the form says so, and the four buttons on the row it
creates correct it afterwards like anybody else's. Somebody is being typed into
that form because they are standing in front of the person typing.

The value is fixed in the server action, not merely defaulted in the form, so a
`presence` in a crafted request body changes nothing.

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
