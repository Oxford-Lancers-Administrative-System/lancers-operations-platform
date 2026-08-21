# W4 — Draft an event and approve it with its audience

## What this workflow is for

One event goes from nothing to approved: an operator writes it down, decides who
it is for, checks the whole thing once, and approves it. Approval is the moment
the club commits — it is the completeness gate, and it is what makes invitations
possible.

- **Primary actor:** an operator with event management; approval additionally
  requires the approval capability.
- **Trigger:** an event that import did not cover, an imported draft that needs
  finishing, or a draft whose details have firmed up.
- **Entry points:** `Create event → Add a single event`; the edit action on a
  draft; a duplicate of a past event; or a draft that arrived from `W3`.
- **User-visible result:** an approved event with an explicitly confirmed
  audience — or a draft that is deliberately not approved yet, or deleted.
- **Controlling source:** Events & Calendar brief D13–D26, D29, D39–D48, D62,
  D78, D86, §4.10; inventory amendment 1, which gave this workflow deleting a
  draft.

## Required actions

1. **Start a draft** — blank, duplicated from a past event, or opened from
   import.
2. **Write down the event.** Name, type, date is the minimum to save (D15).
3. **Fill in the rest**, in any order, over as long as it takes. A draft is
   freely editable and is already visible on the calendar (D4).
4. **Check the audience.** It arrives from the type's template already set; the
   approver checks rather than builds (D47).
5. **Review the whole thing** — the event, the audience, and what approving will
   do.
6. **Approve**, which is refused unless every required field is present and the
   audience is not empty.
7. **Or delete the draft**, if it should never have existed.

## What changes on the event record

The form on `main` at `2072ecd` carries Name, Type, Date, Start, End, Venue,
Attendance and _Response requested_. The target state differs in five ways, and
each is an approved decision rather than a preference:

| Change                                                                                                                                                  | Decision |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Description** becomes a field — free text, absorbing anything without a home                                                                          | D18      |
| **Required equipment** becomes its own field, separate from description                                                                                 | D17      |
| **Online or in person** becomes a property, and the venue field takes an address or a destination accordingly                                           | D20, D21 |
| **Response requested is removed.** It is not a real concept; mandatory or optional already carries it, and everyone sent an event is expected to answer | D23      |
| **Time entry moves to five-minute increments**, selecting a start sets the end to match, and the zone is stated as Europe/London                        | D78, D86 |

`TBD` stays a legitimate value on a draft — for venue, for time, and for the
opponent inside the name, exactly as the club writes it on the term card. There
is no opponent field and a name change is not material (D14).

## The audience, and a deliberate reversal of shipped behaviour

**This workflow reverses a criterion LAN-77 shipped.** The audience builder on
`main` says so in its own words today: _"Nothing is selected to begin with, and
there is no whole-roster default: the audience is stored as the explicit list
you confirm here."_

D47 overrides that. **A type's template supplies a default audience**, which
arrives with the event already set, visible and editable, so that the approver
checks rather than builds. The brief records this as a correction to LAN-77 in
its own §6, and it is called out here so that nobody reads the shipped copy as
authority and quietly restores it.

What does not change:

- **Four standing groups** — everyone active, all active players, all coaches,
  all committee — and no further roster-derived group (D43).
- **No unit groups and no kit groups** (D44). The unit control that exists today
  filters who is on screen; it does not create a group, and it may stay on that
  footing.
- **A recruits group, on the Recruitment type only** (D46).
- **Inactive people are never invited** (D45).
- **The audience is stored as an explicit resolved list.** A group is a way of
  selecting people, not a live query that changes underneath an approved event.

## Approval

- **Approval is the completeness gate** (D16). Every required field must be
  present.
- **An empty audience refuses approval above the database**, with a message
  naming the rule, and the event stays a draft. No invitations, no jobs, no
  audit of a success. This is implemented today and is retained exactly
  (acceptance example D, invariant E1b, ADR 0012).
- **The approver sees the whole consequence first** — the event as it will read,
  the resolved audience by name, and what approval will cause.
