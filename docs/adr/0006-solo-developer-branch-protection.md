# 0006 — `main` is protected, CI is required, zero human approvals

**Status:** Accepted (provisional) · **Date:** 2026-08-08 (decided) / 2026-08-10 (recorded here)

## Context

The club never named a production approver, and Brian is currently the only
durable administrator. Requiring a second reviewer would block all work; allowing
direct pushes to `main` would remove every guardrail.

## Decision

Provisional rule, recorded so it is not silently re-litigated:

- `main` is protected by a repository ruleset. Direct pushes, force-pushes, and
  branch deletion are blocked, including for administrators
  (`current_user_can_bypass: never`).
- All changes reach `main` through a pull request.
- **Required approving reviews: 0.** Brian may merge his own pull requests.
- CI must pass before merge. That check — not a human — is the gate.

## Revisit when

A second club administrator with GitHub organization access exists. At that
point raise required approvals to 1 and re-evaluate whether self-merge should
remain possible.
