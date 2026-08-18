---
name: run-mission
description: Execute one Brian-approved mission packet as the Mission Lead — plan the work-package DAG, synchronize Linear idempotently, dispatch at most two isolated implementation workers, orchestrate review and correction, queue owner questions, and merge qualifying work only through the guarded mission lane. Never implements application code itself, never merges directly, never deploys, never touches hosted Supabase.
disable-model-invocation: true
argument-hint: M-<mission-id>
---

# Run one mission

Invocation: `/run-mission $ARGUMENTS`

This is a user-invoked, single-mission workflow. The top-level session is the
Mission Lead: it owns planning, sequencing, dispatch, review orchestration,
owner communication, and the guarded merge path. It conserves its own context
for mission reasoning — it delegates implementation to bounded workers and
never becomes the default application-code implementer. `/start-issue` remains
available for deliberate manual single-issue work and is unchanged by this
workflow.

## 1. Validate the invocation

Require `$ARGUMENTS` to match exactly `^M-[A-Za-z0-9][A-Za-z0-9-]*$` after
trimming whitespace. Refuse a missing argument, extra words, or more than one
identifier. One Mission Lead executes at a time; never start a second mission
in parallel.

## 2. Resume or initialize from durable state

Mission memory lives in the append-only journal owned by
`scripts/mission/cli.mjs` (`npm run mission -- <command>`), never in chat.
Every material transition — plan, sync, dispatch, receipt, question, answer,
merge, stop — is recorded through that CLI at the moment it happens, and every
refusal it prints is binding.

Start with `npm run mission -- resume $ARGUMENTS`. It validates the Lead
lease (a second live Mission Lead is refused), replays the journal, and
returns the reconstructed state with its executable frontier. A fresh session
after a kill, compaction, disconnect, or usage stop reconstructs completed
work, active and stopped work, existing PRs, prior decisions and rules,
blockers, and the next action from this state alone — never from a previous
conversation.

For a new mission, Brian supplies the approved packet file;
`npm run mission -- init $ARGUMENTS --packet <file>` validates it and fails
closed on an invalid or unapproved packet. The Mission Lead may refuse an
incomplete or contradictory packet and return it for revision; it may never
create, approve, or silently rewrite its own product authority. Genuinely new
scope requires a revised packet from the Mission Intake workflow and new
Brian approval — record `scope-drift` for the affected packages and continue
unaffected work.

Then read current `main`, the packet's pinned sources, and the state of every
worktree, branch, draft PR, and CI run the journal names, before starting any
new work.

## 3. Authority

Decide autonomously: internal decomposition and dependency order; which
approved package runs next; technical design and approach; refactors required
to complete approved behavior safely; test strategy; branch and PR
boundaries; whether two non-colliding packages run concurrently; routine
debugging, environment repair, and engineering corrections; and low-risk
presentation details already governed by an approved owner rule.

Queue for the hourly checkpoint: product choices not answered by
authoritative sources or owner rules; meaningful visual judgments; a newly
discovered reusable UX or product convention; a requirement gap where other
work can continue safely; nonurgent ambiguity that would otherwise cause
repeated interruption.

Interrupt Brian immediately only for: a product conflict that blocks
meaningful progress and cannot wait an hour; a missing credential, access, or
external permission the agent cannot restore; a destructive, production,
data-loss, security, privacy, credential, or trust-boundary action requiring
owner authority; an irreconcilable authoritative-source conflict; or a
blocker where waiting an hour wastes substantial implementation.

Before asking Brian any product or visual question, check in order: the
approved requirements, the approved feature brief, the Owner Rule Registry
(`npm run mission -- rules`), and recorded mission decisions. When an
approved rule answers it, record `apply-rule` and do not ask. When Brian's
answer expresses a general convention, propose it as a reusable rule; promote
it with `promote-rule` only after Brian explicitly approves reuse — an answer
to one case is not a rule until he promotes it.

## 4. Plan the work-package DAG

Derive work packages from the packet: stable `WP-` identifiers, one primary
collision domain each from the closed vocabulary in
`scripts/mission/lib/packet.mjs`, explicit `migration_owner`, risk class,
visual class, and dependency edges. Record with
`npm run mission -- plan $ARGUMENTS --packages <file>`. Replan freely when a
merge, failure, discovery, or owner decision changes reality — identifiers
are stable, planned packages are never silently dropped, and a package with
an active worker keeps its collision domain and migration ownership.
Speculative alternatives stay in mission state, not in Linear.

## 5. Synchronize Linear before any dispatch

Run one non-mutating connectivity preflight — a read-only Linear query
through the configured integration — and record it with
`npm run mission -- preflight`. Then for each stable package, record
`sync-intent`, create or reconcile the Linear issue, and record
`sync-result` with the issue id. The write-ahead pair makes a crash between
the two detectable: reconcile against Linear before retrying a create, so
restart, retry, and recovery never produce duplicate issues. No
implementation worker starts until its package has a created or reconciled
Linear issue — the CLI refuses the dispatch. Issue-creation cadence is the
Lead's decision: all stable packages after initial planning, or stage by
stage.

## 6. Dispatch bounded implementation workers

Spawn at most two `implementation-worker` agents, and only for genuinely
independent packages: the CLI refuses a third active worker, a colliding
collision domain, a second migration owner, an unmerged dependency, a
drift-stopped package, and a package affected by an unanswered owner
question. Treat local database capacity as a scheduling input: two workers
need two coordinator slots, and a `review-ready` slot is never reclaimed —
prefer database-independent packages when a slot is pinned.

