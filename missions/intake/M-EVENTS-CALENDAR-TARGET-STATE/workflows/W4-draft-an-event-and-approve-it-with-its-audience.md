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

The form on `main` at `c894f1d` carries Name, Type, Date, Start, End, Venue,
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
  the resolved audience by name, and the questions people will be asked.
- **The audience is named by its groups first, then by its people.** The review
  leads with the groups chosen — "All active players, all coaches" — and the
  headcount, before the individual names. An approver checks a shape faster than
  they check a list of thirty-five. (Brian, 2026-08-21.)
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
- **There is no delete path anywhere on `main` at `c894f1d`.** An event cannot
  currently be removed by any means. This workflow specifies one from nothing.

## State transitions

- `(nothing) → draft` — created, duplicated, or imported.
- `draft → draft` — edited, freely, any number of times.
- `draft → approved` — one transaction, gated on completeness and a non-empty
  audience. There is no reverse: `W5` amends an approved event in place.
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
| Editing an approved event directly         | Not done here. An approved event is amended in place, which is `W5`  |
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

Every surface here exists on `main` at `c894f1d` and is modified, not new:
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
- An approved event is not editable through this workflow; amending one is
  `W5`, which edits it in place and never returns it to draft.
- A draft can be deleted after a confirmation naming it; an approved or
  cancelled event cannot be deleted at all.
- Times save and display in Europe/London with the zone visible, in five-minute
  increments, and selecting a start sets the end to match.
- `Response requested` appears nowhere.
- Description and required equipment round-trip, and are separate fields.
- An online event's venue field takes a destination rather than an address.

## Core decisions

| Decision                                                                                                                                            | Classification              | Governing evidence or recommended default                                                                                                                                                                                                                                                                                                                                                                                                    | Status                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Minimum to save a draft is name, type and date                                                                                                      | `locked`                    | D15                                                                                                                                                                                                                                                                                                                                                                                                                                          | Settled                  |
| Approval is the completeness gate                                                                                                                   | `locked`                    | D16                                                                                                                                                                                                                                                                                                                                                                                                                                          | Settled                  |
| An empty audience refuses approval, above the database                                                                                              | `locked`                    | Acceptance example D, E1b, ADR 0012 — already built                                                                                                                                                                                                                                                                                                                                                                                          | Settled                  |
| **A type's template supplies a default audience**, reversing LAN-77's shipped "begins empty" criterion                                              | `locked`                    | D47, recorded as a correction in the brief's §6                                                                                                                                                                                                                                                                                                                                                                                              | Settled                  |
| Four standing groups, plus a recruits group on the Recruitment type only                                                                            | `locked`                    | D43, D46                                                                                                                                                                                                                                                                                                                                                                                                                                     | Settled                  |
| No unit or kit groups; the existing unit control filters and does not group                                                                         | `locked`                    | D44                                                                                                                                                                                                                                                                                                                                                                                                                                          | Settled                  |
| Inactive people are never invited                                                                                                                   | `locked`                    | D45                                                                                                                                                                                                                                                                                                                                                                                                                                          | Settled                  |
| Description and required equipment are separate fields                                                                                              | `locked`                    | D17, D18                                                                                                                                                                                                                                                                                                                                                                                                                                     | Settled                  |
| Online or in person is a property; venue takes an address or a destination                                                                          | `locked`                    | D20, D21                                                                                                                                                                                                                                                                                                                                                                                                                                     | Settled                  |
| `Response requested` is removed                                                                                                                     | `locked`                    | D23                                                                                                                                                                                                                                                                                                                                                                                                                                          | Settled                  |
| Five-minute time increments; end follows start; Europe/London stated                                                                                | `locked`                    | D78, D86                                                                                                                                                                                                                                                                                                                                                                                                                                     | Settled                  |
| No opponent field; the name carries it, and a name change is not material                                                                           | `locked`                    | D14                                                                                                                                                                                                                                                                                                                                                                                                                                          | Settled                  |
| Template values flow into a draft until approval freezes them                                                                                       | `locked`                    | D41                                                                                                                                                                                                                                                                                                                                                                                                                                          | Settled                  |
| An abandoned draft is **deleted**, permanently, after a confirmation; only drafts may be deleted                                                    | `locked`                    | D29, inventory amendment 1                                                                                                                                                                                                                                                                                                                                                                                                                   | Settled                  |
| **Bulk delete is retired for Release One and will not be built.** D35 is superseded                                                                 | `locked`                    | Brian, 2026-08-21: "The bulk delete decision: yeah, retire it." `W3`'s upsert corrects a wrong batch by importing the corrected file over it, so nothing needs removing first; the remaining case is the abandoned draft, deleted one at a time on its own page. This also leaves the mission with no bulk destructive action at all. Proposed as a correction to the Events brief and the Capability Register — see `notion-corrections.md` | Settled                  |
| **Delete lives on the draft's own event page**, as a low-emphasis destructive action — not on the create form, where there is nothing yet to delete | `locked`                    | Brian, 2026-08-21: "there should be a Delete Event button … I don't know where that button exists on this event." A saved draft has a page, and that page is where an operator edits it, chooses its audience, or decides it should not exist                                                                                                                                                                                                | Settled                  |
| The rule that an approved event cannot be deleted is enforced **where somebody runs into it**, not pre-announced on the delete dialog               | `locked`                    | Brian, 2026-08-21: "That warning should pop up if you try to delete an approved event … I don't think it needs to be called out there specifically."                                                                                                                                                                                                                                                                                         | Settled                  |
| The approval review does **not** explain what approving does                                                                                        | `locked`                    | Brian, 2026-08-21: "You don't really have to explain what approving does because we already know what it is … That's over-explaining for no reason."                                                                                                                                                                                                                                                                                         | Settled                  |
| **All event times are Europe/London, everywhere, and this is not configurable**                                                                     | `locked`                    | D86 fixes entry and display in the club's own zone and requires the zone to be shown. One club, one city, one timezone — and a per-event or per-user zone setting is precisely the class of thing that produced the recorded US-time defect. A subscriber abroad still sees their own local time, because `W2`'s feed carries the zone and their calendar converts it                                                                        | Settled                  |
| Per-event or per-user timezones                                                                                                                     | `nonblocking unknown`       | Brian, 2026-08-21: "We can add it in later if we want to do time zones, but for now, that's fine." **Handling rule:** not built, not designed for, and not a constraint on this mission. Storing the zone explicitly rather than assuming it keeps the door open without opening it                                                                                                                                                          | Deferred — later release |
| Whether duplicate opens a prefilled form or creates a draft immediately                                                                             | `delegated to Mission Lead` | D39 calls it a minor convenience                                                                                                                                                                                                                                                                                                                                                                                                             | Delegated                |

