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
wherever they bind. A second owner walkthrough of the built surface, 2026-08-29
(`Q-11`, `Q-12` in the `M-PEOPLE-AND-ROSTER` mission journal), changed Status,
Positions, value rendering, filtering, layout and the condensed view again —
recorded inline below, dated, wherever it binds.

## Relationship to LAN-75's ticket

LAN-75's `UX-20` (the roster list) and `UX-23` (its filtered-empty state) are
superseded by this ticket, root and branch — "redesigned, not extended"
(portfolio rule 3). LAN-75's `UX-21` (the membership record) is opened, not
rebuilt, by this package's `/operate/roster/[membershipId]` route. Its `UX-22`
(the activation-override dialog) is **not** unchanged: the 2026-08-29
walkthrough removed it, and every other status-transition control the record
carried, in favour of the one free-form status control this ticket now
documents — see "Status" below. That control is shared code
(`membership-actions.tsx`'s `MembershipStatusControl`), so this is the one
place LAN-186 edits a screen LAN-75 owns, by explicit owner instruction: "That
means on the player page and the people page, too, both of them that drop that
mark inactive."

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
  (`position_vocabularies`, invariant S3) — never a hardcoded list. **Codes
  only, in the cell and in the dropdown** (2026-08-29): the cells read
  "Tackle" at first build, where the club's own vocabulary is `T` — the fuller
  name never renders anywhere on this board, though the column still carries
  it for a control's own accessible name.
- **Blue # and White # are pickers** over every number 1-99, taking several
  numbers per kit, rendered under the player name (`chore/roster-fidelity-mockup`'s
  `jersey-picker.tsx`, kept exactly). A number held by another current
  membership this season is shown ticked, named, and cannot be clicked —
  refused at the point of choosing; the server refuses it again on a race, but
  the UI should never surface that as an error on save.
- **The column filter is a funnel in a bordered button**, not a caret.

**A value never echoes beside its label** (2026-08-29): one rendering path
produced `` `${value} · ${label}` `` — "eligible · Eligible" — everywhere a
select cell was open for editing. Every select cell, Status included, now
shows the label alone, both closed and open, matching the column header's own
filter chip. Availability additionally carries a colour swatch before the
label, both closed and open.

### Filtering — three cooperating parts, and where they run (2026-08-29)

A pinned set of three (Status, Availability, Missing onboarding data); a
funnel in every other column's own header; and a `Filtered by` chip bar
carrying every active filter, with `Clear all`. A pinned control and its
column header write to the same filter, so setting one moves the other.

Search, filter and sort all run **in the browser**, over the one set of rows
the page already fetched — `RosterBoard`'s own `applyBoard()` call, not a
round trip. Before 2026-08-29 every change called `router.push()`, which
re-ran the server component and re-queried the whole board for data the page
was already holding. The URL still carries the current search, filters and
sort (via `history.replaceState`, not a navigation), so a filtered view is
still a link and still survives a refresh — that refresh, and the page's first
load, are the one real fetch Brian accepted taking a few seconds:
"I'm okay if the first time it loads it's 5 seconds, but it should be snappy
and fast. Everything after that, as fast as we can."

### Editing

A season fact (every Season-band column) edits in the cell: one click opens
it, the change commits on its own with no confirmation, and an audit event is
written naming actor, field, before and after — no reason asked, because
nothing durable is being overwritten. A person fact (every Person-band column
except Contactable and Missing) renders and routes to the person record
instead, captioned "edit on the record" in its header.

**Status is no longer the one exception (2026-08-29).** It was built reusing
`membership.ts`'s own transition table and the record's reason-taking
controls — `onboarding → active` behind one button, `active ⇄ inactive` behind
a reason-taking form, both bespoke to Status alone. The owner walkthrough of
the built surface removed all of it: `MEMBERSHIP_TRANSITIONS` and
`transitionIsLegal` are gone from `src/lib/services/membership.ts`, and Status
is now an ordinary `select` column exactly like every other season fact — one
click opens a plain dropdown over all five statuses, picking one commits it,
no confirmation and no reason, `archived` included (previously unreachable by
any built path). Two database checks still apply and are honoured in code
rather than renegotiated: `status = 'active'` requires `activated_on`, and
`status = 'departed'` requires `departed_on`, both set in the same write
(`coalesce(existing, current_date)`, so flipping out of and back into either
status preserves the original date). Because this is shared code
(`MembershipStatusControl`), the player page's "Membership status" panel lost
its "Activate membership" / "Mark inactive" / "Mark active again" buttons the
same way, down to one select.

Q-12, verbatim, is the record of the decision: "Okay, then we just remove it.
We can flip to whatever status we want to go in." His own test for it: "We can
still get an audit history to know what happened, right?" — yes:
`season_membership_status_events` is append-only by privilege and records
every flip regardless of the sequence that produced it.

### Layout — even spacing between all three bands (2026-08-29)

`ONBOARDING` and `SEASON` used to butt straight against each other while
`PERSON` had visible breathing room — the 2px seam between bands existed only
in the sticky band-label row, never in the body cells, so only the boundary
beside the always-bordered pinned Player column ever read as separated. The
same seam now draws in the column-header row and every body cell, so all three
boundaries read with equal weight.

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

### The condensed view at 375px — a way in, not a miniature board (2026-08-29)

Superseded, root and branch, by the second owner walkthrough. Built first as a
name-led card carrying Status, Entry, positions, Availability and the missing
count — a miniature version of the desktop grid. Brian, walking the built
surface: "the mobile view is horrendous. Most of the time, the operators
aren't going to be using this as a mobile view anyway, so it should just be a
way to click in." That departs from Task 08 §5's condensed card, and the
departure is authorized because he asked for it directly, in his own words,
on the running screen.

The card now carries exactly three things — the player's **name**, their
**status**, and the **missing-data flag** when it is set — and nothing else
from the twenty columns. **The whole card is the tap target**: it is an anchor
into `/operate/roster/[membershipId]`, not a chevron or a "View" link in a
corner. **Voice call stays** — W5 locks it as the mobile quick action, and
nothing here composes, schedules or sends a message — as its **own**,
separately tappable control, positioned so a tap meant for one control can
never fire the other (two sibling tap targets, neither nested inside the
other). The call button uses the membership's phone number only to compose a
`tel:` link; the number is never rendered as text anywhere on this board.
**No in-cell editing at 375px** — editing is desktop work; the phone is for
finding somebody and opening them. The pinned filters and search stay above
the card list; per-column funnel filters do not belong at this width and are
not offered there. The call control itself is restyled alongside this
rebuild — a circular icon button rather than the first build's plain outlined
"Call" text button, which Brian called simply ugly; it keeps the same 44px
minimum touch target and the same accessible name.

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
