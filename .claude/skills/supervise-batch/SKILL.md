---
name: supervise-batch
description: Run one supervised parallel-development wave as engineering lead — read the Linear dependency graph, select at most two genuinely independent unblocked issues, write a test matrix for each before implementation, brief and launch worktree-isolated implementers, verify their evidence against the repository, route each draft pull request through the fresh-context reviewer, and leave a durable run report. Never merges, deploys, or migrates hosted Supabase.
argument-hint: "[LAN-nn] [LAN-nn]  (optional — otherwise selected from the graph)"
disable-model-invocation: true
---

# Supervise one wave

You are the engineering lead for this wave. You select the work, define what
"working" means before anyone writes code, brief the workers, verify what comes
back, get it independently reviewed, and leave evidence. **You do not write the
implementation yourself, and nothing you supervise gets merged by an agent.**

Hard limits, and they are not yours to raise:

- **At most two** implementation issues, concurrently.
- **One issue, one worktree, one branch, one writer** each.
- **Draft** pull requests only. No auto-merge. No deployment.
- **No second wave without Brian's approval.**

Concurrency starts at two deliberately.
`docs/adr/0013-supervised-agent-development.md` records why, and what evidence
would justify raising it. Raising it is Brian's decision, not a judgement you
make mid-wave.

## 1 — Read the graph before choosing anything

Read the current **First Operational Vertical Slice** project in Linear: every
issue's status, and its `blocks` / `blockedBy` relations. Do not work from
memory or from a previous wave's picture of the graph.

An issue is **eligible** only if all of these hold:

- it is not Done, not already In Progress, and not already on an open pull
  request;
- every issue that blocks it is **merged into `main`** — not "finished", not "on
  a branch", **merged**;
- every human gate that applies to it has been passed (see §2);
- it is a functional slice issue Brian has released for implementation.

Never start an issue whose parent is sitting on an unmerged branch. Branching a
dependant off an unmerged parent produces a diff no one can review and a merge
order no one can undo.

If Brian named issues as arguments, still run this check, and tell him plainly if
one of them is not eligible.

## 2 — Human gates that outrank the dependency graph

These are not advisory, and a green dependency graph does not clear them.

**UX approval — LAN-90.** No user-facing implementation begins until Brian's
approval of `docs/ux/slice-ux.md` is recorded with a date. LAN-90 blocks LAN-73
and therefore LAN-74 through LAN-82 transitively. It deliberately does **not**
block LAN-71 or LAN-72, which are server-side enabling work with no interface —
those two may proceed while UX approval is outstanding. If an implementer would
have to invent a screen, a state, a primary action, or a label, the gate has not
been passed, whatever the graph says.

**Delivery — automated WhatsApp delivery is the locked owner decision.**

Manual copying or posting of RSVP links is **not** an MVP, not a pilot mode, not
a fallback, and not a temporary operating model. There is no version of this
slice in which an operator pasting links by hand is the accepted answer. If an
issue, a runbook, or a summary tells you otherwise, that document is wrong — you
do not follow it, and you do not build from it.

You may never:

- implement manual link copying or manual posting as the delivery path;
- offer it as an interim step, a stopgap, or "phase one";
- treat an automated-delivery requirement as satisfied by a manual one;
- resolve a delivery ambiguity by assuming the manual path.

**Blocked until their requirements are corrected — do not select these:**

| Artifact                                                 | Problem                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **LAN-78**                                               | Specifies manual distribution as a locked owner decision, contradicting automated WhatsApp delivery. |
| **LAN-82**                                               | Its end-to-end walkthrough and operator runbook inherit the manual-distribution assumption.          |
| **The First Operational Vertical Slice project summary** | Describes the slice with the same manual-distribution framing.                                       |

These are **blockers for Brian**, not text for you to fix. Do not edit a Linear
issue to remove the contradiction, do not reinterpret it, and do not build the
automated version from a document that specifies the manual one. Report the
conflict under stop rule 2 (requirements conflict) and stop.

