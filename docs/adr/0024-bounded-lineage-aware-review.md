# 0024 — Bounded, lineage-aware independent review

**Status:** Accepted · **Date:** 2026-08-14 · **Supersedes only the
correction-review rule in [0020](0020-zero-command-visual-review.md)**

## Context

The single-issue workflow required every Highest-risk correction to invalidate
the previous result and start a complete fresh review. A narrow correction could
therefore erase useful prior coverage, expose unchanged code to an unrestricted
new search, and repeat indefinitely. Green CI is not approval, but an arbitrary
number of reviews is not stronger approval either.

## Decision

Independent review has three operations: full review, correction review, and
requirement adjudication. The initial full reviewer reconstructs material
requirements and records their provenance before reading implementer-authored
framing. It reviews the complete implementation, assigns stable finding IDs,
challenges critical behavior, and returns a structured receipt.

A narrow correction preserves the receipt's coverage for unchanged behavior.
Correction review examines the previous reviewed SHA through the current head,
named blockers, affected behavior, and targeted regression evidence. It reuses
prior defect-sensitivity evidence and challenges only corrected or newly
affected critical behavior. A new finding in unchanged code can block only when
it is a previously missed critical correctness, security, privacy, or
data-integrity defect supported by an authoritative invariant, concrete failure
evidence, material impact, and an explanation for the full-review miss. Other
late findings are advisory.

Findings block only for authoritative requirement violations, incorrect
reachable behavior, security or privacy failures, data/migration/transaction
integrity risk, unauthorized external effects, required verification failure,
or a critical regression test insensitive to a plausible relevant defect.
Preferences, speculative improvements, compliant alternative designs,
pre-existing unworsened problems, unsupported scope, and minor late findings
are advisories. Advisories cause no correction or review round.

A correction resets to full review only when it materially changes the reviewed
risk surface: an authoritative requirement or acceptance criterion; a new
workflow or externally reachable behavior; an authorization, privacy,
credential, or trust boundary outside the original finding; a migration, RLS
policy, transaction boundary, or production side effect; or the credibility of
the prior test strategy. Diff size and editing a Highest-risk file do not reset
review by themselves.

Automatic review permits one initial full review, at most two correction
reviews, and no more than three reviewer invocations total, including a full
reset. Two consecutive rounds blocked by substantially the same requirement,
mechanism, or finding family stop correction work and trigger independent
requirement adjudication instead of another defect search. Clear authoritative
sources resolve the premise; otherwise the workflow returns one precise owner
decision.

At the review limit no further reviewer runs and no unresolved material blocker
is auto-approved. If only advisories remain, review is clear with those residual
risks recorded. Receipts live in the PR body or another non-commit artifact and
identify the full-review SHA, correction base, reviewed head, round, requirement
provenance, resolved and blocking finding IDs, advisories, and result. Handoffs
preserve earlier coverage and identify only the pending delta when head has
moved.

## Controls preserved

ADR 0020's zero-command visual checkpoint remains before final correctness
review. Worktree isolation, graded routing, current-head CI inspection,
draft-only delivery, human merge, local-only Supabase, protected review
environments, and all production, deployment, secret, and hosted-Supabase
boundaries remain unchanged. Review-budget exhaustion is a safe stop, never
approval.

## Consequences

- Small corrections no longer discard valid independent-review evidence.
- Review effort follows changed risk while critical late defects may still
  block with stronger evidence.
- Repeated premise disputes and exhausted budgets become explicit stopping
  states instead of unbounded correction loops.
- Static harness tests and dry-run transcripts can prove that the repository
  encodes this workflow, but cannot mechanically guarantee model compliance.
