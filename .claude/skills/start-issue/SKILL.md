---
name: start-issue
description: Implement exactly one named Linear issue in the top-level session through verified code, applicable visual acceptance, path-based review, one push to main, and handoff. Never delegates implementation, deploys, or touches hosted Supabase.
disable-model-invocation: true
argument-hint: LAN-###
---

# Start one issue

Invocation: `/start-issue $ARGUMENTS`

## Intent and authority

Implement one exact `LAN-###` directly; never select a second issue or delegate
implementation. Done means the work is verified locally at an exact head, pushed
to `main` under the rule in `AGENTS.md` "Merging" (or left on its branch for
Brian), and handed off truthfully. `/finish-issue` later proves the terminal
state and reclaims resources.

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
Never reuse another issue's state or delete dirty, unlanded, or review-ready
work. Prove the worktree root/base and that the primary checkout stayed clean.
All writes, services, generation, tests, commits, and pushes happen there.

Set the issue In Progress. Linear receives only that status, the Production
handoff comment, one final evidence comment, and the later closeout transition.

## Contract and review

Before implementation, write a concise acceptance matrix: success, failure,
boundaries, authorization/privacy, test level, criticality, omissions, residual
risk, and visual class (`UI-affecting|nonvisual|mixed`).

Review is decided from the branch's real diff, never from its size or from a
grade anyone assigns. Run `git diff --name-status origin/main...HEAD` and match
it against `reviewRequired` in `.github/merge-rules.json`:

| Diff                              | Review                                                            |
| --------------------------------- | ----------------------------------------------------------------- |
| Touches no `reviewRequired` path  | None. Record in the handoff that no path required one             |
| Touches any `reviewRequired` path | One fresh-context `code-reviewer` pass at the branch's final head |
| Touches an `ownerOnly` path       | Same review, then leave the branch for Brian to push              |

If unsure, review. Re-check the final diff after every correction; a diff that
newly reaches a listed path needs the review.

## Implement and verify

Implement the complete matrix directly. Before database mutation, acquire
`npm run db:acquire -- LAN-###` and use only fenced repository commands. Start
from a reset, deterministic synthetic state with fixed local review identities.
Heartbeat long work. Never break another lease, edit tracked Supabase config for
a slot, or target hosted Supabase.

Every check runs here, before the push, because main's CI runs only afterwards.
Run `npm run verify` and, when migrations change, the migration sequence in
`AGENTS.md`, plus the database suites. A pass means observed success.

For authenticated or visual work, own the entire local environment and run
`npm run visual:preflight -- <routes>` through real login and every required
state at desktop and measured 375px. Never print the protected local password.
Write the ignored evidence, start the supervised environment, confirm
`visual:status`, and require `db:review-ready` before involving Brian.

Commit one commit per issue with an imperative subject and a body that explains
why. Push the side branch under its own name for recovery. Never deploy or apply
a hosted migration.

### Visual checkpoint

After objective proof but before final review, give Brian one verified URL,
fixed login, exact routes/actions, concrete visual judgments, and limitations.
State:

- `Commands Brian must run: None`
- `Database/setup actions Brian must perform: None`
- `Production actions Brian must perform: None`

Move to In Review only while genuine visual acceptance is pending. Stop with the
branch marked visual-pending and unpushed to main. Apply requested changes and
repeat preflight and owner review when presentation materially changes.
Nonvisual work skips this.

## Independent review and corrections

After visual approval when applicable, run final verification at the current
commit. When the diff requires review, launch one fresh `code-reviewer` with the
issue, branch, exact head, mode, authority, invocation count, report path, and
lease status. Follow that agent's finding taxonomy, exact-head receipt, defect
challenge, correction lineage, and Sonnet hard cap.

Correct every `block` and `correct-before-handoff` finding. A blocker returns
for narrow correction review; a low-risk artifact correction gets deterministic
read-back. Reset to full review only for a materially new requirement, reachable
workflow, trust boundary, migration/RLS/transaction/production effect, or
invalidated test strategy. Diff size is not a reset.

At most one full plus two correction/adjudication invocations run automatically.
Two rounds on the same premise route to fresh requirement adjudication. Budget
exhaustion never approves a blocker or creates follow-up scope.

## Land and hand off

Pushing to `main` is the last act of the work and the landing (AGENTS.md,
"Merging"). Push only when every local check passed at the exact current head,
review is clear at that head when the diff touches a `reviewRequired` path, and,
for visual work, Brian's visual approval is recorded against that same head.
Never push a branch that touches an `ownerOnly` path. Otherwise leave the branch
and Brian pushes. Never force-push and never rebase a pushed branch.

To land: `git fetch origin main`; merge `origin/main` into the branch (a merge
commit, never a rebase); if main moved, rerun `npm run verify` and the
migration sequence when migrations changed; then `git push origin HEAD:main`
as a fast-forward. If it is rejected, fetch, merge, re-verify, retry. Then read
main's CI for the pushed SHA with `gh run list --branch main`. If main is red,
fix forward at once; nothing else lands until it is green. CI is the backstop,
not the first run.

Post the Production handoff block to Linear as one comment once the branch is on
`main`: every line of it, with explicit `No` and `None`, including whether a
hosted `db push` is needed (only after main is green at the carrying commit).
Do not hand off with unresolved blockers, unproved corrections, stale review,
failing verification, or an incomplete Production handoff. Lead with Brian's
next action, exact reviewed and pushed SHAs, findings by consequence and
disposition, verification evidence, migration/production actions, limitations,
and explicit `None` answers.

Once main is green at the pushed SHA, reclaim the worktree you landed from
(LAN-523): from the primary checkout, `npm run worktrees:sweep -- --apply --only
<worktree>`. It removes the worktree and its local branch only when the tree is
clean and its HEAD is on main, and releases a held slot first. Then run
`npm run worktrees:sweep -- --apply` once to reclaim any agent worktree whose
work is already on main. Never set Done or deploy; those are
`/finish-issue LAN-###` and Brian.
