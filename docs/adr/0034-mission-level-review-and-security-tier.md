# 0034 — Mission-level review and the security tier

**Status:** Superseded by [0035](0035-owner-package-walkthrough-and-final-smoke.md) · **Date:** 2026-08-23 · **Supersedes:** the
per-package review clauses of [0027](0027-mission-harness.md) and
[0033](0033-harness-after-the-first-live-mission.md)

Approved by Brian through LAN-159. The package topology is unchanged: every
work package still has one issue, one isolated worktree, one branch and one
draft pull request. This decision moves review gates; it does not combine the
packages or widen autonomous-merge eligibility.

## Context

The first two live missions spent most of their time and agent budget repeating
the same context through package review, correction review, browser walking and
owner approval. Independent review found material defects only on irreversible
or trust-boundary surfaces, while the workflow walker and Brian found the
cross-package and presentation defects. Repeating every layer for reversible
application work did not buy proportionate safety.

The governing error budget is asymmetric. A failure in ordinary UI or
application code is forward-fixable, so the mission accepts a bounded risk of
it and relies on targeted tests, the integrated full verification and CI. A
failure in schema, authorization, tokens, secrets, PII handling or production
operations can be irreversible or disclose data, so its tolerated failure
budget remains near zero.

## Decision

Build all mission packages first. At the integrated head, run full verification
once, one workflow-walker pass over the mission's actual user jobs, and one
cross-surface comparison. Brian receives one three-part brief and one integrated
environment, records one mission visual approval, and sends all findings back
in one batched correction round. A rendered correction receives one scoped
re-walk and re-approval; a mechanically proven non-rendered delta may carry the
prior evidence forward under the existing classifier rule.

Run one fresh-context **security-tier review** at the integrated head, concurrent
with Brian's check-off. Its scope is exactly the mission diff's intersection
with this sensitive-path list:

- migrations and schema;
- RLS, grants and database authorization;
- authentication and session boundaries;
- token and unauthenticated routes;
- secrets and privileged credentials;
- PII egress;
- production scripts and production-affecting workflows.

The review records the integrated head, the exact package heads it covers, the
sensitive-path intersection and its report file. The one-full-plus-two-
correction invocation budget applies to this security-tier pass only.
Non-security code receives no independent code review in a mission.

Dependency scheduling and merge conjuncts accept either the older clear
per-package record or a clear mission-level security-tier record at the
integrated head that covers the package's exact head. Visual merge conjuncts
likewise accept either the older package approval or the mission approval.
Keeping the old records valid preserves rehearsal fixtures; Mission Leads use
the mission-level topology for new missions.

Walker and cross-surface work run once per mission, not once per package. The
workflow still re-derives prohibited paths and merge eligibility from the real
diff, CI still has to pass at each PR head, and Brian still merges every
prohibited or owner-only surface. Nothing here weakens RLS, privacy, PII,
secret, deployment or production guards.

## Consequences

- Reversible code loses a repeated independent-review layer but keeps worker
  tests, integrated verification, CI, the workflow walker and Brian's check-off.
- Irreversible and trust-boundary code retains fresh-context independent review
  plus every existing owner and machine gate.
- Corrections are handled as one mission batch; presentation evidence is
  repeated only when the classifier proves the rendered result changed.
- The mission can prove one integrated review covered several package PR heads
  without pretending those PRs share a branch or worktree.

## Alternatives considered

- **Keep package review and add mission review.** Rejected: this preserves the
  repeated cost that the live-run evidence identified.
- **Drop independent review entirely.** Rejected: the real material catches
  were concentrated in the sensitive tier, where the error budget is near zero.
- **Combine all work into one branch and pull request.** Rejected: branch,
  ownership, collision and merge-route isolation are separate controls and are
  unchanged by this decision.
