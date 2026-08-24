---
name: start-issue
description: Implement exactly one named Linear issue in the top-level session through verified code, applicable visual acceptance, graded review, one draft PR, and handoff. Never delegates implementation, merges, deploys, or touches hosted Supabase.
disable-model-invocation: true
argument-hint: LAN-###
---

# Start one issue

Invocation: `/start-issue $ARGUMENTS`

## Intent and authority

Implement one exact `LAN-###` directly; never select a second issue or delegate
implementation. Done means one verified draft PR and truthful handoff at an
exact reviewed head. `/finish-issue` later proves the terminal state and
reclaims resources.

Read the complete issue, comments, relations, cited sources, governing ADRs, and
`AGENTS.md`. User-facing work also reads its UX contract and all desktop/375px
wireframes; migrations require the data-model map and migration runbook. Confirm
dependencies and human gates. LAN-90 and LAN-92 remain binding; manual delivery
is never a fallback.

Stop only for missing authority/access, conflicting authoritative sources, or an
unsafe blocker. Resolve routine design, tooling, environment, and test failures.

## Enter one worktree

Inspect existing worktrees, then create or safely resume exactly one issue
worktree and matching `feat/|fix/|docs/|chore/` branch from current `main`.
Never reuse another issue's state or delete dirty, unmerged, or review-ready
work. Prove the worktree root/base and that the primary checkout stayed clean.
All writes, services, generation, tests, commits, and PR work happen there.

Set the issue In Progress. Linear receives only that status, the draft PR link,
one final evidence comment, and the later closeout transition.

## Contract and risk

Before implementation, write a concise acceptance matrix: success, failure,
boundaries, authorization/privacy, test level, criticality, omissions, residual
risk, and visual class (`UI-affecting|nonvisual|mixed`).

Assign review from reachability/blast radius, never diff size:

| Grade   | Required review                                                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low     | Top-level diff/evidence check; non-behavioral, unreachable, and no schema, dependency, security, privacy, or production impact                           |
| Normal  | One fresh-context `code-reviewer` for reachable application behavior                                                                                     |
| Highest | Fresh reviewer plus bounded correction lineage for auth, authorization, schema/migrations, RLS/grants, secrets, production workflows, or harness changes |

Default unspecified work to Normal. Re-check the final diff and raise, never
lower, the grade.

## Implement and verify

Implement the complete matrix directly. Before database mutation, acquire
`npm run db:acquire -- LAN-###` and use only fenced repository commands. Start
from a reset, deterministic synthetic state with fixed local review identities.
Heartbeat long work. Never break another lease, edit tracked Supabase config for
a slot, or target hosted Supabase.

Run all repository-required verification and the migration sequence in
`AGENTS.md` when applicable. A pass means observed success.

For authenticated or visual work, own the entire local environment and run
`npm run visual:preflight -- <routes>` through real login and every required
state at desktop and measured 375px. Never print the protected local password.
Write the ignored evidence, start the supervised environment, confirm
`visual:status`, and require `db:review-ready` before involving Brian.

Commit and push, then open/update one normal draft PR against `main`; fill every
Production handoff line. Never fast-lane, merge, un-draft, deploy, or apply a
hosted migration. Inspect actual CI conclusions at the current head.

### Visual checkpoint

After objective proof but before final review, give Brian one verified URL,
fixed login, exact routes/actions, concrete visual judgments, and limitations.
State:

- `Commands Brian must run: None`
- `Database/setup actions Brian must perform: None`
- `Production actions Brian must perform: None`

Move to In Review only while genuine visual acceptance is pending. Stop with the
draft PR marked visual-pending. Apply requested changes and repeat preflight and
owner review when presentation materially changes. Nonvisual work skips this.

## Independent review and corrections

After visual approval when applicable, run final verification at the current
commit. Low risk records why no independent reviewer is needed. Normal/Highest
launch one fresh `code-reviewer` with issue, PR, exact head, mode, grade,
authority, invocation count, report path, and lease status. Follow that agent's
finding taxonomy, exact-head receipt, defect challenge, correction lineage, and
Sonnet hard cap.

Correct every `block` and `correct-before-handoff` finding. A blocker returns
for narrow correction review; a low-risk artifact correction gets deterministic
read-back. Reset to full review only for a materially new requirement, reachable
workflow, trust boundary, migration/RLS/transaction/production effect, or
invalidated test strategy. Diff size is not a reset.

At most one full plus two correction/adjudication invocations run automatically.
Two rounds on the same premise route to fresh requirement adjudication. Budget
exhaustion never approves a blocker or creates follow-up scope.

## Handoff

Do not hand off with unresolved blockers, unproved required artifact corrections,
stale review, failing verification, or incomplete Production handoff. Lead with
Brian's next action, draft PR, exact full/correction/current SHAs, findings by
consequence and disposition, automated/visual/CI evidence, migration/production
actions, limitations, and explicit `None` answers.

Add the PR link and exactly one final evidence comment to Linear. Leave the draft
PR, branch, worktree, lease, and review environment recoverable. Never set Done,
release the lease as a finishing move, remove the worktree, or merge; those are
`/finish-issue LAN-###`.