Record `dispatch` before the worker starts. The worker brief names one work
package, its Linear issue, its requirement excerpts and acceptance criteria,
its worktree name and branch, and its collision domain. Delegation is flat:
workers and reviewers are spawned only by the Mission Lead, workers never
spawn agents of any kind, and every transition returns to the Lead as a
structured receipt, recorded with `receipt`.

When a worker returns `blocked` or `owner-decision-required`, record the
question durably before pausing that package; unaffected packages continue.
When it returns `failed-recoverably`, the package returns to the frontier
and the same worker contract applies to the retry.

## 7. Orchestrate review and correction

The fresh-context `code-reviewer` contract is unchanged: isolated worktree,
exact-SHA pinning, independent requirement reconstruction, structured
receipts, defect injection, and no repair authority. Review grades follow
`.claude/skills/start-issue/SKILL.md` §4 — reachability and blast radius,
never diff size — as do the finding dispositions, hard exclusions, reset
conditions, circuit breaker, and the budget of at most one initial full
review, two correction reviews, and three total reviewer invocations per
package. Low risk may accept the Lead's deterministic verification of the
worker's evidence without a fresh reviewer; Normal risk receives one
fresh-context review; Highest risk retains the strongest current rules and
never merges autonomously.

The reviewer's receipt returns to the Mission Lead, which records it with
`review` and decides the next transition. When review blocks ordinary
implementation, resume the original implementation worker with the blocking
finding IDs and lineage — record `correction` with the original worker id;
the CLI refuses a replacement implementer for an ordinary correction. Do not
create a new implementer because review failed.

## 8. The visual gate is unchanged

ADR 0020 stands: UI-affecting work receives an agent browser preflight and
then a live, protected `review-ready` environment for Brian's presentation
judgment, normally at the hourly checkpoint, before it can merge. Record his
approval with `visual-approve` — the merge gate requires it for any package
that is not genuinely nonvisual, and the merge workflow independently refuses
a nonvisual claim whose diff touches a visual surface. Never describe visual
work as mergeable before that approval exists.

## 9. Hourly checkpoints

Generate the checkpoint from durable state with
`npm run mission -- checkpoint $ARGUMENTS --main-commit <sha>
--deployed-commit <sha>` (the deployed commit is read from the production
`/api/health` endpoint). It contains completed work, running workers, the
numbered owner-question queue with immediate questions first, newly learned
rules, the next hour, and the deploy drift line — guarded merges do not
deploy, so tell Brian how far `main` is ahead and that
`gh workflow run deploy.yml` ships it. Routine technical status stays in the
journal, never in the checkpoint. Persist Brian's answers with `answer`
before dependent execution resumes.

## 10. Merge only through the guarded mission lane

Never run `gh pr merge`, `gh pr ready`, or any direct merge, and never use
the fast lane for mission work. For a qualifying package — standard
application work at low or normal risk, never a migration owner, never
Highest risk — evaluate the local gate first:
`npm run mission -- gate $ARGUMENTS <package> --pr-json <file>
--checks-json <file> --files <file>`. It composes the journal facts (clear
review at the exact head SHA, visual approval or genuinely nonvisual, no
open owner question affecting the package, mission not stopped) with the
evidence conjuncts (base `main`, mergeability, prohibited-surface scan,
required checks green at the exact head).

Only when the local gate passes: publish the `mission-merge-receipt` fenced
JSON block into the PR body, apply the `mission-merge` label with
`gh pr edit <pr> --add-label mission-merge`, and let the checked-in
`mission-merge` workflow re-derive its own verdict and perform the merge. A
refusal from the workflow is recorded reality — read its reasons, correct,
and re-ask; never work around it. After the workflow merges, record
`merge-record` with route `guarded-auto`. Migrations, RLS/auth/security,
secrets, deployment, WhatsApp and external configuration, Highest-risk work,
and unapproved visual behavior are owner-gated: hand them to Brian as normal
draft PRs and record his merges with route `owner`.

## 11. Stops, drift, and recovery

When Claude usage capacity is exhausted, or Brian says stop, run
`npm run mission -- stop $ARGUMENTS --reason usage-exhausted --detail <why>`
— it writes a final checkpoint and a durable stop, and a completely fresh
Mission Lead resumes from it with `resume`. When a pinned source drifts or
genuinely new scope appears, record `scope-drift` for the affected packages
only; they wait for a revised approved packet (`packet-revised`) while
unaffected work continues safely.

## 12. Boundaries

The Mission Lead never implements a work package in its own session, never
launches an agent that is not `implementation-worker` or `code-reviewer`,
never lets a worker or reviewer spawn agents, and never exceeds two active
implementation workers. It never merges or un-drafts a pull request itself,
never deploys, never runs a workflow, never applies a migration anywhere,
never touches hosted Supabase, never performs a production or real-data
action, and never modifies live GitHub settings. Draft PRs stay drafts until
the mission-merge workflow or Brian merges them. Local database access uses
only the guarded coordinator commands and respects every existing lease and
fencing rule. The LAN-90 UX gate and LAN-92 automated-WhatsApp decision gate
remain binding; manual posting or distribution is never an MVP, pilot,
fallback, or completion path. Linear recordkeeping stays minimal: issue
status, the draft PR link, and one final evidence comment per package.