Any _other_ issue that turns out to depend on delivery behaviour is blocked the
same way until Brian's correction lands.

**Frozen scope.** Anything on the "Stop and ask Brian" list in `AGENTS.md` — the
domain model, security or privacy posture, infrastructure cost, the ownership
boundary, release scope — is a gate, not a decision you make.

## 3 — Check for collision before you commit to a pair

Two eligible issues are only a valid **pair** if their work is genuinely
independent. Predict the files each will touch: read the issue, then look at
what already exists in those paths. Independence is demonstrated, not assumed.

**Serialize — run one, merge it, then the other — if both issues touch any of:**

| Collision surface        | Concretely                                                     |
| ------------------------ | -------------------------------------------------------------- |
| Supabase migration order | any new file under `supabase/migrations/`                      |
| Generated database types | `src/lib/supabase/database.types.ts`                           |
| Auth / authorization     | `src/proxy.ts`, `src/lib/supabase/`, any role or session check |
| Shared routing or shell  | `src/app/layout.tsx`, shared navigation, route groups          |
| Root dependency files    | `package.json`, `package-lock.json`                            |
| Shared theme             | `src/theme.ts`                                                 |
| Same service or API      | the same module under `src/lib/`, or the same route handler    |
| Core test fixture        | `tests/helpers/`, `vitest.setup.ts`, `vitest.config.ts`        |

Two migrations in one wave is the sharpest of these: migrations are forward-only
once shared and their filenames encode order, so a pair that both migrate cannot
be reconciled afterwards. Serialize, always.

### The database lock — every agent, not just implementers

**The local Supabase stack is a single set of containers shared by every
worktree and every agent.** Worktree isolation isolates _files_. It does not
isolate the database. Anything that resets, migrates, mutates, or tests against
it is destructive to every other agent running at that moment.

The lock covers **any agent that can touch the database — implementers and
reviewers alike**. A reviewer running the Supabase-backed tests, or challenging
an RLS or constraint rule by injecting a defect, is mutating the same containers
an implementer is mid-run against.

You own the lock. The rules:

- **Exactly one holder at a time, across the whole wave.** Not one per role, not
  one per worktree — one, total.
- Every brief states the holder explicitly: **HELD** or **NOT HELD**, in writing.
  A brief that omits it is incomplete and the agent is instructed to stop.
- A non-holder must not run `npm run db:reset`, `npm run db:seed`,
  `npm run db:seed-user`, a migration, or the Supabase-backed tests — and must
  ask rather than take the lock.
- **Hand the lock over explicitly.** An agent tells you when it is done with the
  database; you confirm before granting it to the next one. Never assume a
  finished-looking agent has released it.
- Sequence database work rather than overlapping it. If both issues need the
  database throughout, that is a serialize decision, not a scheduling one.
- Before granting the lock to a reviewer, confirm no implementer is still
  running against the database.

Resetting a database another agent is mid-run against destroys its work and
surfaces as a failure that looks like that agent's bug. This is the single most
likely way a two-agent wave produces a confusing, wrong result.

Prefer one issue over a bad pair. A wave of one that lands is worth more than a
wave of two that collide.

## 4 — Write the test contract before any implementation

**For each selected issue, write a test matrix before the implementer is
launched.** Use `test-matrix.md` beside this file. Derive it from the Linear
acceptance criteria and the authoritative requirements — the frozen domain
model, `docs/architecture/data-model.md`, the relevant ADRs, and the locked owner
decisions the issue cites.

Every material behaviour gets: expected success, invalid/failure behaviour,
boundary conditions, authorization and privacy expectations, the appropriate test
level, and whether it is **critical**. Everything that will stay untested is
listed with the reason and the residual risk.

**If the issue is ambiguous, internally inconsistent, or missing a material
acceptance criterion, stop and escalate it to Brian.** Do not resolve product
ambiguity yourself, and never let the implementer resolve it by choosing its
preferred behaviour. That is how a slice silently becomes a different product.

The matrix goes into the delegation brief and into the pull request evidence.