- **Approval freezes the template.** Template values flow into a draft while it
  remains a draft; approval stops that (D41).
- **Approval is one transaction** covering the event, its audience and whatever
  approval creates.

Nothing about _when messages are sent_ is here. Approval makes invitations
possible; Mission 4 decides when they go and sends them.

## Deleting a draft

Given to this workflow by inventory amendment 1.

- **An abandoned draft is deleted from the calendar** (D29). "Withdrawn" means it
  never became an event; "cancelled" means it was one and was called off. They
  are not two flavours of one state, and `withdrawn` is not a status that exists.
- **Only a draft may be deleted.** An approved event is cancelled (`W6`), never
  deleted, because people have been told about it.
- **Deletion is permanent and is confirmed first**, naming the event.
- **There is no delete path anywhere on `main` at `2072ecd`.** An event cannot
  currently be removed by any means. This workflow specifies one from nothing.

## State transitions

- `(nothing) → draft` — created, duplicated, or imported.
- `draft → draft` — edited, freely, any number of times.
- `draft → approved` — one transaction, gated on completeness and a non-empty
  audience.
- `draft → (gone)` — deleted, permanently, confirmed first.
- Nothing else. `approved → draft` is `W5`. `→ cancelled` is `W6`.

## Handoffs

- **← `W3`** — imported drafts arrive here to be finished and approved.
- **← `W8`** — the type's template supplies defaults and default questions.
- **→ Mission 4** — approval makes invitations possible; the sending is theirs.
- **→ `W5`, `W6`** — once approved, changing or calling off the event leaves
  this workflow.
- **→ `W7`** — an approved event's page is where its responses appear.

## Exceptions and recovery

| Situation                                  | Behaviour                                                            |
| ------------------------------------------ | -------------------------------------------------------------------- |
| Approving with an empty audience           | Refused above the database, naming the rule; the event stays a draft |
| Approving with required fields missing     | Refused, naming which                                                |
| Editing an approved event directly         | Refused; it must be returned to draft, which is `W5`                 |
| A non-operator attempting any change       | Refused in the service layer, not by hiding the control              |
| A draft with no date                       | Saveable and visible; approval requires the date                     |
| Deleting a draft                           | Confirmed first, then permanent                                      |
| Deleting anything that is not a draft      | Refused                                                              |
| The template changes while a draft is open | The draft takes the new defaults, because it is still a draft (D41)  |

## Safety, privacy, consent, and authority boundaries

- **Approval is the only thing that makes a message possible.** A draft carries
  no invitations, no responses and no attendance, and cannot (§4.10, and the
  banner the application already shows).
- **The audience names real people**, so this is the first surface in the
  mission that shows roster data. It is operator-tier and stays there.
- **Deletion is destructive and irreversible**, and is the only destructive act
  in the mission apart from cancellation.
- **Capability is enforced in the service layer.** Event management to draft;
  approval to approve.

## Conflict carried from `W3` — a recommendation, for Brian to settle

**D35 says "mass delete must exist"** — delete a batch, re-import once details
firm up. Brian, 2026-08-21: _"If we want to bulk delete … I'm not even sure if
we're going to support that."_

**Recommendation: retire D35 for Release One, and do not build bulk delete.**
D35's stated purpose was to fix a batch that was wrong by removing it and
re-importing. `W3` now serves that purpose better: an import upserts, so a wrong
batch is corrected by importing the corrected file over it, and nothing has to
be removed first. What remains is the genuinely abandoned draft, and deleting
those one at a time is proportionate — a club does not abandon them in bulk.

Retiring it also removes the only bulk destructive action in the mission, which
is worth something on its own.

This needs Brian's word, because D35 is an approved decision in an
owner-approved brief and no agent may drop it.

## Repository reconciliation

Every surface here exists on `main` at `2072ecd` and is modified, not new:
`src/app/operate/events/new`, `event-form.tsx`, `[id]/edit`,
`[id]/audience-builder.tsx` and `[id]/page.tsx`'s review and approval steps.

- The **empty-audience refusal is already built** and already refuses on the
  server; it is retained as-is.
