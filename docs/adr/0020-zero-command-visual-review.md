# 0020 — Zero-command visual acceptance precedes final review

**Status:** Accepted; correction-review rule superseded by
[0024](0024-bounded-lineage-aware-review.md) · **Date:** 2026-08-13 ·
**Supersedes [0018](0018-single-issue-agent-development.md)**

## Context

ADR 0018 correctly established single-issue implementation, fenced local
Supabase concurrency, graded independent review, and draft-only delivery. Its
handoff sequence nevertheless placed independent correctness review before a
possible human visual check and allowed a credential-retrieval command. That
made visual corrections invalidate supposedly final review and delegated part
of local-environment operation to Brian.

## Decision

All unchanged single-issue, worktree, coordinator, review-grade, draft-only,
local-only, and production controls from ADR 0018 remain in force.

Each issue is classified before implementation as UI-affecting, nonvisual, or
mixed. UI-affecting presentation and usability receive objective verification,
then an agent browser preflight of every review route/state at desktop and 375px,
then a human visual checkpoint. Mixed work uses that checkpoint only for the
visible portion. Nonvisual work proceeds without it.

At the checkpoint the application and assigned Supabase slot are live, seeded,
authenticated through the real login flow, and protected as `review-ready`. The
normal pull request remains draft and is not described as complete or PR-ready.
Brian receives one URL, the fixed local credentials, exact review routes, a
short visual checklist, limitations, and explicit `None` answers for commands,
database/setup actions, and production actions.

After approval or requested correction, materially changed presentation repeats
preflight and visual acceptance. Final verification and graded independent
correctness review then run at the current commit. Highest-risk corrections
originally required an unrestricted fresh review. ADR 0024 supersedes only that
correction-review rule with bounded, lineage-aware correction review; this ADR's
visual sequence and all other controls remain in force.

The fixed review account is confirmed and idempotently linked to exactly one
seeded operator. Its password exists only in mode-0600 machine-local coordinator
state keyed by repository identity and shared across worktrees and both slots.
Local start and reset restore synthetic data, the account, and its operator link.
Every provisioning path positively requires loopback Supabase endpoints and
retains the existing hosted/nonlocal refusals. Random scenario users do not
replace or mutate this account.

## Consequences

- Human visual judgment happens while corrections are still expected, so final
  correctness review covers the accepted current commit.
- Brian operates no development tooling and receives no credential-retrieval
  command.
- A missing or broken review environment is agent work unless external access,
  permission, or an owner decision is genuinely required.
- Protected local credential state must be initialized on each development
  machine without committing or logging the password.
