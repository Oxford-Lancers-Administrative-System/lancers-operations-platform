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
identifier. Missions may run concurrently; Brian decides how many to start.
The two-worker limit is per mission, never a repository-wide worker pool or a
limit on active missions.

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

At the start of the Lead session, generate one random UUID and keep it in
`LANCERS_MISSION_LEAD_ID` for every mission CLI call. The journal fences every
mutation to that stable per-mission identity; a transient CLI PID is only
liveness evidence. Never reuse the identity for another Lead session.

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
new work. Also reconcile the mission's existing Linear `owner-action` issues
as described in §5a before deciding what is executable.

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

## 4. Plan the work-package DAG, and have it approved before it is durable

Derive work packages from the packet: stable `WP-` identifiers, one primary
collision domain each from the closed vocabulary in
`scripts/mission/lib/packet.mjs`, explicit `migration_owner`, risk class,
visual class, and dependency edges.

**One coherent issue defaults to one implementation package.** A plan of more
than one records, per package, the boundary that makes it separate —
`file-conflict`, `independent-visual-gate`, `safety-boundary` or
`sequencing-verification` — the concrete evidence for it (the actual
overlapping files, the actual independently gated surface), and what the split
costs Brian in merges, reviews and visual approvals. Risk grade, directory,
tidiness and estimated agent time are refused by name: they describe the work,
not a boundary. The plan as a whole records what it considered combining, the
concurrency the split genuinely buys, the critical path, and the owner merges
and visual approvals it will ask for.

Record with `npm run mission -- plan $ARGUMENTS --packages <file>`, then present
that decomposition to Brian and record his approval with
`npm run mission -- approve-plan $ARGUMENTS --by <who> --evidence <where>`.
**Nothing durable — no Linear issue, no branch, no work package — is created
before that approval**, and a revised plan withdraws the approval it no longer
describes. While a package is still a proposal it may be combined away or
removed, recorded with its reason in `removals`; it stays in mission state as
`removed` so its lineage remains readable. Once it has a Linear issue or a
worker its identity is protected, and a package with an active worker keeps its
collision domain and migration ownership. Speculative alternatives stay in
mission state, not in Linear.

Route a late blocking finding to the current open package for its issue, or to
the next existing open one, rather than creating another package for it.

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

### 5a. Consume asynchronous owner actions from Mission Intake

Mission Intake, not the Mission Lead, detects qualifying asynchronous human
actions and creates their Linear issues. At every start or resume, and again at
each normal checkpoint, query Linear for existing issues that both carry the
`owner-action` label and reference this mission identifier. Reconcile them by
Linear issue identifier; never create a replacement issue or a second
owner-action ledger. Existing missions with no matching issues proceed exactly
as before.

For each matching issue, read its required outcome and its link to a mission
requirement, acceptance criterion, external gate, or verification package.
Connect it to the smallest dependent unit named by that evidence. When the
relationship is incomplete or ambiguous, keep the issue visible and ask a
normal owner question for the missing relationship; do not guess that the
whole mission is blocked. Linear remains the durable source for the human
action. Under the instruction-only v1 boundary, reconstruct these relationships
from Linear on reconciliation rather than adding journal events, packet fields,
or another store.

Interpret Linear status narrowly:

- `Backlog` means an external prerequisite must clear before Brian can act.
- `Todo` means Brian can act now.
- `In Progress` means Brian is performing the human action.
- `Done` means only that Brian completed the human action.

An unresolved action blocks only the package, gate, or acceptance verification
that depends on its outcome. Continue every unrelated executable package. An
owner-action issue reaching `Done` never satisfies its linked requirement,
criterion, or gate: at the next reconciliation, make the linked agent
verification visibly ready or pending, assign the next agent action through the
normal mission workflow, and require recorded verification evidence. Only
successful agent verification may satisfy the linked acceptance criterion.

Owner actions are distinct from the existing owner-question queue. A question,
decision, approval, clarification, information request, visual judgment, or
hourly check-in item that Brian can resolve in the mission conversation stays a
normal owner question and is never reported as an owner action.

## 6. Dispatch bounded implementation workers

Spawn at most two `implementation-worker` agents for this mission, and only for genuinely
independent packages: the CLI refuses a third active worker, a colliding
collision domain, a second migration owner, an unusable dependency, a
drift-stopped package, and a package affected by an unanswered owner
question.

A dependency is usable when it is merged, **or** when it has been independently
reviewed clean at exactly the head its pull request carries and — if it is
visual — approved at that same head. Building on that basis is allowed and
records it, pinned to the exact commit; it is refused the moment the
dependency's head moves past the reviewed one. Waiting for a merge the evidence
does not require is a choice, and records its concrete safety or integration
reason with `npm run mission -- defer-dispatch`. Brian's merge timing is not a
scheduling dependency. Workers share the mission-owned stack by default. Serialize only
commands that mutate that shared stack; use a temporary worker stack only when
two workers demonstrate incompatible database states.