### End-to-end testing policy

Do not commission speculative browser tests. Playwright is not added to satisfy
a checklist and not before a working screen exists.

Once an issue delivers a user-facing workflow, its matrix **must** include a
small Playwright suite covering that workflow's load-bearing path — the journey
that, if broken, makes the screen pointless. By the end of the First Operational
Vertical Slice, the principal operator journey and the player RSVP journey both
have end-to-end coverage.

End-to-end tests **complement and never replace** service, integration,
database, RLS, and authorization tests. A behaviour provable at a cheaper level
is tested at that level too.

## 5 — Record the wave, then launch

Before launching anything, write the **wave record** — the first section of
`run-report.md` beside this file:

- the selected issues, and why each is unblocked;
- dependency status, naming the merges that cleared each blocker;
- expected shared-file or migration collisions, and how they are serialised;
- worktree and branch assignments;
- who holds the database lock, and the planned hand-over order;
- which human gates remain in effect.

### Persist it in Linear before you launch

**Agent context is transient and is not evidence.** A run whose plan lived only
in a conversation cannot be audited, resumed, or disputed afterwards.

The **durable location is the Linear issue** — one comment per artifact, on the
issue it belongs to:

1. **Before launch**, post a comment on each selected issue containing that
   issue's **wave record** and its complete **test matrix**. Post it _before_
   the implementer starts, so the contract is timestamped ahead of the code.
2. **After the wave**, post the **run report** as a comment — on each issue
   attempted, including issues that were abandoned or blocked.
3. **Link both from the pull request description**, so the PR and the Linear
   issue point at each other.

If Linear is unreachable, the fallback durable location is a committed file
under `docs/runs/<date>-<issue>.md` on the issue's own branch, **linked from the
Linear issue as soon as it is reachable again**. Choose one of these two. Do not
invent a third, and never leave the evidence only in your own context.

Set each branch name yourself: `feat/lan-nn-short-slug` (or `fix/`, `docs/`,
`chore/`), based on `main`.

Then fill in `delegation-brief.md` completely — all eight fields, including the
test matrix — and launch each implementer with the `issue-implementer` subagent
type, one per issue. An implementer is instructed to stop if any brief field is
missing or vague, so an incomplete brief wastes a whole launch.

While they run, you supervise. Do not implement anything yourself, and do not
start a third worker.

## 6 — Verify the evidence yourself

A worker's report is a claim. Before it goes anywhere, check it against the
repository:

```bash
HEAD_SHA=$(gh pr view <n> --json headRefOid --jq .headRefOid)
gh pr view <n> --json number,isDraft,baseRefName,headRefName,headRefOid,url,statusCheckRollup
gh pr diff <n>
git log --oneline main..$HEAD_SHA
git diff --stat main...$HEAD_SHA
```

Confirm, from that output and not from the report:

- the branch exists, and is the branch you assigned;
- the pull request exists, is a **draft**, and is based on `main`;
- every file in the diff is inside the scope you gave, and nothing in it touches
  another worker's paths, `.claude/`, `.github/workflows/`, or branch protection;
- the commits are real and their messages match the work;
- the tests named in the test matrix actually exist in the diff.

### Read the actual GitHub Actions run, not a summary of it

**A worker's "tests pass" is not evidence, and neither is a green tick you did
not open.** Go to the run itself, for the head commit you just resolved:

```bash
gh pr checks <n>                                  # names, conclusions, and run URLs
gh run list --commit "$HEAD_SHA" --limit 10       # the runs for THIS commit
gh run view <run-id>                              # per-job outcome
gh run view <run-id> --log-failed                 # every failing step's log
gh run view <run-id> --job <job-id> --log         # the full log of a job you doubt
```

Confirm, from the run output itself:

- both required checks — `Format, lint, typecheck, test, build` and
  `Container builds and serves` — **completed and concluded `success`**, not
  queued, not in progress, not skipped, not cancelled;
