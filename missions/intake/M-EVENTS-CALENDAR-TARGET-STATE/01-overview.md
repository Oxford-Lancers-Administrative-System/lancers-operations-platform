# Overview — M-EVENTS-CALENDAR-TARGET-STATE

Cross-cutting definition for the mission. Workflows are not listed here; they
are frozen separately in `02-workflows.md` at Stage 2.

## Designed outcome

The club's calendar becomes the thing the club actually runs on. A term's worth
of events enters the system in one import rather than one form at a time; every
event carries the seven-type model, its equipment and description, its online or
in-person venue, and its own questions; the club calendar is readable by anyone
in the world in both a Gregorian and a continuous Oxford academic-year
projection; an approved event can be amended, rescheduled or cancelled without
losing the responses already collected; and one participation table shows, per
person, what they said and whether they turned up.

Stated as the portfolio states it: "approved event model: status/occurrence
migration (first work package), term import, C4 amendment/cancellation,
templates and questions, D83–D86 calendars, participation view"
([portfolio row 2](https://app.notion.com/p/3bb488886d578126a88cdd747f590a01)).

## Why now

Three things make this the next mission rather than a later one.

1. **The stored status model is wrong and everything else sits on top of it.**
   The database still carries eight event statuses, a ten-value type enum, an
   `events_outcome_is_asserted` check constraint and an alternative-group
   index that the approved brief retired
   ([Events brief](https://app.notion.com/p/3bc488886d5781138de8c03209ed6bcf)
   D12, D27–D31, D79). Every later Events surface has to be written against
   either the old model or the new one; doing the migration first is why the
   portfolio names it the first work package.
2. **Import is how the club's events actually arrive.** D32 makes import the
   primary route in Release One and D82 pulls it forward as the release's
   centrepiece. Without it the club hand-enters a term card.
3. **An approved event currently cannot be changed at all.** C4 has no
   implementation (`README` limitation list, Authority Manifest §9 Scope 1), so
   a rescheduled practice today means telling people in WhatsApp and leaving the
   record wrong. OD-1 closed the last three open constituents on 2026-08-18, so
   C4 is definition-complete and buildable.

## In scope

Bounded by `00-boundary.md`, which Brian approved on 2026-08-20.

- **The event record and its status model.** Seven types; three stored statuses
  `draft` · `approved` · `cancelled`; `occurred` derived, never asserted;
  equipment as its own field; description free text; online/in-person venue;
  mandatory/optional; no opponent field; no cost field. (D12–D31)
- **Legacy data migration** under the owner-approved 2026-08-18 mapping —
  `pending_approval`/`withdrawn`/`rejected` → `draft`, `occurred` → `approved`,
  `not_held` → `cancelled` silently, `camp` → Practice, `fixture`/`varsity` →
  Game, `other` listed for one-time operator reassignment.
- **Term import and re-import**, mass delete, and duplicate. Format baseline is
  the club's own term-card spreadsheet, refined with a real operator inside the
  first work package. (D32–D39, D82)
- **Templates and per-event questions.** Per-type defaults including default
  audience and default questions; template values keep flowing into a draft and
  freeze at approval; three answer types; per-question mandatory toggle.
  (D40–D42, D47, D66–D68)
- **Audience.** Four standing groups plus the Recruitment-only recruits group;
  no unit or kit groups; inactive people never invited; import carries no
  audience. (D43–D48)
- **Amendment, rescheduling and cancellation (C4).** Return-to-draft preserving
  invitations and RSVPs; the operator's notify choice with its recorded
  defaults; explicit re-notify; cancellation as its own terminal action with no
  approval gate; internal cancellation reason never shown to recipients.
  (D49–D61, D76, and OD-1's Q6/Q7/Q9 closures)
- **The calendar.** Public read with no account; three access tiers; Calendar
  View and the continuous academic-year Oxford View; per-type shared colors;
  grouped list projections; Europe/London time entry shown explicitly.
  (D1–D11, D83–D86)
- **Calendar distribution — subscription feeds for Google, Microsoft and
  Apple.** Anyone on the website clicks a button and the club calendar is saved
  into their own calendar. The subscription is **live**: an event created,
  changed or cancelled afterwards updates in the subscriber's calendar without
  them doing anything. This closes Q3 and scopes D11. (Brian, 2026-08-20)
- **The event page and the participation view.** Three headline numbers,
  audience list with RSVP and attendance, discrepancy marker, operator-only
  delivery flag and exit link, and the full one-row-per-person participation
  table behind the club link. (D62–D65, D68)
- **Attendance availability**, as the successor to the retired occurrence
  assertion: the sheet opens on a buffer before the event, never closes, and
  its saved-versus-untouched state is the record of whether the session was
  assessed. (D71–D74)

## Out of scope

- **Per-event RSVP delivery — scheduling, sending, re-anchoring, retry and
  diagnostics.** Mission 4. See the seam below.
- **The RSVP page itself, reminders and escalation.** Task 03, Mission 4.
- **Attendance capture** beyond D71–D74's availability rules. Task 04.
- **The Monday report.** Task 05, Mission 9.
- **Consent and real-data cutover.** Task 07, Mission 7.
- The Events brief's own §8 exclusions, which stand unchanged: saved or custom
  audience groups · venue directories, maps, routing, coordinates · private or
  hidden events · venue booking state · an opponent field · reversing a
  cancellation · an approval gate on cancellation · per-event deadline
  overrides · a blocking RSVP cutoff · bulk-edit screens · recurrence as a
  series engine · alternative-group machinery · multi-type events · a cost
  field.
- Release One's §8 deferrals that touch Events: private/hidden events, the
  event templates-subscriptions-bulk-changes admin surface (LAN-106), the
  operating-horizon report (LAN-109/G3), bulk spreadsheet import at S5 scale.

## Cross-cutting invariants

### The Mission 4 seam

This is the boundary the previous intake crossed silently, so it is stated once
here and every workflow inherits it.

**Mission 2 decides that a message is owed, and to whom. Mission 4 makes a
message arrive.**

Mission 2 is the club's rules about its own events: this change is material,
so people should hear about it; these people are the audience; the operator
chose to notify (or not); a cancellation tells everyone by default. It produces
a _fact_ — someone is owed a message about this event — and records who decided
it and when.

Mission 4 is the machine that discharges that obligation: it picks the moment,
formats and sends the message, knows which number or address it went to, sees
that it was delivered or failed, retries, and runs the chase and escalation
streams over people who have not answered.

**The test, when a case is unclear:** _would the answer change if the club
switched from WhatsApp to email tomorrow?_ If yes, it is Mission 4. If the rule
holds regardless of how the message travels, it is Mission 2.

| The question                                                      | Owner                                     |
| ----------------------------------------------------------------- | ----------------------------------------- |
| Is this change material enough to tell people?                    | Mission 2 (D55)                           |
| Does the operator want this particular change to notify?          | Mission 2 (D54)                           |
| Who is told — everyone invited, or only some of them?             | Mission 2 (OD-1/Q9: everyone)             |
| Does a cancellation tell people by default? Can it be silent?     | Mission 2 (D58)                           |
| Can a missed notification be sent again?                          | Mission 2 owns the re-notify action (D54) |
| When is the invitation actually sent, and the follow-up after it? | Mission 4                                 |
| What does the message say, in which template, over which channel? | Mission 4                                 |
| Did it reach this person's number? Did it fail? Retry?            | Mission 4                                 |
| Who has not answered yet, and when do we chase them?              | Mission 4                                 |
| What happens to undelivered jobs when the event returns to draft? | Mission 4 (Task 02 D5)                    |

Two shared values sit exactly on the line, and the split is the same in both:

- **The chase thresholds** — 2 days for Practice, S&C, Chalk, Recruitment and
  Meeting; 7 for Game; 5 for Social (D75, D77). Mission 2 stores them as
  event-type configuration and recomputes the threshold against the new date
  when an event is rescheduled (OD-1/Q6). Mission 4 does the chasing.
- **The delivery flag on the event page** (D65). Mission 2 owns that a problem
  indicator appears at the operator tier and nowhere else; Mission 4 owns what
  the indicator is reporting.

### Privacy and capability boundary

Three tiers, and they are a deliberate widening of the application's current
posture rather than an extension of the operator shell:

| Tier      | Who                                                      | Sees                                                |
| --------- | -------------------------------------------------------- | --------------------------------------------------- |
| Public    | anyone, no account (D1)                                  | calendar and event facts only                       |
| Club link | anyone holding the signed link operators distribute (D2) | adds audience, RSVP, attendance, participation view |
| Operator  | President · Vice-President · Secretary · General Manager | adds delivery flag and every action                 |

Delivery detail is the only operator-locked element (D3). Coaches read at the
club-link tier. The club link is explicitly **not** privacy-blocking (D81) —
participation data is ordinary team information — but it is still a signed
link, not a public URL. Authorization is enforced in the service layer, never
by route visibility. Drafts are visible on the calendar the moment they are
saved (D4) and there are no private or hidden events (D5).

Three consequences worth naming because they are new. The calendar becomes the
application's first genuinely anonymous read surface, so viewing must be
side-effect-free for traffic that has no session at all. A public event page
must expose event facts without exposing who was invited. And a subscription
feed is a long-lived URL that leaves the application entirely — it sits in
someone's phone for a year, is re-fetched without a session, and may be shared
or indexed — so whatever the public feed carries should be treated as published,
which is why open item 1 below has to be settled before the feed is built.

### State vocabulary

One vocabulary, used identically everywhere. The previous intake's most
repeated defect was letting each screen imply a different lifecycle.

- **Stored event status:** `draft` · `approved` · `cancelled`. Nothing else.
- **Derived display state:** `occurred` — the date has passed and the event was
  not cancelled. It is never stored and nobody asserts it (D30).
- **Deleted, not withdrawn:** an abandoned draft is deleted. "Withdrawn" means
  it never became an event; "cancelled" means it was one and was called off.
  They are not two flavours of one state (D29).
- **Attendance is a separate two-state axis:** _not recorded_ versus _recorded_.
  The save is the signal, and a sheet saved with everyone absent is a real zero
  distinguishable from one nobody opened (D73). "Showed / Invited" renders "—"
  when nothing is recorded, never "0 / 37" (D74).
- **Delivery and RSVP are separate axes** and neither is a status of the event.
- Counts are raw pairs, never percentages.
- Status is never conveyed by colour alone, and per-type colour (D83) is
  identity, not status.

### Audit posture

Amendment and cancellation are the auditable events here. Every change to an
approved event records the actor, the change, and the notify choice (D54, §4.13);
change history is retained and queryable; a cancellation captures an internal
reason for the audit record that is never shown to recipients (D59, D76). No
mandatory amendment reason is required — OD-1/Q7 closed that, and the required
description carries any explanation. The existing `schedule_changes` table is
the natural home and its fitness is a Mission Lead determination, not a product
decision.

### Safety, consent and recovery

- **Recovery is a product feature here, not an operational one**: re-notify
  exists so a missed notification is recoverable rather than permanent (D54);
  mass delete plus re-import exists so a wrong batch is recoverable (D35);
  a past event may be cancelled after the fact as an administrative correction
  (D31), and that path is deliberately silent.
- **Import fails per row, never as a silent partial success**; unparseable rows
  are refused individually while the rest proceed.
- **A cancellation is terminal and cannot be reversed** (D60).
- **Consent is Mission 7's** and unchanged by this mission. Nothing here creates
  a new recipient or a new lawful basis; the audience rules only decide who
  among existing members is invited.
- **No real roster data** in any environment. Production holds only the
  demo-authorized showcase dataset, and the pre-pilot gate is unchanged.

### Rollout constraints

- **This mission owns a migration**, and it is the first work package. It
  removes the `events_outcome_is_asserted` constraint, narrows two enums, and
  retires invariant E3 with the
  `events_one_approved_per_alternative_group` index. Applying it to hosted
  Supabase is Brian's action alone; no agent does it.
- **The migration must be compatible with the deployed revision** in the order
  it is applied, because there is one production database and no staging.
- **Existing attendance records and saved sheets are preserved unchanged** by
  the `occurred` → `approved` remap.
- **`other`-typed rows have no default** and are listed for one-time operator
  reassignment during migration verification.
- The showcase dataset may be remapped in place or regenerated after migration;
  the approved semantics govern either path.

## Open at this stage

Recorded so they are not lost, and resolved before or during Stage 3 rather
than assumed:

1. **What the public calendar and its feeds carry, versus what stays behind the
   club link.** Brian on 2026-08-20: "We will confirm what goes into the public
   versus the private calendar." D5 locks that there are no private or hidden
   _events_ — every event exists on the calendar — so this is a question about
   how much of each event a stranger sees, and whether every type appears in the
   public feed. Resolved when the calendar workflow is specified at Stage 3, not
   assumed here.
2. **The discrepancy marker's shape** — column, flag, or derived from the two
   columns (D64, Q4, Brian). Resolvable at Stage 3 as a workflow decision.
3. **Players and coaches as separate sublists on the participation view**
   (Q5) — owned by the club, Stewart Humble and Clint Grohmann, not by Brian.
   Nonblocking; the default is one list unless the club asks otherwise.
4. **Import file format** (Q1, D38) — baseline is the club's term-card
   spreadsheet, pending Stewart's async confirmation, refined with a real
   operator in the first work package. Explicitly not a packet blocker.
5. **Club-link mechanism — expiry, rotation, revocation** (Q2). The privacy
   question is closed by D81; the owner wants the mechanism settled by testing
   rather than on paper.

## Sources

Full manifest with observed versions in `sources.md`. The controlling records
for this overview are the
[Events & Calendar brief](https://app.notion.com/p/3bc488886d5781138de8c03209ed6bcf)
(owner-approved 2026-08-14 rev 2; OD-1 closures and amendments D83–D86 added
2026-08-18), the
[Release 1 Authority Manifest](https://app.notion.com/p/3bf488886d57818aa53ec09f4fc5f757)
(published 2026-08-17), the
[Release One Mission Portfolio](https://app.notion.com/p/3bb488886d578126a88cdd747f590a01)
(approved 2026-08-19), and repository `main` at
`bc6770b1c6a616dde041324ef99329b231becfc3`.

## Brian approval

- **Exact words:** "okay, that's fair. Fine by me. I'll deal with the
  consequences of that." (approving the Mission 4 seam as written, after the
  escalation ladder — WhatsApp, WhatsApp, email, escalation — was confirmed as
  Mission 4's coverage under R6 and R12, and after "Okay, yes, we definitely
  want calendar distribution" scoped the feeds.)
- **Date:** 2026-08-20