## Amendment W4-A1 — per-event questions

**Added 2026-08-21, after approval.** Brian: _"we never talked about optional
questions … we should be able to, when we create the event and send out the
invitation … create questions, see the questions, and approve them
beforehand."_

He was right that nothing covered it. The brief decides the _shape_ of questions
and no workflow said who writes one. This amendment is additive: everything
approved on 2026-08-21 stands unchanged.

### What the brief already settled

- **Three answer types**: free text · yes/no · pick from a list (D66).
- **Each question carries its own mandatory toggle** (D67).
- **Templates carry default questions**, chosen when the template is set up.
  They arrive with any event created from that template and **may be removed per
  event** (D42).
- **Answers are read in two places**: a collapsed Questions section on the event
  page showing counts, and the full participation view behind the club link, one
  row per person and one column per question (D68).

### What this amendment adds

**Nothing that is its own screen.** Brian, 2026-08-21: _"This is part of the
create event workflow. It's not a separate screen that needs its own thing …
it's ingrained in the process, so you separated that inappropriately."_ Writing
an event and deciding what to ask the people invited to it are one act, so
questions live inside the screens that already exist.

**Authoring — in the create and edit form**, below the event's own facts:

- Add a question, choose its answer type, and mark it required or optional.
- For a _pick from a list_, write the options.
- Reorder them. The order is the order a player is asked.
- Remove one — including one the template supplied, which is exactly what D42
  says may happen.
- Questions the template supplied are marked as such, so an operator can see
  which came with the type and which they wrote.

**Seeing them before approving — in the approval review**, which already shows
the event and the named audience. It gains **the questions, exactly as a player
will be asked them** — because "approve this event" means approving what 37 people are
about to be asked, and a question is not a detail you should discover afterwards.

**A drafting rule, not a product one:** questions are part of the event, so they
follow the event's rules. They are editable while it is a draft, they arrive from
the template until approval freezes it (D41), and changing them after approval is
`W5`'s amendment path like any other change.

### Where questions are _not_

- **Not in the CSV.** `W3` carries the event record only; a question is
  structured, ordered and typed, and a spreadsheet column is the wrong shape for
  it. An imported draft gets its type's default questions like any other draft.
- **Not read here.** Answers belong to `W7`.
- **Not defined here.** The per-type defaults belong to `W8`.

### Decisions

| Decision                                                                                      | Classification              | Governing evidence                                                                                                     | Status    |
| --------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| Questions are authored on the event, below its facts, while it is a draft                     | `locked`                    | D42's "may be removed per event" requires per-event authoring to exist                                                 | Settled   |
| Three answer types — free text, yes/no, pick from a list                                      | `locked`                    | D66                                                                                                                    | Settled   |
| Each question is independently required or optional                                           | `locked`                    | D67                                                                                                                    | Settled   |
| Template questions arrive with the event, are marked as template-supplied, and may be removed | `locked`                    | D42                                                                                                                    | Settled   |
| The approval review shows the questions as a player will be asked them                        | `locked`                    | Added 2026-08-21. Approval is the completeness gate (D16), and what people are asked is part of what is being approved | Settled   |
| Questions are not carried by import                                                           | `locked`                    | Decided at `W3`; a typed, ordered, optioned question is the wrong shape for a CSV column                               | Settled   |
| Question order is the order asked, and is set by the operator                                 | `delegated to Mission Lead` | Ordinary engineering                                                                                                   | Delegated |
| Whether a question may be edited on an approved event without the full amendment path         | `delegated to Mission Lead` | Recommended default: no. A question is part of the event, and `W5` already covers changing an approved event           | Delegated |

### Amendment approval

- **Exact words:** "The issue is approved, and let's move on to the next
  workflow." (2026-08-21)
- **Date:** 2026-08-21
- **Applied with the approval, no further review requested:** the approval
  review names the audience by its groups before its people — Brian: "it should
  say at the very top what groups it would be … You don't have to show me how
  it's done."

## Brian approval

- **Exact words:** "Everything else looks great." (2026-08-21, on the six
  screens with four items outstanding) and, after those four were applied,
  "Continue." / "go" (2026-08-21).
- **Date:** 2026-08-21
- **Standing of the second word:** it was an instruction to proceed rather than
  a fresh content review. The revision it followed was scoped strictly to the
  four items Brian raised — Delete moved onto the draft's event page, the delete
  dialog's callout removed, "what approving does" removed, and date given its own
  row — and introduced nothing else. Recorded plainly so that a later reader can
  judge the approval for what it is.
