# 0025 — Separate finding impact from gate disposition

**Status:** Accepted · **Date:** 2026-08-14 · **Supersedes only the
finding-classification portion of
[0024](0024-bounded-lineage-aware-review.md)**

## Context

ADR 0024 bounded independent review and preserved review evidence across narrow
corrections. Its binary finding model nevertheless left no enforceable category
between a blocker, whose correction consumes independent review, and an
advisory, which cannot authorize any correction. Worthwhile low-risk artifact
corrections were therefore pressured into the same gate category as reachable
behavior and security failures, and their reported consequence was obscured.

## Decision

Every finding records impact severity (`critical`, `high`, `medium`, or `low`)
separately from gate disposition. Severity communicates consequence and does
not decide review routing.

Gate disposition is exactly `block`, `correct-before-handoff`, or `advisory`.
A `block` must be corrected and independently correction-reviewed. A
`correct-before-handoff` finding must be corrected and deterministically
verified or read back before ready-for-merge final handoff, but does not by
itself consume another reviewer invocation. An `advisory` is record-only and
authorizes no correction, commit, review round, or follow-up issue.

Authentication, authorization, privacy, security, data integrity, incorrect
reachable behavior, migration/RLS/transaction risk, and unauthorized
production or external effects are always `block`. A nominal artifact
correction is promoted to `block` before implementation if it changes
executable behavior or crosses an authorization, privacy, security,
data-integrity, migration, transaction, trust, or production boundary.

Receipts and owner handoffs report each finding's stable ID, severity,
disposition, concrete reachable consequence, review-invocation effect, and
applicable SHA or mutable artifact. Only unresolved `block` findings make the
independent-review result blocked; unresolved `correct-before-handoff` findings
still prevent a ready-for-merge handoff.

## Controls preserved

All other ADR 0024 decisions remain unchanged: one initial full review, at most
two correction reviews and three total automatic reviewer invocations,
correction-only scope, evidence reuse, full-reset conditions, the
repeated-premise circuit breaker, requirement adjudication, exact SHA lineage,
and safe review-budget exhaustion. Review grades, zero-command visual
acceptance, draft-only delivery, human merge, local-only Supabase, CI, and all
production boundaries are unchanged.

## Consequences

- Low-risk issue-owned artifact defects can be required corrections without
  independently consuming scarce correction-review rounds.
- Security, integrity, and reachable-behavior failures retain hard blocking
  treatment regardless of their stated severity.
- Owner reporting distinguishes consequence from workflow state.
- Static harness tests prove only that this policy is encoded; they cannot
  guarantee model compliance.
