# LAN-187 - One player's record, rebuilt so the person and the season are visibly different things

Status: implemented, as built, including the Attendance band added in this
package's first correction round (`Q15-attendance`, owner question `Q-15`) and
the copy/coverage corrections from its second (review `inv-fc59c691-dec`,
findings F1/F2/F4 — see "Correction round 2" below). This is the contract the
shipped surface was built against, not a plan — see `../slice-ux.md` for the
shared vocabulary, authorization and responsive rules this ticket does not
restate.

> **Synthetic scenario data:** all displayed people, positions, jersey numbers
> and onboarding states are synthetic and do not correspond to real members.

Authority: LAN-187 in Linear, `missions/intake/M-PEOPLE-AND-ROSTER/workflows/
W6-open-one-players-record.md`, `acceptance/W6.md`, and the approved
photographs at `missions/packets/M-PEOPLE-AND-ROSTER/mockups/
W6-open-one-players-record.html` (proposals `W6-01.js`, `W6-02.js`).

## Relationship to LAN-186's ticket

LAN-186's own ticket states that `/operate/roster/[membershipId]` is "opened,
not rebuilt" by that package. That sentence predates this one: LAN-187
**redesigns** the record, root and branch (portfolio rule 3), and this ticket
supersedes that line. The board itself is untouched — this package does not
edit `board-columns.ts`, `board-data.ts`, `roster-board.tsx`, `jersey-picker.tsx`
or `presentation.ts`; it imports from all five, so the two surfaces read as one
product rather than two dialects of one idea.

## Owned screen and route

| Screen | Route                            | Audience                                                               |
| ------ | -------------------------------- | ---------------------------------------------------------------------- |
| W6     | `/operate/roster/[membershipId]` | President, Vice-President, Secretary, General Manager, IT Officer only |

`REQ-authority`, at the whole surface rather than one control on it: this is
the most complete view of one human the application has — date of birth and
emergency contact render here and on no list — so the page gates on
`person_record_authority` before `readPlayerRecord()` is ever called, exactly
as the board's own page does. This is a change from the shipped LAN-75 page,
which opened to any linked operator and gated only its status control; W6
widens the boundary to the whole surface, per `REQ-authority`'s own words.

## What renders

**Person · Onboarding · Season · Attendance**, banded in that order. The first
three share the board's own three colours (`bandOf()` from `board-columns.ts`),
so the two surfaces read as one product and a field's group is never a guess.
Attendance carries its own violet (`Q15-attendance`) — see "Attendance" below.

**Person** — name, aliases, mobile phone, personal email, college,
matriculation year, expected graduation, degree field, date of birth,
emergency contact, and a derived "Under 18" flag. Every one of these is a
durable person fact: it renders here and routes to the person record
(`Open the person record →`) rather than editing in place. Date of birth and
emergency contact appear on no list, board or queue — this is the one place
they render at all.

