# 0016 — Production may hold controlled pilot data before staging exists

**Status:** Accepted · **Date:** 2026-08-11

Until now the position was simple: the hosted database holds **schema and
synthetic data only** until a staging environment and a rehearsed restore exist
(`docs/migration-runbook.md` § Pre-pilot gate). This ADR narrows that
prohibition rather than lifting it, and adds a retention rule that reverses the
obvious default.

## Context

The vertical slice (LAN-71 … LAN-82) delivers sign-in, an operator shell,
role-based authorization, an approval transaction and a no-login RSVP page.
Several of those cannot be honestly proved locally: authentication against the
hosted Auth service, authorization for a real signed-in leadership user, and a
link opened by a person on their own phone against the deployed container.

The three enabling gates that would make hosted testing routine — hosted staging
(LAN-83), production security and recovery validation (LAN-84), controlled use
of real club data (LAN-86) — are all outstanding and all cost or ownership
decisions. Waiting for them means the slice ships having never been exercised by
a human against the thing that will run it.

The pre-pilot gate's wording pre-dates that problem. Read literally it forbids
"any pilot user", which would forbid the only kind of testing available. Read
loosely it invites exactly what it exists to prevent: the real roster, loaded
early, into a database with no rehearsed restore.

Two further facts shape the decision:

- **There is no staging.** A pilot script is run once, by hand, against the only
  database there is. A cleanup that deletes one row too many is not caught by an
  environment; it is caught by having been written narrowly, or not at all.
- **Pilot data is more useful than it is tidy.** A later feature is best
  exercised against the events, invitations and responses an earlier feature
  created. Cleaning up after every ticket destroys precisely the accumulated
  state that makes the next test realistic.

## Decision

### 1. Two things, and only two, may exist in hosted beyond the schema

- **Durable pilot identities and access** for the approved leadership testers —
  Auth users, `people`, `operator_accounts` and truthful `role_assignments`.
- **Clearly synthetic feature scenarios**, owned by an issue, visibly
  artificial, deterministic where practical, and removable by a paired cleanup
  script written at the same time.

### 2. The real-data gate is unchanged

The real roster, and real operational data — events, RSVPs, attendance,
availability, subscriptions, contact details for anyone other than the pilot
testers themselves — remain **prohibited in every environment** until LAN-83,
LAN-84 and LAN-86 are satisfied. This ADR does not touch that, and no pilot
scenario may be a route around it.

### 3. Pilot access is truthful and time-bounded

Access is granted only as a seat the person actually holds. No constitutional
office, and no invented General Manager or coaching seat, is assigned to make
authorization pass. Every pilot-period grant carries an `effective_to` set in
the same statement that creates it, and is end-dated at handoff. Revocation is a
deactivation, never a delete: an actor referenced by history must stay
resolvable (invariant M2).

### 4. The ownership marker is a convention, not a schema concept

A scenario's rows are identified by deterministic primary keys **and** a
`PILOT-<ISSUE-ID>` sentinel in a text column. Adding a column, a table or any
other database concept to label test data is a **release-scope decision for
Brian** and is not taken by an agent.

### 5. Pilot data accumulates by default

Cleanup scripts are written with their setup and **retained, unrun**. They are
run early only when the data is sensitive, conflicting, misleading or harmful to
later testing, and at one deliberate cutover before the real roster is loaded.

### 6. Nothing applies pilot data automatically

No migration, seed, workflow, container image or application startup path
references `scripts/pilot/`. A pilot script reaches a database because a human
chose to run it. Running the scripts against the disposable **local** stack as
part of an automated test is verification, and is explicitly permitted.

### 7. Every pull request discloses the handoff

`.github/PULL_REQUEST_TEMPLATE.md` requires a **Production handoff** block —
migration, deployment order, pilot setup, pilot cleanup, other owner action, and
verification after the owner acts — plus pilot-data and recovery disclosure. An
agent tells Brian as soon as it discovers an owner action is required, repeats
it in the pull request, and repeats it at final handoff.

## Alternatives considered

**Wait for hosted staging (LAN-83).** The honest option, and it was rejected on
sequencing rather than on principle: staging is a cost and ownership commitment
that has not been made, and the slice would otherwise ship unexercised against
the deployed system. Nothing here weakens the case for staging; it remains a
gate for real data.

**Keep production schema-only and test everything locally.** Local Supabase
cannot reproduce hosted Auth, the deployed container, or a real person opening a
link on a phone. The result would be a slice that has only ever been observed
working in the environment least like production.

**Let the app seed its own test data behind a flag.** Rejected outright. A code
path that can write test data into production is a code path that will, and a
flag is one deploy away from being wrong. The prohibition on automatic execution
in decision 6 is the direct consequence.

**Add an `is_pilot` column, or a `pilot_data` table, to mark test rows.** Clean,
and rejected: it changes the approved domain model to serve a temporary process,
it is a new club-facing concept in a model whose absences are deliberate, and it
would outlive the pilot. A naming convention costs nothing and disappears when
the last scenario does.

**Clean up after every ticket.** The intuitive default, and wrong here — it
destroys the accumulated state that makes the next feature test realistic, and
it multiplies the number of destructive operations run by hand against the only
database there is. Fewer deletions is the safer posture.

## Consequences

- Feature work that needs hosted testing ships `scripts/pilot/<issue-id>/` with
  `setup.sql`, `cleanup.sql`, a `README.md` and an automated local test proving
  the safety properties. That is a real cost per ticket, and it is the point.
- Hosted state drifts from any single script's expectations as data accumulates.
  [`docs/pilot-data-manifest.md`](../pilot-data-manifest.md) is the register
  that makes it knowable, and it is updated in the same change that changes
  hosted state.
- Brian carries every hosted execution personally. The runbook is written so
  each one is short to read and refuses rather than improvises.
- A destructive mistake in a cleanup is still recoverable only by restore, and
  hosted restore has **not** been rehearsed (LAN-84). That is the residual risk
  this decision accepts, and it is why cleanups are narrow, run rarely, and fail
  closed.
- When LAN-83, LAN-84 and LAN-86 land, this ADR is revisited: staging changes
  where scenarios are exercised, and real data changes what may exist at all.
