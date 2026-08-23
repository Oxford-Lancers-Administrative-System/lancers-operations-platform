# LAN-154 — Event authoring, questions, deletion, and the seven type templates

Status: implemented under mission `M-EVENTS-CALENDAR-TARGET-STATE`, work package
`WP-authoring`. Packet approved by Brian Schuster on 2026-08-21; amendment W4-A1
approved the same day; the duplicate decision settled 2026-08-22.

> **Synthetic scenario data:** All displayed people, contact details, statuses,
> responses and attendance records are synthetic and do not correspond to real
> members.

## Purpose

Write an event down, decide what its audience will be asked, approve it, or
delete it — and set once, per type, what all of that starts as.

This contract is the durable record of what was built. It supersedes the parts
of [`LAN-76-event-creation.md`](LAN-76-event-creation.md) and
[`LAN-77-event-approval.md`](LAN-77-event-approval.md) named under **What this
reverses**, and leaves the rest of both standing.

## Sources, in order of authority

1. `LAN-154` in Linear.
2. `missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/workflows/W4-draft-an-event-and-approve-it-with-its-audience.md`,
   including amendment **W4-A1**.
3. `missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/workflows/W8-administer-event-type-templates.md`.
4. Both mockups in `missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/mockups/`.
5. [`../slice-ux.md`](../slice-ux.md) and [`../standards.md`](../standards.md).
6. `LAN-76-event-creation.md` and `LAN-77-event-approval.md`, as amended below.

## Owned screens and routes

| Screen  | Route                                | Audience                       |
| ------- | ------------------------------------ | ------------------------------ |
| `W4-01` | `/operate/events/new`, `…/[id]/edit` | Authorized event operator      |
| `W4-02` | `/operate/events/[id]?step=audience` | Designated event approver      |
| `W4-03` | `/operate/events/[id]?step=review`   | Designated event approver      |
| `W4-04` | `/operate/events/[id]`               | Authorized event operator      |
| `W4-05` | `/operate/events/[id]` (dialog)      | Authorized event operator      |
| `W4-06` | `/operate/events/[id]?step=review`   | Designated event approver      |
| `W8-01` | `/operate/events/templates`          | Operator with event management |
| `W8-02` | `/operate/events/templates/[type]`   | Operator with event management |
| `W8-03` | `/operate/events/templates/[type]`   | Operator with event management |

`W4-05` and `W8-03` are dialogs over the screen they belong to, and `W4-06` is
the review step's refusal state. Neither is a new destination: the shell still
offers Roster, Events and Report, and the templates surface is reached from the
Events list, which is what D40's "an admin surface behind the Events area" means.

## What this reverses, and what it leaves standing

**LAN-77's "the audience begins empty" is reversed, narrowly.** D47 gives a
type's template a default audience, which arrives with the event already set,
visible and editable, so the approver checks rather than builds. The audience
builder's own copy said otherwise and has changed with it.

What survives unchanged is the part ADR 0012 was actually about: the _system_
still never implies an audience. There is no whole-roster fallback and no "if
none selected then everyone". A template's default is a choice the club made
once, on purpose, and the builder names the template that made it. The stored
audience is still an explicit resolved list of people, not a live query.

**LAN-76's "attendance has no default" is reversed.** D15 makes name, type and
date the minimum to save, and W8 puts mandatory-or-optional on the type's
template. The control now opens on the template's answer, and on **Optional**
where the template does not say — which claims nothing, and is the direction the
original rule was protecting. An unanswered attendance saves as optional rather
than refusing the draft.

**The approval review no longer explains what approving does.** Brian,
2026-08-21: _"You don't really have to explain what approving does because we
already know what it is … That's over-explaining for no reason."_ The paragraph
about confirming the list, creating invitations, queueing delivery and freezing
the audience is gone, and nothing replaced it.

Everything else in both tickets stands, including the empty-audience refusal
(invariant E1b), the audience being proposed on the draft and frozen at approval
(ADR 0022), one person one invitation, and the group buttons' behaviour.

## What each screen does

### `W4-01` — the event form, create and edit

- **Name, type and date are the minimum to save** (D15). Everything else may be
  left, and `TBD` is a legitimate value for a venue or a time.
- **The type's template fills the form in**, field by field, and changing the
  type replaces **only the fields nobody has touched** (D41). Picking the wrong
  type first does not cost an operator the description they just wrote.
- **Description and required equipment are separate fields** (D17, D18).
- **In person or online is a property**, and the venue field takes an address or
  a destination accordingly (D20, D21). A joining link exists only for an online
  event and is never public.
- **Times are five-minute increments, in Europe/London, with the zone stated**
  (D78, D86). Entering a start fills the end from the type's default length; an
  end the operator sets is left alone.