**Onboarding** — every configured item, with per-item provenance (completed
date, or who waived it and why). A membership with no items configured says so
in its own words ("This season has no onboarding items configured, so this
membership has none") rather than reading as incomplete.

**Season** — Status, Entry, the four milestone dates (Confirmed, Activated,
Departed, Expected return), Offence, Defence, Special teams, Jersey — Blue,
Jersey — White, Coach group, Formalwear, Half / Full Blue, Eligibility,
Availability. Every one of these edits in place, exactly as the board's own
cells do: one click, a dropdown only where the value set is fixed, commits on
its own, audited, no reason asked.

**Attendance** — see "Attendance" below, its own section for the full design.

**Their other seasons** — every other season membership this person holds,
newest first, each with its status and predominant Blue jersey number.

**Status history** — the full, append-only transition record: from, to, when,
who, and the reason where one was recorded. Links to the person's own change
history (`Everything that changed about this person →`,
`/operate/people/[personId]?history=expanded`) rather than duplicating it —
`W8` was struck 2026-08-27 and absorbed into `W1`.

**Derived values, labelled as derived** — the Blues total across seasons
(`person-record.ts`'s `halfBlueCount` / `fullBlueCount`, unmodified),
constitutional membership for this season (`public.constitutional_membership`,
invariant I5), and the Under 18 flag. A derived value that cannot be derived
(no date of birth on file) reads `not recorded` rather than a guess.

## Season facts edit in place; person facts route to the person record

The board's own interaction, reused rather than reimplemented: a season
field's own `Select`, opened on click, committing on choice, with the same
"code and name" open-list convention the board's position columns use. Jersey
numbers use the board's own `JerseyPicker` component, unmodified — the fuller
editor W6 asks for, since the board shows only the predominant number.

Every commit calls straight into `roster-board.ts`'s own `commitPosition`,
`commitJerseyNumbers`, `commitCoachGroup`, `commitFormalwearItem`,
`commitBlues`, `commitEligibility`, `commitAvailability` and `commitEntry` —
the identical functions the board's own cells call. `record-actions.ts` exists
only because this package's collision domain is `[membershipId]/**` and the
board's own action module revalidates `/operate/roster` alone; every wrapper
here revalidates both routes, so an edit made on either surface is reflected
on the other without a manual refresh.

**A durable person fact is editable in exactly one place in this mission** —
the person record, under `W2`'s rules. Changing one from here would mean
`W2`'s reason-and-supersede rule either followed every edit path or quietly
did not apply to this one; it applies here by never offering the edit at all.

## The shipped activation control, preserved

**The separate "Membership status" card is gone.** Status is now an ordinary
in-place field like every other season fact — the same free ladder LAN-186's
owner walkthrough put on the board (`Q-12`: "We can flip to whatever status we
want to go in"), calling the same `setMembershipStatus()` the shipped
`MembershipStatusControl` always called. The mechanism this ticket promises to
preserve is that function and its two dated-field checks
(`season_memberships_activation_is_dated`,
`season_memberships_departure_is_dated`), not the standalone card that used to
contain it — the card is exactly what the approved mockup retires.

## Onboarding items edit the same way; no Resolve/SAVE pair

The shipped page's per-item `Resolve … ▾` / `SAVE` form
(`OnboardingItemForm`) is gone. An item is the same click-to-edit field as
every other season value, offering the same three resolutions the shipped
form always did — Complete, Waived, Not applicable — through
`resolveOnboardingItem()`, unmodified.

**One necessary departure from "commits on its own, no reason asked":** a
waiver still requires a reason, because the schema itself requires one
(`onboarding_items_waiver_is_justified`) — this predates W6 and is not a
season fact in the sense `REQ-audit`'s "no reason" rule addresses. Choosing
Waived opens a reason field beneath the row instead of committing immediately,
because there is genuinely nothing to commit yet; Complete and Not applicable
commit the instant they are chosen, exactly like every other field.

## A departed or archived membership

Renders complete and read-only. The Status field's editor is **absent**
rather than disabled — every other season field's editor is absent alongside
it, because nothing about a past season is editable from here. A disabled
control invites the question of how to enable it; an absent one answers it.

## A membership whose person was merged away (invariant I6, W1-09)

A merge repoints no foreign key — the losing `people` row survives, marked
`merged_into_person_id`, and every `season_memberships` row it ever held still
names it. `readPlayerRecord()` detects this (the same `NotFound` /
`person_merged_away` `readPersonRecord()` already throws) and resolves to the
survivor's own membership for the same season, or to the survivor's person
record when they never held one that season — the same resolution `W1-09`
gives a merged person id directly.

## Delegated decisions, taken here and recorded

`acceptance/W6.md`'s Core Decisions table delegates "which of Mission 9's
football fields render read-only versus not at all" to the Mission Lead, "the
rule is substrate-on-`main`; the enumeration is mechanical." Two enumerations
follow from it, both mechanical rather than invented:

- **Positions render as three rows** — Offence, Defence, Special teams — not
  the single "Positions" placeholder the approved mockup's overlay script
  drew. That placeholder was reading a page (the shipped LAN-75 record) with
  no positions data to scrape at all; it is a scraping artifact, not a
  structural decision. LAN-186's own board — approved, merged, and this
  package's explicit reuse source for "the same interaction" — already made
  this exact split (`Q-9`, 2026-08-28), and `REQ-player-detail` asks this page
  to carry "the same season facts... with the same interaction" the board
  does. Three rows, not one, is that decision applied rather than departed
  from.
- **Jersey, Coach group, Formalwear, Blues, Eligibility and Availability**
  render exactly as the board's own columns define them — same value sets,
  same labels — because Mission 9 and Mission 11 have decided nothing more
  specific for this page than they have for the board.

**Row label copy**, where it differs from the board's own (terser) column
header: "Jersey — Blue" / "Jersey — White" (board: "Blue #" / "White #") and
"Half / Full Blue" (board: "Blues") both come directly from the approved
mockup's own script (`W6-01.js`), used twice independently — once there and
once in the reference fidelity mockup (`chore/roster-fidelity-mockup`'s
`player-record.tsx`) — so this page's own copy follows the mockup rather than
the board's terser header the way a label column reasonably can. (Checked
again directly against the W6-01 photograph in the review behind correction
round 2: this is mockup-conformant, not a departure — an earlier draft of
this ticket and the PR body carried it as a self-flagged limitation; that
claim was wrong and is removed.)

## Attendance — built in this package's correction round (`Q15-attendance`)

The first pass read the approved photographs' silence as authoritative over
the Linear issue body and `workflows/W6-open-one-players-record.md`, both of
which state this season's RSVP and attendance history renders here, read-only,
from Mission 2; the gap was put to Brian as owner question `Q-15` and he ruled
**the prose stands**: the section ships this mission, on this page, and
nowhere else — the person record keeps only its change-history section. Brian
then saw and approved a fidelity mockup of exactly this section
(`chore/roster-fidelity-attendance`'s `attendance-section.tsx`), which this
build follows for behaviour, restyled rather than copied wholesale.

**Its own band**, not nested inside Season or under Availability, in **violet
`#4527a0`** — a dark hex on a ~5% alpha wash, constructed like the other
three. Deliberately not red, orange or green: the band carries a percentage,
and a traffic-light hue would read as a verdict on the number.

**Rows** — every event this membership had an invitation **sent** for
(`public.invitations.status <> 'pending'`), this season only. An audience
member with no invitation is not a row.

**Columns, all sortable by clicking the header** — Event · Date · Mandatory ·
RSVP · Attendance. Default sort is date, most recent first.

**One score** — mandatory events only, attended ÷ mandatory events carrying a
recorded attendance, shown with the raw counts. `present` and `late` count as
attended (`isShowedPresence()`, `attendance-vocabulary.ts`, unmodified);
`absent` and `excused` do not. Rows with an invitation but no attendance
record — anything upcoming, and cancelled invitations — appear in the table
and are excluded from the score for the same reason: the score reads
attendance, not the calendar or the invitation status, so neither needs a
special case.

**Three filters** — Mandatory, RSVP, Attendance — restyled from the board's
own funnel-in-a-bordered-button and "Filtered by … · Clear all" chip row
(`attendance-section.tsx` reimplements the small presentational pieces rather
than importing them from `roster-board.tsx`, which this package does not
edit). Filters combine; there is a plain way back to unfiltered. **The score
follows the filter**, recomputing against the filtered set, with a `Filtered`
chip marking that it is describing a subset rather than the season.

**At 375px** each event stacks as a labelled block, not a sideways scroll,
with the filters as compact labelled selects above the sort control.

**Read-only.** Mission 2 owns this data: displayed, never edited. No write
path, no action, no edit affordance anywhere in this band.

`not recorded` is explicit for every absent RSVP or attendance value — never
blank, never conflated with No. RSVP and attendance are two independent
reads (`public.current_rsvp`, `public.attendance_records`); a `yes` never
implies a `present`, per locked Requirement 7.

Data access is `readAttendanceHistoryIn()` in `player-record.ts`, a plain read
alongside the module's other season-scoped reads — no migration, and player
capacity's own `season_membership_id` anchor gives the season scope for free.

## Correction round 2 (review `inv-fc59c691-dec`, findings F1/F2/F4)

**F1 — `REQ-no-narrative`.** Four secondary caption lines went beyond the
single sentence the requirement allows an empty/refusal/error state, and none
appeared in either approved photograph: Emergency contact's third-party-data
explanation, Formalwear's "reasked each season" note, the onboarding-alert's
second sentence (the count itself, in the first sentence, is a legitimate
state and stays), and Half/Full Blue's note pointing at the derived total
elsewhere. All four are deleted outright. `record-view.tsx:365`'s "Derived
from date of birth" stays — that is the `REQ-not-recorded` disclosure a
derived value that cannot be derived is required to give, not narrative.

**F2 — retired coverage.** Three assertions from the two pages this rebuild
replaced had no equivalent anywhere in the new test tree: hydration-safe
status-history time formatting, the single-exit guard (a defect Brian
identified himself on 12 August 2026 — "View membership" led back to this
same page with the banner dismissed, nowhere the operator could tell), and a
parametrized no-confirmation-dialog assertion across the free status ladder
(the surviving suite covered only onboarding→active). A fourth, the
raw-contact-values Alert text, was also untested. All four now have named
tests in `[membershipId]/screens.test.tsx`. A fifth retired assertion — an
existing preferred phone left unchanged — was checked and confirmed to have
no surviving code path: that disclosure belonged entirely to the old
`readMembership`-based confirmation screen this package replaced, and nothing
in `PlayerRecordData` or this page's rendering carries a preferred-contact
narrative any more. Correctly gone, not restored.

**F4 — copy drift from the binding mockup.** The departed-season caption
shipped as "This season is closed. Nothing here is editable."; the approved
W6-02 photograph carries "This season is over. Nothing here changes it." in
the identical position. Corrected to match verbatim.

## Explicitly not in this ticket

- The roster board itself (`/operate/roster`) — LAN-186's, opened and not
  rebuilt.
- Onboarding behaviour and the collection request — Mission 7's; this shows
  items and provenance only.
- What positions, jersey, coach group and availability _mean_ — Mission 9's.
- Eligibility records — Mission 11's.
- Per-person change history — the person record's, linked and not duplicated.
- Writing RSVP or attendance — Mission 2's; this page only ever reads it. See
  "Attendance" above for what is built.

## Acceptance criteria

The fifteen checkboxes under **Acceptance** on the live LAN-187 issue are
binding verbatim. This document does not restate them.