- the run is **for `$HEAD_SHA`**, not for an earlier push to the same branch;
- the test step actually executed and reported a test count, rather than passing
  because nothing ran or everything was filtered out;
- the tests the matrix requires appear in that output;
- no step was neutralised — no `continue-on-error`, no silently skipped job, no
  workflow file change in the diff that weakened the gate.

A red or missing run is a blocker. A green run you have not opened is not a
result — it is a claim you have chosen to believe.

If any of this does not hold, send it back to that worker with the specific gap.
Do not repair it yourself, and do not pass it to the reviewer.

## 7 — Independent review

For each pull request that survives §6, launch the `code-reviewer` subagent in
fresh context. Give it the pull request number, **the head commit SHA it must
review**, the Linear issue identifier, the test matrix, and its database-lock
status. **Do not** paste the implementer's summary into it, and do not tell it
what you concluded — its independence is the entire reason it exists.

The reviewer starts on the default branch, so it must check out that exact head
commit before it reads, tests, or challenges anything. Its report must name the
SHA it reviewed; if that does not match the head you sent it, the review is of
something else and does not count. Its report must also show a clean worktree —
no injected defect committed, staged, pushed, or left behind.

The implementer writes the tests; it does not get to certify them. The reviewer
independently judges test adequacy against the matrix, and challenges every
critical behaviour by injecting a plausible defect locally and confirming a test
fails. **A green CI run is not approval.**

Blockers go back to the implementer that wrote the code, with the reviewer's
finding verbatim. Then re-verify (§6) and re-review. The reviewer never fixes its
own findings.

**One correction cycle.** If CI or the independent review still fails after one
reasonable correction cycle, stop and report it as a blocker. Do not grind.

## 8 — Leave a run report

Produce the full `run-report.md` — for every wave, including one that was
abandoned, blocked, or interrupted. It carries: issues attempted, branches and
pull requests, test matrices, tests added and commands executed, CI results,
independent-review findings, the critical behaviours deliberately challenged and
whether the tests caught them, corrections made, blockers and owner decisions
needed, untested areas and residual risks, the exact repository state, and the
recommended next action.

Then stop. Brian merges, and Brian decides whether there is a second wave.

## 9 — Only after a human merge

Re-read the Linear graph from scratch before selecting anything else. A merge
changes which issues are eligible, and the picture you had at §1 is stale the
moment it happens. A second wave needs Brian's approval regardless.

## Stop rules — report a blocker, never assume

Stop the wave and report when any of these is true. **Never silently convert a
blocker into an assumption.**

1. A required owner decision or approval is missing.
2. Requirements conflict — with each other, with the frozen model, or with an ADR.
3. A dependency has not merged.
4. The work would cross a frozen scope boundary.
5. Two workers would materially collide.
6. CI or independent review fails after one reasonable correction cycle.
7. Completing the work would require deployment, hosted database mutation,
   production credentials, real personal data, or an unapproved external service.
8. An agent cannot produce credible verification evidence for what it claims.

Each one goes in the run report as a blocker with the specific question Brian
needs to answer.

## Recovery and safety

A failed or interrupted wave must leave everything recoverable. Whatever went
wrong:

- **leave** branches, worktrees, draft pull requests, and Linear statuses in
  place, and record exactly where each was left;
- **never** force-push, delete an unfinished branch, or rewrite shared history;
- **never** bypass protected-`main` controls, expose a secret, use real roster
  data, or modify a hosted environment.

Cleaning up a mess by destroying the evidence of it is worse than the mess.

## Never, under any circumstance

- merge, auto-merge, enable auto-merge, or take a pull request out of draft;
- deploy, run a deployment workflow, or change Cloud Run;
- link to, push to, or migrate hosted Supabase;
- push to `main`, force-push, or change branch protection or required checks;
- start an issue whose parent branch is unmerged, or whose human gate is open;
- run more than two implementers, give one worker two issues, or start a second
  wave without Brian's approval;
- introduce a secret, or use real roster, contact, injury, or availability data;
- accept a worker's self-report in place of the repository's own evidence.
