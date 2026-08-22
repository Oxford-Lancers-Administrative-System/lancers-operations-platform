---
name: finish-issue
description: Finalize exactly one Linear issue whose work has already reached a terminal state — release its local Supabase lease, stop its services, remove its worktree and branch, and close the ticket. Runs only after Brian has merged; never merges, un-drafts, deploys, or touches hosted Supabase.
disable-model-invocation: true
argument-hint: LAN-###
---

# Finish one issue

Invocation: `/finish-issue $ARGUMENTS`

This is a user-invoked, single-issue workflow and the closeout companion to
`/start-issue`. That workflow deliberately stops with the draft pull request,
worktree, branch, and any review-ready environment left recoverable, and it
never closes the ticket. This one reclaims what the run took out, and only once
the work has genuinely finished.

It implements nothing, reviews nothing, and starts nothing. It launches no
subagent of any kind.

## 1. Validate the invocation

Before any read of state and before any write, require `$ARGUMENTS` to match
exactly `^LAN-[0-9]+$` after trimming whitespace. Refuse a missing argument,
extra words, comma-separated identifiers, or more than one identifier. Never
select another issue or begin a batch. `--abandoned` is the one permitted extra
word, and only in the form `/finish-issue LAN-### --abandoned`; it is Brian's
explicit statement and is never inferred.

## 2. Establish the facts before touching anything

Gather, and write down, before changing a single thing:

- the Linear issue, its current state, and its comments;
- the issue's pull request and its merge state, read with `gh pr view` and
  `gh pr list --search`, plus the merge commit if there is one;
- `git worktree list --porcelain`, to find the one worktree belonging to this
  issue, and its branch;
- `git status --short --branch`, `git stash list`, and the branch's tracking
  state inside that worktree;
- `npm run db:status`, to find whether a lease names this issue, which slot it
  holds, its state, and its application port.

Read the repository, not the story told about it. A pull request body, a
`Ready for merge` handoff, a Linear state, or an earlier session's summary is
never evidence that the work merged.

Everything discovered is reported at the end, including the parts that found
nothing.

## 3. Prove the terminal state, or stop

Finalize only when exactly one of these is proved:

- **Merged.** `gh pr view` reports the pull request `MERGED`, and
  `git merge-base --is-ancestor <branch> origin/main` succeeds against a freshly
  fetched `origin/main`. Both, not either.
- **Canceled.** The Linear issue is in a canceled state.
- **Abandoned.** Brian passed `--abandoned`, and the branch is pushed with no
  unpushed commits, so nothing is lost by removing the worktree.

This step fails closed. Release nothing, delete nothing, stop nothing, and
change no Linear state when any of the following is true; instead report exactly
what is blocking and end:

- the pull request is open, draft, or closed unmerged, or there is no pull
  request at all;
- the worktree has uncommitted changes, untracked files that are not ignored,
  unpushed commits, or stash entries;
- a `correct-before-handoff` finding is recorded as unresolved;
- human or visual acceptance is genuinely still pending;
- the lease exists but its record names a different issue, worktree, or holder
  than the one being finalized, or its fencing token no longer matches — another
  session owns that slot now;
- anything material is ambiguous or cannot be read.

Absence of evidence is never permission. A blocked run is a successful run that
reports the blocker; it is not a failure to work around.

## 4. Close out, in this order

The order matters and is not interchangeable.

### 4.1 Stop the services first

Stop the application process before releasing anything. Find it from the lease
record's `applicationPort`, confirm the listening process's working directory is
this issue's worktree, and stop only that process. A process on that port whose
working directory is a different worktree belongs to somebody else: leave it and
say so.

Then stop the stack from inside the issue worktree:

```bash
npm run db:stop
```

`db:stop` validates the fencing token through `updateLease`, which refuses any
lease that is not `active` or `review-ready`. Releasing first therefore makes
the stack impossible to stop through the guarded command. Stop, then release.

Never stop a stack another live lease depends on, and never stop a
mission-owned stack: a record with `attachedRepoPaths` beyond this worktree, or
a `missionId`, belongs to `/run-mission` and is out of scope here.

### 4.2 Release the lease

From inside the issue worktree:

```bash
npm run db:release
```

This must run before the worktree is removed. The fencing token lives in the
worktree's ignored `.lancers-runtime/lease.json`; removing the worktree destroys
it, and `db:cleanup-stale` never reclaims a `review-ready` record — so a lease
released too late is a slot that stays locked until someone edits machine-local
state by hand.

`db:release` releases a `review-ready` lease as readily as an `active` one,
which is the point: the protection existed for Brian's visual review, and that
review is over.

If no lease names this issue, say so plainly and continue. If the command
reports a missing, invalid, or stale ownership token, stop at that step and
report it: the slot has been reclaimed by another session and is not yours to
release.

### 4.3 Remove the worktree and the local branch

From the primary checkout, never from inside the worktree being removed:

```bash
git worktree remove <path>
git worktree prune
git branch -d <branch>
```

Use `git branch -d`, which refuses an unmerged branch, and never `-D`. For an
abandoned issue, keep the branch and remove only the worktree.

Never remove a dirty, interrupted, unmerged, or review-ready worktree. Never
touch another issue's worktree, a locked agent worktree, or a mission worker's
worktree. The primary checkout must be clean and on its original branch when
this finishes, and proving that is part of the step, not an assumption.

### 4.4 Close the ticket

Set the Linear issue to Done if it is not already, and add exactly one closing
comment recording the merge commit, the released slot, the removed worktree and
branch, the stopped services, and any remaining Brian action — stated as `None`
where there is none. That comment and the state change are the only Linear
writes this workflow makes.

Never move an issue to Done while human or visual acceptance is genuinely
pending; report it and leave the state alone. For a canceled issue, leave it
canceled and add the same closing comment.

## 5. Idempotence

Every step is safe to repeat. A second `/finish-issue` on the same issue finds
no lease, no worktree, no branch, and an issue already Done, and reports
`already finalized` without acting or failing. Re-running after a partial run
completes only the steps that are still outstanding.

## 6. Boundaries

Unchanged, and this workflow narrows rather than widens them. It never merges a
pull request, never un-drafts one, never deploys, never migrates hosted
Supabase, never writes to production, and never runs a pilot script against
hosted Supabase. It runs strictly after Brian has merged and takes none of those
actions on his behalf.

It also never implements, never opens or edits a pull request, never launches a
reviewer or any other subagent, never picks up the next issue, and never uses
the fast lane.

Mission closeout — `/run-mission`'s worker worktrees and mission-owned local
stacks — is out of scope and is owned by the mission harness.

Stop and ask Brian only for a genuine owner decision, an irreconcilable
conflict in what the repository and Linear report, or missing access. Ordinary
local-tooling problems belong to this session.

## 7. Report

Report in one short block: the issue and its proved terminal state with the
evidence for it; the slot released or the fact that none was held; the worktree
and branch removed or deliberately kept; the services stopped; the Linear state
and closing comment; and anything deliberately left alone, with the reason.
Use explicit `None` where nothing remains.
