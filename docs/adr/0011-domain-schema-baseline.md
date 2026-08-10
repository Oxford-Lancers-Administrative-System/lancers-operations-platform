# 0011 — The zero-domain-schema boundary is closed

**Status:** Accepted · **Date:** 2026-08-10 · **Supersedes:** [0007](0007-zero-domain-code-boundary.md)

## Context

ADR 0007 held this repository to zero club domain schema until the ticket that
legitimately introduced the domain model. It said, correctly, that deleting
`tests/no-domain-code.test.ts` would be the explicit act of crossing the
boundary.

That ticket is this one. The conceptual domain model was frozen at v1.2 on
2026-08-10 with its open decisions register closed, and the repository scaffold
ticket is complete.

## Decision

The boundary is closed. `tests/no-domain-code.test.ts` is deleted, and the
domain schema is implemented in `supabase/migrations/20260810120000` through
`20260810121200`.

ADR 0007 is superseded, not reversed: its reasoning was sound and its
enforcement worked exactly as intended for the period it covered.

## What replaces it

The old boundary prevented invented schema. Three things now prevent the same
failure in the form it can still take — schema drifting away from the approved
model:

1. **`docs/architecture/data-model.md`** maps every conceptual entity and every
   invariant to its physical treatment. A table with no entry in that map is a
   defect.
2. **`tests/schema-invariants.test.ts`** ties each invariant to the specific
   constraint that carries it, so an invariant cannot quietly stop being
   enforced.
3. **The stop-and-ask rule in `AGENTS.md` still applies to the domain model
   itself.** Adding a table that represents a _new club concept_ — a kit ledger,
   a statistics module, a second team — remains out of scope and needs a
   decision from Brian, not a migration.

## Consequences

- Domain migrations are now ordinary, reviewed work.
- The next boundary is release scope, not schema existence. The frozen model's
  "deliberately absent" list (§1.2) is the thing to check a new table against.
