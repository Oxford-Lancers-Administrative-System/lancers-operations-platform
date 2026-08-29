# LAN-186 - This season's squad as a twenty-column board

Status: implemented, as built. This is the contract the shipped surface was
built against, not a plan — see `../slice-ux.md` for the shared vocabulary,
authorization and responsive rules this ticket does not restate.

> **Synthetic scenario data:** all displayed people, positions, jersey numbers
> and onboarding states are synthetic and do not correspond to real members.

Authority: LAN-186 in Linear, `missions/intake/M-PEOPLE-AND-ROSTER/workflows/
W5-work-this-seasons-roster.md`, `acceptance/W5.md`, and the approved
photographs at `missions/packets/M-PEOPLE-AND-ROSTER/mockups/
W5-work-this-seasons-roster.html`. Three owner decisions taken 2026-08-28,
after W5's own approval, override the drawings and are recorded inline below
wherever they bind.

## Relationship to LAN-75's ticket

LAN-75's `UX-20` (the roster list) and `UX-23` (its filtered-empty state) are
superseded by this ticket, root and branch — "redesigned, not extended"
(portfolio rule 3). LAN-75's `UX-21`/`UX-22` (the membership record and its
activation dialog) are unchanged and still that ticket's; this package opens
`/operate/roster/[membershipId]` and does not rebuild it.

## Owned screen and route

| Screen | Route             | Audience                                                               |
| ------ | ----------------- | ---------------------------------------------------------------------- |
| W5     | `/operate/roster` | President, Vice-President, Secretary, General Manager, IT Officer only |

`REQ-authority`: "four-role only, for the grid and every column on it." Unlike
LAN-75's `UX-20`, this is **not** an ordinary operator surface — the page opens
with `person_record_authority`, the same capability LAN-183 gates the full
person record behind, and refuses everyone else before any board data is read.

## What renders

Twenty columns, Player pinned, in three labelled and tinted bands — **Person**
(College, Matric, Grad, Degree, Contactable, Missing), **Onboarding**
(one column, deliberately lonely — Mission 7 adds the rest), and **Season**
(Status, Entry, Offence, Defence, Special teams, Blue #, White #, Coach group,
Formalwear, Blues, Eligibility, Availability). The board scrolls sideways
inside its own container; the page never scrolls horizontally.

Raw email and phone are gone, replaced by a Contactable indicator (`Mobile` /
`Email` chips, never a value). Date of birth and emergency contact appear
nowhere on this board and cannot.

### The three decisions that override the drawings (2026-08-28)

- **Positions are three single-select columns**, not the mockup-branch's
  multiselect. Offence and Defence map onto `position_slot`'s own values;
  Special teams is one board-level concept spanning the schema's four
  independent special-teams slots — setting a new value closes whichever of
  the four was open and opens the chosen one. Every change supersedes the
  current row by effective dating (S4); a same-day correction (opened and
  changed within one calendar day) deletes the same-day row instead of
  superseding it, because `..._period_ordered` requires `effective_to >
effective_from` strictly and there is no history in a row that lived zero
  calendar days. Position options come from the season's own vocabulary
  (`position_vocabularies`, invariant S3) — never a hardcoded list.
- **Blue # and White # are pickers** over every number 1-99, taking several
  numbers per kit, rendered under the player name (`chore/roster-fidelity-mockup`'s
  `jersey-picker.tsx`, kept exactly). A number held by another current
  membership this season is shown ticked, named, and cannot be clicked —
  refused at the point of choosing; the server refuses it again on a race, but
  the UI should never surface that as an error on save.
- **The column filter is a funnel in a bordered button**, not a caret.

### Filtering — three cooperating parts

A pinned set of three (Status, Availability, Missing onboarding data); a
funnel in every other column's own header; and a `Filtered by` chip bar
carrying every active filter, with `Clear all`. A pinned control and its
column header write to the same filter, so setting one moves the other.
Filters and sort live in the URL, so a filtered board is a link and survives a
refresh.

### Editing

A season fact (every Season-band column) edits in the cell: one click opens
it, the change commits on its own with no confirmation, and an audit event is
written naming actor, field, before and after — no reason asked, because
nothing durable is being overwritten. A person fact (every Person-band column
except Contactable and Missing) renders and routes to the person record
instead, captioned "edit on the record" in its header.

**Status is the one exception, deliberately.** It reuses `membership.ts`'s own
transition rules and forms rather than a free dropdown: `onboarding → active`
commits with one click when nothing required is outstanding; `active
⇄ inactive` reuses the record's existing reason-taking controls, because that
requirement predates this board and is a rule this package does not own or
relax.

### Column visibility is grant-driven, not merely role-gated once

Every column carries the capability it requires (`person_record_authority`
today, for all twenty), and a viewer's redacted row never carries a field
their columns do not grant — proved structurally in
`src/app/operate/roster/board-columns.test.ts`, independent of whether any
role is narrowed today. Widening or narrowing a column's grant later is an
edit to one field in `src/app/operate/roster/board-columns.ts`.

### Both empty states

A season with no memberships at all reads "This season has no memberships
yet"; a filter matching nobody reads "No memberships match these filters" and
offers `Clear filters` alongside `Add player`. Not photographed: the
system-empty state needs a season with no memberships, which the seeded
dataset does not contain — the same limitation the approved mockup itself
records.

### The condensed view at 375px

Name-led cards carrying Status, Entry, positions, Availability (when granted)
and the missing count as chips, with voice call as the only channel action —
nothing here composes, schedules or sends a message. The call button uses the
membership's phone number only to compose a `tel:` link; the number is never
rendered as text anywhere on this board.

## Explicitly not in this ticket

- Player detail (`/operate/roster/[membershipId]`) — LAN-187's, opened and not
  rebuilt.
- A season picker or any season lifecycle action — Mission 11's.
- What a position, jersey number, coach group or availability level _means_
  on the field — Mission 9's; this ticket gives each a place to live.
- Saved views — deferred by the approved workflow, not rejected.
- `is_predominant` jersey selection — player detail's fuller editor.

## Acceptance criteria

The twenty checkboxes under **Acceptance** on the live LAN-186 issue are
binding verbatim. This document does not restate them.
