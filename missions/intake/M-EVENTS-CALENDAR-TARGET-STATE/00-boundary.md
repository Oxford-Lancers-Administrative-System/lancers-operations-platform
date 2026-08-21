# Boundary — M-EVENTS-CALENDAR-TARGET-STATE

- **Portfolio mission number:** 2
- **Commissioned outcome:** Events & Calendar Target State — "approved event
  model: status/occurrence migration (first work package), term import, C4
  amendment/cancellation, templates and questions, D83–D86 calendars,
  participation view".
- **Portfolio row URL and observed version:**
  [Release One Mission Portfolio, row 2](https://app.notion.com/p/3bb488886d578126a88cdd747f590a01)
  — portfolio approved by Brian Schuster 2026-08-19; row authority state
  "Owner-approved direction"; packet and execution "No packet"; next step
  "Commission Mission Intake after Mission 1 completes". Page fetched
  2026-08-20.
- **Observed `main` SHA:** `c894f1de000e1b6f20427dec41a3c86a79b3973e`

## Primary coverage

Task 01 (Events brief), R4, Scope 1 — quoted from the portfolio row.

Supplemental coverage the portfolio routes here explicitly:

- Events decisions of 2026-08-18 — D83–D86, legacy mapping, import baseline.
- C4 amendment and cancellation, **event-side rules only** (Q6/Q7/Q9, D49–D61).
- R7's occurrence correction, shared.

## Deliberately shared coverage

Shared material stays visible; it does not migrate into this mission.

- **C4's delivery half rides Mission 4's pipeline** (Task 02 F2). This mission
  owns the event-side amendment and cancellation rules; Mission 4 owns the
  delivery machinery those rules ride.
- **Task 04 occurrence corrections** — Task 04 is otherwise satisfied; only the
  occurrence residual is shared here.
- **App Shell collision domains** are recorded against Mission 3 and must be
  noted, not resolved here.

## In scope

The approved event model and the calendar surfaces that present it:

1. Event status and occurrence migration — named in the row as the first work
   package.
2. Term import.
3. C4 amendment and cancellation, event-side rules.
4. Event templates and questions.
5. D83–D86 calendar behavior.
6. The participation view.

The frozen inventory at Stage 2 decides how these become workflows. This list is
the commissioned boundary, not a workflow list.

## Out of scope

- **Per-event RSVP delivery — scheduling, sending, re-anchoring, diagnostics,
  reminders, escalation and recovery.** The approved portfolio assigns these to
  Mission 4. See the split decision below.
- Anything the portfolio assigns to another mission or to Tracks A and B:
  the trusted app shell and account surfaces (Mission 3), People/roster and
  recruitment (Mission 5), onboarding completion (Mission 6), consent and data
  rights (Mission 7), football assignments and availability (Mission 8),
  leadership reporting and exports (Mission 9), season lifecycle and committee
  handoff (Mission 10), production hardening (Mission 11).
- Release One's recorded exclusions, which remain excluded: event capacity
  limits and guest/plus-one RSVPs are consciously absent from Release One, and
  broadcast announcements stay in WhatsApp groups.

## Split decision

**No split.** One commissioned outcome remains one mission. Nothing about this
boundary creates a safety, authority, readiness, dependency or outcome-coherence
problem that a Mission Lead's DAG cannot contain.

## Portfolio deviation

**None.** The fused Events + RSVP-delivery boundary asserted by the closed
PR #53 packet is **not** adopted. That fusion was one of the recorded causes of
the earlier intake failure — it was asserted silently, without an owner boundary
decision, against a portfolio that splits the work across Mission 2 and
Mission 4. Brian was offered the explicit amendment and declined it.

## Dependencies and gates carried into this intake

- **Stewart import-format confirmation** — a portfolio-recorded gate on term
  import; the row states it is refined inside the first work package, so it does
  not block intake.
- **Mission 1 execution.** The row's next step reads "Commission Mission Intake
  after Mission 1 completes", while the portfolio's own sequence summary records
  that next-mission intake preparation is safe concurrency alongside execution.
  Brian commissioned this intake on 2026-08-20 with Mission 1 still executing;
  that is the concurrency the portfolio permits, and it is recorded here rather
  than treated as a deviation.

## Brian approval

- **Exact words:** "I approve the name. Keep the approved split. Mission 2 should
  just be on those things. Delivery belongs to the other one."
- **Approval date:** 2026-08-20
- **What it approved:** the mission id `M-EVENTS-CALENDAR-TARGET-STATE`, and
  option (a) of the boundary question put to him — keep the portfolio's approved
  split, with per-event RSVP delivery remaining Mission 4's.

## Amendment 1 — calendar distribution, 2026-08-20

Calendar distribution is **in scope**: live subscription feeds for Google,
Microsoft and Apple, reachable by a button on the public website.

The approved brief left this open — D11 records it as "wanted and unscoped" and
Q3 carries it as an open question owned by Brian — so scoping it closes Q3
inside Task 01's own boundary ("calendar readership and the three access
tiers", brief §1). It is not a portfolio amendment and takes nothing from
another mission.

- **Brian's exact words:** "Okay, yes, we definitely want calendar distribution.
  There should be a Google, Microsoft, and Apple feed that automatically goes
  through and is included. That should be a normal part of this. Anyone should
  be able to come up to the website and click a button, and it's saved into
  their calendar. There's a public calendar. We will confirm what goes into the
  public versus the private calendar. […] Any time the calendar is created, it
  should automatically have the update, whatever that is."
- **Date:** 2026-08-20
- **Left open by the same decision:** what the public calendar and its feeds
  carry versus what stays behind the club link. Recorded as open item 1 in
  `01-overview.md` and settled when the calendar workflow is specified.

## Baseline drift — 2026-08-20

The baseline moved from `bc6770b1c6a616dde041324ef99329b231becfc3` to
`c894f1de000e1b6f20427dec41a3c86a79b3973e` during intake, and the ledger branch
was rebased onto it so that the packet pins a real `main`.

**Assessment: tolerated, no re-intake.** The two commits are
`ea9a2fb` (Administration holders, dates and limits — Mission 1's work) and
`c894f1d` (Playwright added as a development dependency). Neither changes
meaning, feasibility, invariants, interfaces or acceptance evidence for this
mission:

- No file under `src/app/operate/events/`, `supabase/migrations/`,
  `src/lib/services/calendar.ts` or `src/lib/services/events.ts` was touched.
- `src/lib/club-time.ts` gained `formatClubDay` and `addClubDays` additively;
  `todayInClubZone`, which the calendar uses, is unchanged.

Every code reading recorded in this ledger was re-verified against the new SHA.

## Baseline drift — 2026-08-21

The baseline moved again during Stage 3, from
`2072ecded1d2b6cc28701fd634a28112b9e16a50` to
`c894f1de000e1b6f20427dec41a3c86a79b3973e`, and the ledger branch was rebased
onto it.

**Assessment: tolerated, no re-intake.** The two commits are `efb9700`
(Playwright merged to `main`) and `c894f1d` (LAN-141 — administration disclosure
branches, presentation rules and the database target). Neither changes meaning,
feasibility, invariants, interfaces or acceptance evidence for this mission:

- No file under `src/app/operate/events/`, `supabase/migrations/`,
  `src/lib/services/calendar.ts`, `src/lib/services/events.ts` or
  `src/app/api/` was touched.
- The changes are Administration surfaces, their tests, and local database
  tooling — Mission 1's territory.

Every screenshot in `mockups/current/` was captured at the previous SHA. Because
no Events surface changed between the two commits, they remain accurate at this
baseline.
