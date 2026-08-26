# Boundary — M-PEOPLE-AND-ROSTER

- Portfolio mission number: 5 (Release One Mission Portfolio **v2**, approved
  2026-08-26). Portfolio v1's Missions 5 and 6 are retired; this is the v2 base
  mission, not a resumption of the v1 intake.
- Commissioned outcome: **People & Roster** — the durable person record and the
  two operator surfaces over it. Every human the club holds is findable,
  readable, correctable and de-duplicable; this season's squad is a working
  command surface. Recruitment (M6) and Onboarding (M7) layer their stages on
  top of what is built here.
- Portfolio row URL and observed version:
  [Lancers Current Project Status](https://app.notion.com/p/3bb488886d578126a88cdd747f590a01),
  Release One Mission Portfolio row 5, Portfolio v2 approved by Brian Schuster
  2026-08-26; fetched 2026-08-26T13:41Z.
- Observed `main` SHA: `2115bfed9d08ab9146fe00f002d6337cae9796a2`
  ("Schedule the club's messaging instead of waiting for a person (#91)").
- Primary coverage: Task 08 (Person, Roster & Player Profile) · R3 roster side
  (season side shared with M11) · Scope 4 people/roster half.
- Deliberately shared coverage:
  - R2 record side — recruitment side is M6's primary.
  - The People surface is consumed by M9's coach registry.
  - The missing-data queue is **defined here**, chased in M7, surfaced in M10.
  - LAN-147 is absorbed into this mission's acceptance criteria; destructive
    removal stays M8 (owner decision 2026-08-25).
  - LAN-146 A1 (member-facing duplicate check unbound by tests) is absorbed
    here, because the duplicate check is core M5 machinery.
  - LAN-146 A2 / journal Q-21 (any-operator contact reads) was an interim slice
    ruling; Task 08 §6's four-role matrix supersedes it when this mission ships.
    Not a conflict.
  - The G4 complete-data export **contract** — full inventory minus emergency
    contact — is defined here and built in M10.

## In scope

- The durable person record: every field in Task 08 §4's inventory that is
  neither onboarding-specific nor recruitment-specific, coaching-adjacent
  fields included. M9 layers football semantics on top.
- Two operator surfaces, both four-role only: **People** (every human the club
  holds — coaches, committee, prospects, alumni) and **Roster** (this season's
  players) plus player detail.
- Add-or-link a person with no membership, with a deliberate duplicate check.
- **Assigning a club role to a person who has no operator seat** (see the
  portfolio deviation below).
- Correction: attributable, audited; contact values supersede rather than
  overwrite; `disputed — awaiting verification` as a first-class state.
- Audited person merge (invariant I6), including its three unresolved edges:
  an operator seat on the losing record, the
  `recruitment_prospects_one_per_person_per_season` collision, and consent-record
  precedence.
- Aliases as dedupe evidence; never roster display.
- Channel presence as **group membership per channel, dated** — reachability is
  already carried by `contact_points`.
- Alumni standing: derivation from membership history plus the existing
  `past_member_override`.
- The missing-data queue's definition and its working surface: required-field
  definition, `not recorded` explicit and never defaulted, per-field indicators,
  a roster flag, and a filter that produces a real list.
- The collection-request **contract** — Task 11 §2.3's "at most one open
  request per person, ever" — defined here so M6 and M7 build one shared thing.
- Per-person change history on the person and player detail surfaces.
- Emergency contact's structural lockdown as a locked invariant: never a Person
  row, never a contact point, never reachable by any audience or messaging
  machinery, out of leadership exports by default.
- Read-only display of M2's RSVP, attendance and event history on player detail.
- **Redesign, not extension**, of the shipped `/operate/roster` and
  `/operate/roster/[membershipId]` surfaces (portfolio rule 3, backwards-looking
  and progressive).

## Out of scope

- **Messaging of any kind.** No send, no compose, no transport. First contact is
  always the WhatsApp accept, built in M6 (recruit doors) and M7 (onboarding).
- **Consent capture and lawful basis.** M6 owns recruit-door opt-in, M7 owns
  season-membership consent, M8 owns policy, wording, versioning and rights.
  Nothing here may send without a basis, so nothing here sends.
- **Import and carry-forward**, and with them the season bootstrap — moved to M7
  (see deviation below).
- Season creation and all season lifecycle: open, close, rollover — M11.
- The recruits list, funnel stages, recruit notes and the four entry doors — M6.
  This mission builds the duplicate-check and merge machinery those doors call.
- Onboarding item behaviour, the checklist, nudges, the chase — M7. This mission
  displays items and their per-item provenance.
- Football-assignment semantics and availability behaviour — M9. This mission
  fixes only surface placement and the read restriction.
- Destructive person removal, erasure, retention execution, subject-access
  export — M8.
- The general audit reading surface — M3. Per-person change history is here
  because it is inseparable from correction and merge.
- Player-facing logins; fields with no source evidence and no decision (home
  address, nationality, kit size) — Task 08 §1 exclusions stand.

## Split decision

**No split.** People and Roster are two views over one record and one field
inventory; building the inventory twice yields two versions of what
`not recorded` means. No safety, authority, readiness, dependency or
outcome-coherence problem requires separation.

## Portfolio deviation

Two exact amendments to the 2026-08-26 row, both from Brian in this session:

1. **The minimal season bootstrap moves out of Mission 5 and into Mission 7,
   delivered as the import.** The row currently assigns M5 "a minimal season
   bootstrap (a season row so the roster has a scope)" and records the mechanism
   as an open owner decision with a seed-only default. Brian: _"the import is the
   season bootstrap for now… Season Bootstrap will move with 7, basically, right
   to get it open, but it'll be done with an import, so that settles it one way
   or the other."_ This closes that open decision and removes season creation
   from this mission. Consequence recorded: **this mission closes walkable only
   against seeded data**, since no path for real records to arrive exists until
   M7.
2. **Assigning a club role to a person who holds no operator seat is named as
   Mission 5 scope.** The row does not mention it. It is within Task 08 §2's
   add-or-link path, and it is load-bearing: `event-audience.ts:200` resolves
   coaches and committee members to invitations **only** through
   `role_assignments`, and the sole writer of that table on `main` is
   operator-invitation acceptance (`operator-invitations.ts:1571`). A coach who
   never logs in therefore cannot be invited to an event today. Recording a club
   role is a different act from granting system access; M1's invitation flow is
   unchanged and still the only way to obtain a login.

Unchanged from the row and explicitly reconfirmed this session: **this mission
ships no messaging of any kind**, and surfaces render a field only where its
substrate exists on `main` at build time.

## Repository drift

Mission 4 (LAN-169–173) is executing and will move `main` during this intake.
Tolerable by the portfolio's own note and confirmed by inspection: its surface
is messaging and scheduling, which this mission does not touch.

## Brian approval words

-

## Approval date

-
