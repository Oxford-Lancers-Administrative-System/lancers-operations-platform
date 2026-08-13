# 0018 — Single-issue agent development with fenced local concurrency

**Status:** Superseded by [0020](0020-zero-command-visual-review.md) · **Date:** 2026-08-12 · **Supersedes
[0013](0013-supervised-agent-development.md) and
[0015](0015-graded-review-levels.md)**

## Context

The two-worker batch model isolated file changes but imposed orchestration,
durable wave records, delegation briefs, and a global database lock on work that
Brian normally starts one issue at a time. It also made the implementation
context indirect: the top-level session selected and supervised work while a
subagent performed it.

Claude Code now supports project skills, fresh-context custom subagents, and
top-level worktree entry. The repository needs direct single-issue ownership,
while retaining independent review where reachability and blast radius warrant
it. Parallel database use is uncommon but must be unsafe to ignore when two
issue sessions overlap.

## Decision

Brian invokes `/start-issue LAN-###`. The skill requires exactly one identifier,
reads its full Linear record and authoritative sources, confirms dependencies
and owner gates, and makes the top-level Claude Code session enter or safely
resume one dedicated worktree and branch from current `main`. The primary
checkout remains unchanged. The top-level session writes an internal test
matrix, implements, verifies, pushes, opens a normal draft PR, handles review
findings, and records the final handoff. There is no implementation subagent,
batch selection, wave, or fast-lane route.

The only custom subagent is `code-reviewer`, always independently isolated and
read-only except for reversible defect injection in its disposable worktree.
Review has three grades assigned before implementation by reachability and blast
radius:

- **Low:** top-level verification for non-behavioral or unreachable work with no
  schema, dependency, security, privacy, or production impact.
- **Normal:** one fresh-context independent review for reachable application
  work.
- **Highest:** the same full independent review for authentication,
  authorization, migrations, grants/RLS, secrets, privileged credentials,
  production-affecting workflows, and agent-harness changes. Any correction
  requires a fresh reviewer at the corrected head.

An unspecified grade is Normal. A completed diff may raise but never lower its
assigned grade. CI must be inspected at the reviewed head and never substitutes
for review.

### Two-slot local Supabase coordinator

A stable machine-local registry, keyed by repository identity and shared by
clones and worktrees, allocates primary and overflow. The overflow stack is
generated only when primary is genuinely occupied. Each record contains issue,
worktree, owning process, random fencing token, heartbeat, state, local project
ID, every exposed port, and application port.

Allocation and updates use a short atomic directory lock; no lock is held for
the issue lifetime. Active ownership is reclaimable only when its process is
dead and heartbeat expired. Permission uncertainty counts as alive.
`review-ready` is never automatically reclaimed. Reallocation rotates the
fencing token, and all repository lifecycle and mutating database commands
validate the current token so a resumed stale process fails closed.

Runtime `config.toml`, environment values, token, and session state are generated
inside an ignored worktree directory. The tracked Supabase configuration is not
edited. Primary and overflow have distinct project IDs, database, Auth state,
application ports, and complete service-port sets. Existing loopback and hosted
Supabase refusals remain unchanged.

## Controls preserved

No agent merges, un-drafts, deploys, runs a hosted migration, touches hosted
Supabase, or writes production. Protected `main`, human merge, restricted
credentials, independent review, current-head CI, and worktree isolation remain
the structural controls. `.claude/settings.json` continues to disable bypass and
deny common unsafe command forms; those patterns supplement rather than replace
the structural controls.

Linear recordkeeping is limited to In Progress at start, the draft PR link, and
one final evidence/handoff comment. Local authenticated/visual work is owned by
the session, which leaves a review-ready environment only when Brian must
inspect it and states explicit `None` answers for absent owner, database, and
production actions.

## Consequences

- `/supervise-batch`, its templates, and `issue-implementer` are removed rather
  than retained as competing workflows.
- File isolation is always present even though implementation is direct.
- Two database-using sessions can coexist without manually selecting ports or
  editing tracked configuration; a third waits while doing independent work.
- Highest-risk corrections cost a fresh review, deliberately preventing a stale
  approval from covering code the reviewer never saw.
- The coordinator adds local lifecycle commands and generated untracked state,
  but no hosted project, account, credential, billing, or cloud configuration.
