# 0035 — Owner package walkthroughs and one final smoke

**Status:** Accepted; pre-owner review scope amended by [0037](0037-package-gate-includes-mockup-conformance.md) · **Date:** 2026-08-24 · **Supersedes:** the owner/walker
ordering and separate cross-surface pass in
[0034](0034-mission-level-review-and-security-tier.md)

Approved by Brian during LAN-160. This replaces the hold-until-final-smoke
topology previously recorded in this ADR.

## Context

Brian already checks each issue's live experience while a mission runs. Making
an agent walk the same issue first duplicated that work, delayed feedback and
made every correction capable of buying another broad model run. The final
integrated system still needs one smoke test because hand-offs between packages
can fail even when every package works alone.

## Decision

For each issue, finish targeted tests, required security review, exact-head CI,
and environment preparation before presenting its zero-command environment to
Brian. An empty sensitive-path intersection launches no reviewer. Batch defects
found before approval into one correction round, rerun only invalidated machine
evidence, and present the stable affected surface.

Owner approval is the final mutable gate. At an unchanged approved head no
reviewer or worker runs; the deterministic merge gate runs and the issue merges
immediately to `main`. Independent issues may still run concurrently, while a
dependent issue starts only after its dependency has merged to `main`.

After every issue has merged, run full verification once and one bounded Sonnet
workflow smoke over predetermined end-to-end journeys and visible hand-offs at
current `main`. It is not another visual review and never reopens a merged issue
or its approval. A finding creates one corrective issue/PR cycle; after it
merges, repeat only the affected journey once. If that targeted re-walk fails,
stop for owner adjudication instead of starting another correction cycle.

## Consequences

- Brian sees a stable issue after model-driven checks, so a later model finding
  cannot start an approval/re-review loop.
- Each completed issue reaches `main` immediately instead of waiting for the
  rest of the mission.
- One integrated walker can catch broken cross-package hand-offs.
- One cross-surface agent invocation disappears.
- Merged issue approvals stay closed; final-smoke findings have new lineage.
- Final-smoke correction is capped at one cycle and one targeted re-walk.