- **`Response requested` appears nowhere** (D23).
- **Questions are written here** (W4-A1), below the event's own facts: add,
  remove, reorder, choose one of three answer types, and mark each independently
  required or optional. A question the template supplied is marked as such and
  may be removed for this event alone (D42).
- Two submit buttons: **Save draft**, and **Save and choose audience**.

### `W4-02` — the audience

The four standing groups (D43), plus a **recruits group on the Recruitment type
alone** (D46). The unit control filters who is on screen and creates no group
(D44). Inactive people are never offered (D45). The sentence under the heading
names the template that supplied the default audience, or says nothing arrived.

### `W4-03` — the approval review

- **The audience is named by its groups before its people** — "All active
  players, all coaches — 35 people" — and the names follow underneath. A group
  that is only partly selected is never named; people chosen by hand are counted.
- **The questions appear exactly as a player will meet them**, led by the RSVP's
  own "Are you coming?", because approving an event means approving what those
  people are about to be asked.
- **Nothing explains what approving does.**

### `W4-04` and `W4-05` — the draft's page, and deleting it

**Delete lives on the draft's own event page** (Brian, 2026-08-21), low emphasis
and destructive — not on the create form, where there is nothing yet to delete.
The confirmation names the event, says it cannot be brought back, and says
nobody will be told because nobody was told in the first place.

It deliberately does **not** say that an approved event cannot be deleted. That
rule appears where somebody runs into it.

**Duplicate** (D39) opens the create form prefilled from the source event and
writes nothing until the operator saves. The date is deliberately not copied.

### `W4-06` — the refusals

- **Empty audience** — retained exactly as LAN-77 shipped it.
- **A missing required field**, named, with the route that fixes it.
- Both are enforced in the service layer, so they hold when the screen is
  bypassed and the service is called directly.

### `W8-01` to `W8-03` — the templates

Seven types, seven templates, **none created and none deleted**. Every field is
optional. A template carries a default audience, questions, where, a **default
length** rather than a start time, equipment, description and mandatory — and no
name, no date and **no RSVP timing of any kind**, which is Mission 4's.

Before saving, the operator sees which drafts will take the change, **which will
not and why**, and what will not move at all. The button says what it will do.

## Decisions this contract records

| Decision                                                                        | Source                             |
| ------------------------------------------------------------------------------- | ---------------------------------- |
| Minimum to save a draft is name, type and date                                  | D15                                |
| Approval is the completeness gate                                               | D16                                |
| **Required at approval: the date, and a non-empty audience — and nothing else** | See below                          |
| A type's template supplies a default audience                                   | D47, reversing LAN-77              |
| Four standing groups, plus recruits on Recruitment alone                        | D43, D46                           |
| No unit or kit groups; the unit control filters                                 | D44                                |
| Inactive people are never invited                                               | D45                                |
| Description and required equipment are separate fields                          | D17, D18                           |
| Online or in person is a property; venue follows it                             | D20, D21                           |
| `Response requested` is removed                                                 | D23                                |
| Five-minute increments; end follows start; Europe/London stated                 | D78, D86                           |
| Template values flow per field into unapproved drafts; approval freezes them    | D41, refined 2026-08-21            |
| No approved event and no past event ever changes                                | W8                                 |
| An abandoned draft is deleted, permanently, after a confirmation naming it      | D29                                |
| Only a draft may be deleted; an approved event is cancelled                     | D29, W6                            |
| Delete lives on the draft's own page                                            | Brian, 2026-08-21                  |
| The delete dialog does not pre-announce the approved-event rule                 | Brian, 2026-08-21                  |
| The approval review does not explain what approving does                        | Brian, 2026-08-21                  |
| Duplicate opens the create form prefilled and writes nothing                    | D39, Brian 2026-08-22              |
| Three answer types; each question independently required                        | D66, D67                           |
| Template questions arrive marked, and may be removed per event                  | D42                                |
| Questions are authored in the create and edit form, never on their own screen   | W4-A1, Brian 2026-08-21            |
| Bulk delete is retired and is not built                                         | Brian, 2026-08-21, superseding D35 |
| **Attendance opens on the template's answer, and on Optional otherwise**        | See below, reversing LAN-76        |
| **A template's audience is an inherited field, and moves like one**             | See below                          |

### Three interpretations recorded plainly

**Which fields approval requires.** W4 says approval is the completeness gate and
that every required field must be present, and its exceptions table names only
the date. The W8-02 mockup illustrates a refusal reading "three required fields
are missing: date, venue and description", which is a rendering of the refusal's
_shape_. Requiring a venue would refuse a fixture whose ground is genuinely not
settled — and W4 says in as many words that `TBD` stays a legitimate value for a
venue and a time. Requiring a description would contradict W8's "every field is
optional". So the implemented list is **the date**, plus the non-empty audience
invariant E1b already enforced. The refusal is written to name whichever fields
are missing, so widening the list later is a one-line change and not a redesign.

