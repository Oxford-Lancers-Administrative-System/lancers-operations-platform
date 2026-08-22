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

Gather, and write down, before changing a single thing. Every command here is
read-only; none of them writes to the registry or to a stack.

```bash
git fetch origin                                  # from the primary checkout
git worktree list --porcelain                     # find this issue's worktree and branch
gh pr list --head <branch> --state all --json number,state,mergeCommit,headRefOid,headRefName
git -C <worktree> status --short --branch         # and: git -C <worktree> stash list
git -C <worktree> rev-parse HEAD                  # the local branch tip
npm run db:coordinator status                     # the lease registry, tokens stripped
```

Find the pull request **from the branch**, with `gh pr list --head <branch>
--state all`. Not `gh pr list --search "<branch>"`, which does not match a
head-branch name, and not a bare `gh pr list`, which defaults to `--state open`
and so excludes every merged pull request — either would find nothing for a
merged issue and refuse the one case this workflow exists for. A pull-request
number taken from a Linear comment or a handoff message is a starting point,
never the binding.

- the Linear issue, its current state, and its comments;
- the issue's pull request, found by branch, and its `number`, `state`,
  `mergeCommit`, `headRefName` and `headRefOid`;
- the one worktree belonging to this issue, and its branch;
- that worktree's working tree, stash list, and tracking state;
- the lease registry. Use `npm run db:coordinator status`, not `npm run
db:status`: the coordinator prints every slot with tokens stripped — `state`,
  `repoPath` and `applicationPort` for all of them, `issueId` on an issue slot,
  and `missionId` and `attachedRepoPaths` on a mission slot — and reads nothing
  else. Absence is what identifies the kind: an issue record carries no
  `missionId`, a mission record carries no `issueId`. `db:status` answers a different question —
  it validates this worktree's own token, writes a heartbeat, and fails when
  there is no lease or the stack is already stopped, none of which is wanted
  while the run is still deciding whether it may act at all.

Read the repository, not the story told about it. A pull request body, a
`Ready for merge` handoff, a Linear state, or an earlier session's summary is
never evidence that the work merged.

Everything discovered is reported at the end, including the parts that found
nothing.

## 3. Prove the terminal state, or stop

Finalize only when exactly one of these is proved:

- **Merged.** All four of these, not any one of them: the pull request was found
  from this issue's branch; its `headRefName` is exactly that branch; its
  `headRefOid` equals the local branch tip; and its **`mergeCommit`** is an
  ancestor of a freshly fetched `origin/main`.

  ```bash
  git fetch origin
  gh pr list --head <branch> --state all --json number,state,mergeCommit,headRefOid,headRefName
  # require: state == MERGED, headRefName == <branch>,
  #          headRefOid == git -C <worktree> rev-parse HEAD
  git merge-base --is-ancestor "<mergeCommit>" origin/main
  ```

  Test the merge commit, never the branch head: this repository squash-merges,
  so a merged branch's own head is never an ancestor of `main` and testing it
  would refuse every genuinely merged issue.

  The three identity checks are not ceremony. Without them a pull-request number
  lifted from a comment proves somebody else's merge, and commits pushed to the
  branch _after_ the merge still satisfy `MERGED` plus an ancestor merge commit
  while `main` does not contain them — the branch would then be deleted with
  work on it that never landed. `headRefOid` equal to the local tip is what
  excludes that. An empty `mergeCommit`, which every unmerged pull request has,
  fails this step rather than being handed to `git`.

- **Canceled.** The Linear issue is in a canceled state.
- **Abandoned.** Brian passed `--abandoned`, and the branch is pushed with no
  unpushed commits, so nothing is lost by removing the worktree.

This step fails closed. Release nothing, delete nothing, stop nothing, and
change no Linear state when any of the following is true; instead report exactly
what is blocking and end:

- the pull request is open, draft, or closed unmerged, or there is no pull
  request at all for this branch;
- the pull request's `headRefName` is not this issue's branch, or its
  `headRefOid` is not the local branch tip — the branch has moved since the
  merge, or the pull request is not this branch's;
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
record's `applicationPort` and confirm its working directory before killing it:

```bash
lsof -ti tcp:<applicationPort>                    # the listening process, if any
lsof -a -p <pid> -d cwd -Fn                       # its working directory
```

Stop only a process whose working directory is this issue's worktree. A process
on that port whose working directory is a different worktree belongs to somebody
else: leave it and say so.

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
git branch -d <branch>          # merged issues only
```

Delete the local branch **only in the merged case**, where §3 has already proved
the work is on `main`. For a canceled or abandoned issue, remove the worktree and
keep the branch.

Use `-d` and never `-D`, but do not lean on `-d` as the safety check. Under a
squash merge `-d` decides from the upstream remote-tracking ref, not from
`main`: it will delete a branch that was merely pushed while `origin/<branch>`
still exists, and it will refuse a genuinely merged branch once the remote
branch is gone and the ref pruned. The proof in §3 is the guard; `-d` is only
the safer spelling. If `-d` refuses, leave the branch alone and report it — the
work is on `main` and on `origin`, so nothing is lost by keeping it.

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