- The **audience builder's own copy contradicts D47** and must change with it.
- **`Response requested` is on the form today** and D23 removes it.
- **Description, required equipment and the online toggle do not exist.**
- **The date input renders in the browser's locale** — `mm/dd/yyyy` on this
  machine — which is the recorded US-time defect D86's explicit-zone rule exists
  to end.
- **No delete path exists.**

## Acceptance evidence

- A draft saves with name, type and date alone, and appears on the calendar
  immediately.
- Approval is refused with a named reason when a required field is missing, and
  when the audience is empty; the event stays a draft and nothing is created.
- The refusal holds when the screen is bypassed and the service is called
  directly.
- A new event of a type whose template carries a default audience arrives with
  that audience already set and editable.
- Changing a template updates an unapproved draft and does not touch an approved
  event.
- Approval writes the event, its audience and its consequences in one
  transaction.
- An approved event cannot be edited without being returned to draft.
- A draft can be deleted after a confirmation naming it; an approved or
  cancelled event cannot be deleted at all.
- Times save and display in Europe/London with the zone visible, in five-minute
  increments, and selecting a start sets the end to match.
- `Response requested` appears nowhere.
- Description and required equipment round-trip, and are separate fields.
- An online event's venue field takes a destination rather than an address.

## Core decisions

| Decision                                                                                               | Classification                | Governing evidence or recommended default                                                                                                                                                                | Status           |
| ------------------------------------------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Minimum to save a draft is name, type and date                                                         | `locked`                      | D15                                                                                                                                                                                                      | Settled          |
| Approval is the completeness gate                                                                      | `locked`                      | D16                                                                                                                                                                                                      | Settled          |
| An empty audience refuses approval, above the database                                                 | `locked`                      | Acceptance example D, E1b, ADR 0012 — already built                                                                                                                                                      | Settled          |
| **A type's template supplies a default audience**, reversing LAN-77's shipped "begins empty" criterion | `locked`                      | D47, recorded as a correction in the brief's §6                                                                                                                                                          | Settled          |
| Four standing groups, plus a recruits group on the Recruitment type only                               | `locked`                      | D43, D46                                                                                                                                                                                                 | Settled          |
| No unit or kit groups; the existing unit control filters and does not group                            | `locked`                      | D44                                                                                                                                                                                                      | Settled          |
| Inactive people are never invited                                                                      | `locked`                      | D45                                                                                                                                                                                                      | Settled          |
| Description and required equipment are separate fields                                                 | `locked`                      | D17, D18                                                                                                                                                                                                 | Settled          |
| Online or in person is a property; venue takes an address or a destination                             | `locked`                      | D20, D21                                                                                                                                                                                                 | Settled          |
| `Response requested` is removed                                                                        | `locked`                      | D23                                                                                                                                                                                                      | Settled          |
| Five-minute time increments; end follows start; Europe/London stated                                   | `locked`                      | D78, D86                                                                                                                                                                                                 | Settled          |
| No opponent field; the name carries it, and a name change is not material                              | `locked`                      | D14                                                                                                                                                                                                      | Settled          |
| Template values flow into a draft until approval freezes them                                          | `locked`                      | D41                                                                                                                                                                                                      | Settled          |
| An abandoned draft is **deleted**, permanently, after a confirmation; only drafts may be deleted       | `locked`                      | D29, inventory amendment 1                                                                                                                                                                               | Settled          |
| **Whether bulk delete exists at all in Release One**                                                   | `proposed for owner approval` | D35 requires it; Brian doubts it. **Recommended: retire D35 and do not build it** — `W3`'s upsert already corrects a wrong batch without removing anything, and one-at-a-time covers the abandoned draft | **Open — Brian** |
| Where the delete action sits, and its confirmation wording                                             | `delegated to Mission Lead`   | Must name the event and be hard to hit by accident                                                                                                                                                       | Delegated        |
| Whether duplicate opens a prefilled form or creates a draft immediately                                | `delegated to Mission Lead`   | D39 calls it a minor convenience                                                                                                                                                                         | Delegated        |

## Brian approval

- Exact words:
- Date:
