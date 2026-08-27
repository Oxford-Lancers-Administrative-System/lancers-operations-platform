# Overview — M-PEOPLE-AND-ROSTER

## Designed outcome

Every human the club holds is findable, readable, correctable and
de-duplicable by the four-role group, and this season's squad is a working
command surface rather than a four-column list.

Concretely, when this mission closes an operator can: find any person by name,
known-as or alias; open a record that shows what is known, what is `not
recorded`, what is `disputed — awaiting verification`, and how confident each
value is; correct any of it with the change attributed and the old value
superseded rather than erased; add a coach or committee member who holds no
membership; merge two records for the same human without losing either
identity; and work a missing-data list that says who is incomplete and in what.

Missions 6 and 7 then add their stages — recruit doors and funnel, onboarding
and consent — to these surfaces rather than inventing their own.

## Why now

Three reasons, in order of force.

**Nothing downstream can be specified until this exists.** Missions 6 and 7 are
layers by construction. Both write to the durable person record, both call the
duplicate check, both extend the same collection-request contract, and both
display their stages on the People and Roster surfaces. Intaking either first
means guessing at a record that does not exist yet.

**The gap is live, not theoretical.** On 2026-08-21 Brian created person records
against the deployed application while testing operator invitations and could
neither correct nor remove them (LAN-147). There is no person surface, no update
operation anywhere in the service layer, and persons are only ever created as a
side effect of something else. Today the only correction path is hand-written
SQL, which the working agreement reserves to Brian and forbids to every agent.

**A shipped decision is due to be superseded.** The vertical slice let any linked
operator read contact values as an interim ruling (LAN-146 A2 / journal Q-21).
Task 08 §6's four-role matrix supersedes it when this mission ships. That is a
narrowing of access on surfaces already in use, and it should happen
deliberately, in a mission that owns the authority matrix, rather than
incidentally later.

## In scope

