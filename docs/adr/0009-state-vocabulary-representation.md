# 0009 — Frozen state vocabularies are enums; configurable ones are tables

**Status:** Accepted · **Date:** 2026-08-10

## Context

The frozen domain model defines state machines for season membership,
recruitment prospects, events, invitations, notification jobs, availability,
seasons and onboarding items. It also defines vocabularies the club configures
or has already changed: position taxonomies, onboarding item types, role names.

These two kinds of vocabulary look identical in a conceptual model and behave
completely differently in a database.

The model is emphatic about the first kind. Invariant M4 reads: "notification
jobs use exactly the six locked states" — "no seventh". The value of that
sentence depends entirely on something refusing a seventh.

## Decision

**Native PostgreSQL enum types for vocabularies the frozen model closes.**
Thirty-one of them, covering every state machine in model §2 plus the closed
value sets (`rsvp_value`, `attendance_presence`, `competition_scope`,
`invitation_capacity`, and so on).

**Tables for vocabularies the model says the club configures or versions:**

- `position_vocabularies` + `positions` — model §1.2 calls the position list
  "a versioned reference list", and the club used two incompatible taxonomies
  three years apart. Invariant S3 ("position values come from the season's
  vocabulary version") is then enforceable as a composite foreign key.
- `onboarding_item_types` — "item types are season-configurable so a new
  requirement doesn't need schema surgery".
- `roles` — Role is a conceptual entity in its own right, with aliases.

## Consequences

- A seventh notification job state is rejected by PostgreSQL, and
  `tests/schema-invariants.test.ts` proves it. The same holds for a third RSVP
  answer, which is what keeps locked Requirement 5 true in the storage layer
  rather than only in the UI.
- `supabase gen types` renders enums as TypeScript union types, so the same
  closure reaches the application for free — an invalid state is a compile
  error, not a runtime one.
- Adding a value to a frozen vocabulary requires a migration. That is the point:
  the frozen model says these sets are closed, so widening one should be a
  visible, reviewed act with an ADR behind it, not a dropdown edit.
- Removing or renaming an enum value is genuinely awkward in PostgreSQL. This is
  accepted for closed vocabularies and is precisely why the configurable ones
  are tables instead.