**Attendance's default.** `events.is_mandatory` is `not null` and this work
package owns no migration, so "unanswered" has no storage. Rather than refuse a
draft that D15 says must save, an unanswered attendance stores `false` —
_optional_, which asserts nothing about what the club expects. The control shows
the template's answer selected, so nothing is hidden from the operator.

**What a template change does to a draft's audience.** D41 governs the fields a
template gives an event: a change flows into a draft field by field, and only
into fields nobody has touched. It does not say in as many words whether the
default **audience** is one of those fields, and audience is the single field
that decides who receives a WhatsApp message — so the reading is recorded here
rather than left to be inferred.

The audience is an inherited field and moves exactly like one:

- A draft whose audience is still precisely the people the old default resolved
  to has not been touched, so it takes the new default. Swapping coaches for the
  committee on the Social template moved such a draft from 34 people to 32.
- A draft whose audience was chosen by hand holds it, and the confirmation says
  why: _Its audience was chosen by hand._
- An approved event never moves, whatever its audience is. Approval freezes
  everything, because people were already told.

The alternative reading — that a template's audience seeds a new event and never
moves again — would leave W8 unable to deliver its own motivating example, that
socials should stop inviting coaches by default. W8 lists **Audience** first
among what a template carries, and its handoff says the audience and the
questions are the ones set here. Treating it as frozen at creation would make
the operator hunt through every draft by hand, which is the work W8 exists to
remove. The narrowness of "still precisely the old default" is what keeps that
safe: a single hand-edit, in either direction, takes the draft out of reach of
the change and says so on the confirmation before anything is saved.

## Ticket interaction contract

- Every owned screen implements the loading, validation, error, success,
  completed, empty and unauthorized states that apply under the shared contract.
- Desktop and 375px preserve the same information and the same actions. The
  template list reflows from a table to cards and drops nothing.
- Keyboard focus, labels, status meaning, error association and touch targets are
  accessible. Reordering a question is two buttons, each named for the question
  it moves — there is no pointer-only gesture anywhere in this work.
- No roster data reaches a payload for an operator without the capability that
  entitles them to it.
- Refusals are enforced in the service layer, never by hiding a control. Hiding
  is a courtesy on top.

## Acceptance criteria, and where each is proved

| Criterion                                                                   | Proved by                                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A draft saves with name, type and date alone                                | `event-input.test.ts`, `actions.test.ts`, `events.test.ts`  |
| Approval refused for a missing field, named, event stays a draft            | `event-questions.test.ts`                                   |
| Approval refused for an empty audience, and both hold on a direct call      | `event-questions.test.ts`, `event-approval.test.ts`         |
| A new event arrives with its type's default audience and questions          | `event-templates.test.ts`                                   |
| A template change updates only untouched fields on unapproved drafts        | `event-templates.test.ts`                                   |
| It changes no approved event and no past event                              | `event-templates.test.ts`                                   |
| `Response requested` appears nowhere                                        | `screens.test.tsx`, `labels.test.ts`                        |
| Description and required equipment round-trip separately                    | `events.test.ts`                                            |
| Times save and display in Europe/London, five-minute steps, end after start | `event-input.test.ts`, `screens.test.tsx`                   |
| A draft is deleted after a confirmation naming it                           | `event-questions.test.ts`, `screens.test.tsx`               |
| An approved or cancelled event cannot be deleted at all                     | `event-questions.test.ts`, `screens.test.tsx`               |
| Questions: three types, independently required, reorderable, removable      | `event-questions-input.test.ts`, `question-editor.test.tsx` |
| The review names the audience by groups first, and shows the questions      | `audience-selection.test.ts`, `screens.test.tsx`            |
| The confirmation names what will and will not move                          | `event-templates.test.ts`, `templates/screens.test.tsx`     |

## Where the rules live

| Rule                                                  | Source of truth                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Per-field template inheritance                        | `src/lib/services/event-templates.ts`                                                                |
| What a question is, and what a template may hold      | `event-questions-input.ts`, `event-template-input.ts`                                                |
| The completeness gate, and the empty-audience refusal | `src/lib/services/event-approval.ts`                                                                 |
| Deleting a draft, and the refusal for anything else   | `src/lib/services/events.ts`                                                                         |
| Which groups a type offers                            | `src/lib/services/audience-selection.ts`                                                             |
| Who may do any of it                                  | `src/lib/auth/capabilities.ts`                                                                       |
| The audience must be non-empty (E1b)                  | [`../../adr/0012-explicit-event-audience.md`](../../adr/0012-explicit-event-audience.md)             |
| Audience proposed on the draft, frozen at approval    | [`../../adr/0022-audience-proposed-then-frozen.md`](../../adr/0022-audience-proposed-then-frozen.md) |