Record `dispatch` before the worker starts. The worker brief names one work
package, its Linear issue, its requirement excerpts and acceptance criteria,
its worktree name and branch, and its collision domain. **A user-facing brief
also names `docs/ux/slice-ux.md`, `docs/ux/standards.md`, the applicable
`docs/ux/tickets/` contract, and the desktop and 375px wireframes.** Where the
packet is the only contract, delivery writes the implemented one to
`docs/ux/tickets/<LINEAR-ID>-<slug>.md` so the next mission reads a contract
rather than re-deriving one from a superseded packet. Delegation is flat:
workers and reviewers are spawned only by the Mission Lead, workers never
spawn agents of any kind, and every transition returns to the Lead as a
structured receipt, recorded with `receipt`.

When a worker returns `blocked` or `owner-decision-required`, record the
question durably before pausing that package; unaffected packages continue.
When it returns `failed-recoverably`, the package returns to the frontier
and the same worker contract applies to the retry.
If a worker crashes or cannot return, record `abandon-worker` with the evidence.
That clears only its active record so a replacement may be dispatched; it does
not discard the branch, worktree, issue, or journal history.

### 6a. Mission-owned local database

After fetching current `main`, record its full commit and current migration
head, then allocate the mission stack with `npm run db:acquire-mission --
$ARGUMENTS --base-commit <sha> --migration-head <number>`. Start with a clean
rebuild and deterministic synthetic seed. Attach each worker worktree with
`db:attach-mission`; ordinary `/start-issue` retains the optional standing
non-mission stack. The allocator lock exists only while choosing unique project
identity and ports and never limits mission count.

On resume, compare the recorded commit and migration head with the mission
branch and inspect stack health. Preserve a healthy current volume; rebuild on
migration change, drift, or failed health. Before final integration, fetch
current `main`, reconcile it with every mission change, clean-rebuild from zero,
seed, and run the applicable full verification. Compatible earlier merges do
not require owner confirmation; an actual failure becomes bounded correction
work. After acceptance, stop and release the mission stack. Never copy
production data or deploy a hosted migration.

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
fresh-context review; Highest risk receives the strongest review rules.

**A review grade decides review rigour, not the merge route.** Route is decided
by the protected surface the diff actually touches plus the evidence, which the
`mission-merge` workflow re-derives from the real diff. Highest-risk work may
use the guarded lane only when an answered owner checkpoint names the package,
so Brian hears about it before it merges; migrations, grants and RLS,
authentication and session boundaries, production scripts, secrets, hosted
data, deployment and every prohibited path stay owner-merged
(`docs/adr/0032-harness-after-the-first-live-mission.md` §4). Routing a
lane-qualified package to Brian anyway is recorded as a harness defect and
states why.

**Two reviews belong to the mission rather than to any package.** Before a UI
mission's visual gate, run a workflow walker against the integrated head that
completes the mission's actual user jobs end to end — the jobs, not the screens
— and record it with `npm run mission -- integrated-review ... --mode
workflow-walker`. A visual approval is refused without a clear walker at
exactly the head Brian will be shown. After every package has integrated, run
one cross-surface pass comparing the repeated facts, states, dates, permissions
and copy across the surfaces they add up to; a mission cannot close as
delivered without it.

**Every substantive fix comes back bound to a test.** A correction's receipt
carries, for each finding it was dispatched to fix, the named regression test,
the command, the failing assertion observed after the defect was reintroduced,
the restored pass, and the exact SHA. This is four recorded facts about one
fix, not a mutation-testing framework.

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

Append a concise **Owner actions** section built from the Linear reconciliation,
separate from the numbered owner-question queue, grouped as:

- **Ready for Brian** — `Todo` or `In Progress`.
- **Waiting on prerequisites** — `Backlog`.
- **Brian acted; verification pending** — `Done` while linked agent
  verification is incomplete.

For every item give the Linear issue and status, required outcome, linked
requirement/criterion/gate, remaining human action (if any), remaining agent
verification, and next actor. Omit an empty group. Never put routine owner
questions or scheduled check-in items in this section.

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

## 11. Completion and acceptance

Before any completion receipt, reconcile owner actions once more and report one
of exactly these outcomes:

- **Fully accepted** — required implementation and every required acceptance
  verification are complete with recorded evidence.
- **Implementation complete; acceptance pending** — implementation is complete,
  but one or more owner actions, external prerequisites, or linked agent
  verifications remain open.
- **Incomplete** — required implementation work remains unfinished.

Code merged, packages completed, an owner-action issue marked `Done`, or active
implementation stopped is not by itself full acceptance. For an acceptance-
pending outcome, include a structured **Acceptance pending** section in the
existing receipt, with each affected criterion, linked owner-action issue and
status, remaining verification, and next actor. This is receipt structure, not
a new packet or journal schema.

## 12. Stops, drift, and recovery

When Claude usage capacity is exhausted, or Brian says stop, run
`npm run mission -- stop $ARGUMENTS --reason usage-exhausted --detail <why>`
— it writes a final checkpoint and a durable stop, and a completely fresh
Mission Lead resumes from it with `resume`. When a pinned source drifts or
genuinely new scope appears, record `scope-drift` for the affected packages
only; they wait for a revised approved packet (`packet-revised`) while
unaffected work continues safely.

## 13. Boundaries

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