The durable person record and the two operator surfaces over it: **People**
(every human the club holds — coaches, committee, prospects, alumni) and
**Roster** (this season's players) plus player detail. Add-or-link without a
membership; correction; audited merge; aliases, with known-as collapsed into
them; alumni derivation and its override; the missing-data queue's
definition and its working surface; per-person change history; the
emergency-contact lockdown; read-only display of Mission 2's participation
history; extension of the local synthetic seed where a journey needs a case it
lacks. The shipped roster and player-detail surfaces are **redesigned**, not
extended.

Field coverage is Task 08 §4's inventory minus the onboarding-specific and
recruitment-specific rows, coaching-adjacent fields included.

## Out of scope

Messaging of any kind. Consent capture and lawful basis. Import, carry-forward
and the season bootstrap. Season creation and lifecycle. Channel presence. Club-role assignment
and operator seats. A person editing their own record. The collection request
itself. The recruits list, funnel and entry doors. Onboarding item behaviour and
the chase. Football assignment semantics and availability behaviour. Destructive
removal, erasure, retention execution and subject-access export. The general
audit reading surface. Player-facing logins.

Three of those deserve their reason stated, because each was argued and settled
in this intake rather than inherited. **Club-role assignment and operator seats
stay with Mission 1** — recording who holds a club role is that mission's
surface and is not reopened here. **A person editing their own record is Mission
7's**: Task 11 §2.1 and its decision log of 2026-08-15 already place coaches and
committee members in the collection loop for person-level data, and §7 records
that players, coaches and committee "supply and correct their own data via
signed links", so no settings surface is needed. **The collection request is
Mission 7's too**: Task 11 §1 states the division directly — Task 08 defined the
missing-data state and queue, Task 11 defines the chase and consumes that queue
rather than redefining it. This mission owns the fact-level states; the request
record, the one-open-request rule and all cadence belong there.

`00-boundary.md` carries the full list with its owners; this section is a
restatement, not a second authority.

## Cross-cutting invariants

- **Privacy and capability boundary:** the People and Roster surfaces and every
  contact, academic, DOB and emergency-contact value are the four-role group's
  only — President, Vice-President, Secretary, General Manager (Task 08 §6, D8).
  Coaches keep the narrow LAN-110 attendance scope and never see contact,
  academic, DOB, emergency-contact, consent or administrative data. Column
  visibility is a function of the viewer's category grants, so a future decision
  widening roster access drops restricted columns automatically rather than by
  special case. Anything the viewer's role does not grant is **absent from the
  DOM and the payload, not hidden** (LAN-75 contract). Emergency contact is
  locked down structurally: never a Person row, never a contact point, never
  reachable by any audience or messaging machinery, and out of leadership
  exports by default.

- **The person-versus-season test.** Every field disposition in this mission
  answers one question: does it travel season to season, or does it live and die
  with the season? Durable facts belong to the person record; season-bound facts
  belong to the season. Applied twice in this intake, and the second time it
  moved scope out: the phone number and the email are the person's, while
  **membership of a season's communication group is the season's**, so channel
  presence left this mission for Mission 6. Someone can be reachable on
  WhatsApp, in this season's group, and still not have approved being messaged —
  three separate facts with three different homes. A field's lifecycle class is
  also **not** the same as its owning mission: DOB and emergency contact are
  durable person facts captured at onboarding by Mission 7.

- **State vocabulary.** The frozen model governs; this mission adds no club
  concept. Membership uses the eight-value `membership_status` enum unchanged,
  prospects the existing `prospect_status`. The two states this mission makes
  first-class are already approved in Task 08 §6: `not recorded` is explicit,
  visible and never defaulted — never conflated with "No", the lesson of the
  2023 workbook's defaulting Rookie column — and a contested value is flagged
  `disputed — awaiting verification`, joining the missing-data queue.

- **Audit posture.** Every edit is attributable and audited (invariant M2).
  Contact corrections **supersede rather than overwrite**, preserving dated
  history and one preferred value per kind. A merge preserves both source
  identities and never deletes the losing row (invariant I6); the losing row
  points at the survivor so imported rows keep their provenance. Person history
  is append-only, and per-person change history is readable on the record it
  describes.

- **Safety, consent and recovery.** This mission sends nothing and records no
  lawful basis, so no code path here may compose, schedule or dispatch a
  message. It creates no destructive delete. No real club data in any
  environment — LAN-86 still gates that — and local Supabase only. Where a value
  is contested the record says so rather than picking a side.

- **Rollout constraints.** A surface renders a field only where its substrate
  exists on `main` at build time, so consent state and availability are absent
  at this mission's acceptance by design, not by omission. Redesigning surfaces
  the vertical slice shipped is permitted under the portfolio's
  backwards-looking rule, recorded as dated superseding notes. Because import
  moved to Mission 7, **this mission closes walkable against seeded data only** —
  the seed must carry enough non-player people (a coach, a committee member, an
  unconverted prospect, a first-name-only legacy record, a duplicate pair) for
  the People surface to be reviewable. Mission 4 will move `main` during this
  intake; its surface is messaging and scheduling, which this mission does not
  touch.

## Sources

Recorded with authority class, durable reference and observed version in
`sources.md`. The controlling brief is Task 08, approved 2026-08-15 and carrying
a dated owner note of 2026-08-26 that routes it here. Repository facts are
observed at `main@2115bfe`. The adopted ground-truth trace under `evidence/` is
provenance only and decides nothing.

## Brian approval

- Exact words: "Approved, approved, go."
- Date: 2026-08-26
- By: Brian Schuster

Approved with four corrections Brian dictated in the same session and which are
applied above: club-role assignment removed from scope and routed back to
Mission 1; a person editing their own record routed to Mission 7 on the strength
of Task 11 §2.1 and §7; the collection request likewise routed to Mission 7 per
Task 11 §1, leaving this mission the fact-level states and the queue; and seed
extension named as scope. Per-person change history was confirmed in scope —
"that's part of the audit trail, that makes sense."
