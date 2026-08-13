---
name: start-issue
description: Implement exactly one explicitly named Linear issue in the top-level Claude Code session, inside its dedicated worktree, through verification, graded review, draft PR, and final handoff. Never delegates implementation, merges, deploys, or touches hosted Supabase.
disable-model-invocation: true
argument-hint: LAN-###
---

# Start one issue

Invocation: `/start-issue $ARGUMENTS`

This is a user-invoked, single-issue workflow. The top-level session owns the
implementation. It may launch only the checked-in `code-reviewer`, and only
after implementation when the review grade requires it.

## 1. Validate the invocation

Before any write, require `$ARGUMENTS` to match exactly `^LAN-[0-9]+$` after
trimming whitespace. Refuse a missing argument, extra words, comma-separated
identifiers, or more than one identifier. Never select another issue or begin a
batch.

## 2. Establish authority and gates

Read the complete Linear issue, every comment, and all blocking, blocked,
related, and duplicate relationships. Read `AGENTS.md`, `CLAUDE.md`, every
repository source the issue cites, and the governing ADRs. For user-facing work,
read the UX contract and every applicable desktop and 375px wireframe. For a
migration, read `docs/architecture/data-model.md` and
`docs/migration-runbook.md` first.

Confirm dependencies are merged and human gates are recorded. The LAN-90 UX
gate and LAN-92 automated-WhatsApp decision gate remain binding. Manual posting
or distribution is never an MVP, pilot, fallback, or completion path.

Stop only for a genuine owner decision, irreconcilable authoritative conflict,
missing access or credential, or a technical blocker that cannot safely be
resolved. Routine engineering choices, test failures, local-environment faults,
and recoverable tooling problems belong to this session.

## 3. Enter exactly one issue worktree

The primary checkout must remain unchanged and clean. Use Claude Code's
`EnterWorktree` capability with an issue-specific name, or the documented
equivalent Git worktree operation, to create a worktree from current `main` and
an issue-specific `feat/`, `fix/`, `docs/`, or `chore/` branch. Enter it before
installing dependencies, generating files, testing, editing, committing, or
starting local services.

Before creating anything, inspect `git worktree list --porcelain`. If a clean or
recoverable existing worktree and branch already belong to this same issue,
inspect their status and safely resume them. Never create a duplicate and never
reuse another issue's worktree. Never delete a dirty, interrupted, unmerged, or
review-ready worktree. Cleanup is allowed only after the work is preserved and
the issue is merged, canceled, or explicitly abandoned.

After entering, prove `git rev-parse --show-toplevel` is the issue worktree,
prove its base is current `main`, and prove the primary checkout is still clean
and on its original branch. All subsequent commands run from the issue
worktree. Record that path when acquiring a database slot.

## 4. Start the issue and write the internal test contract

Set the one Linear issue to In Progress. Linear receives no wave record or
delegation brief. Its only workflow records are this start status, the eventual
PR link, and one final evidence/handoff comment.

Before implementation, build a concise internal acceptance/test matrix. For
each material behavior record success, failure, boundaries, authorization and
privacy, test level, and whether it is critical. Record deliberately untested
areas and residual risk. The top-level session writes the tests but does not
independently certify their adequacy.

Assign review before implementation from reachability and blast radius, never
diff size:

| Grade   | Route                                                                                                                 | Criterion                                                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low     | Top-level verification only; no independent reviewer.                                                                 | Non-behavioral or unreachable, with no schema, dependency, security, privacy, or production impact.                                                  |
| Normal  | One fresh-context `code-reviewer` after implementation.                                                               | Reachable application behavior outside the highest-risk surfaces.                                                                                    |
| Highest | One fresh-context `code-reviewer`; if corrections are required, a fresh re-review of the corrected head is mandatory. | Authentication, authorization, migrations, grants/RLS, secrets, privileged credentials, production-affecting workflows, or the agent harness itself. |

An unspecified grade resolves to Normal. Re-check the completed diff and raise
the grade when its actual reach is higher; never lower it after implementation.

## 5. Implement directly

Do not launch an implementation sub-agent, a second issue, a wave, an agent
team, or any other implementation role. Implement the complete matrix in this
top-level session and preserve all repository boundaries. Own dependency setup,
local data, migrations, seeding, the local test operator, application servers,
tests, screenshots, branch, commits, push, draft PR, and handoff.

## 6. Coordinate local Supabase

Before any database lifecycle or mutating command, acquire a lease:

```bash
npm run db:acquire -- LAN-###
```

The checked-in coordinator automatically assigns primary first and overflow
only when primary is genuinely occupied. It records the issue, worktree path,
process, random fencing token, heartbeat, state, project ID, complete port set,
and application port in a stable machine-local registry shared across clones.
Generated configuration, environment values, and tokens remain untracked.

Use only the guarded repository commands. They validate the current fencing
token before starting, stopping, resetting, migrating, seeding, creating the
test user, linking the operator, or generating types. A resumed process with a
reclaimed token must fail closed. Heartbeat during long work with
`npm run db:heartbeat`. Never break a live or uncertain lease. If both slots are
occupied, continue database-independent work and retry; escalate only when the
database becomes necessary and both remain legitimately unavailable.

Before trusting an assigned stack, start and reset it from this worktree, then
seed it and create/link its local operator. The overflow slot has a distinct
project ID, every exposed port, application port, generated config, generated
environment, database, Auth user, and operator. Never edit tracked
`supabase/config.toml` to allocate a slot.

Mark a stack `review-ready` when Brian must inspect it; this protects it from
reuse. Otherwise stop it and release the lease when finished. Never run a
coordinator command against hosted Supabase; every existing loopback and
non-hosted guard remains authoritative.

## 7. Classify the visual gate

Before implementation, classify the issue as `UI-affecting`, `nonvisual`, or
`mixed` from its acceptance criteria and the rendered behavior it changes.
UI-affecting means presentation or usability that genuinely needs human visual
judgment; backend, schema, integration, infrastructure, security, and other
objectively testable behavior is nonvisual. Mixed work uses the visual gate only
for its user-visible portion. Record the classification in the internal matrix.

## 8. Objective verification and visual preflight

Run the complete repository-required verification and inspect the actual
result. If migrations changed, also run the migration verification required by
`AGENTS.md`. A reported pass means the command was run and observed to pass.

For authenticated or UI-affecting work, own the complete local environment:
install dependencies; acquire and start the assigned Supabase slot; reset and
migrate it; seed deterministic review states; automatically create, confirm and
link the fixed machine-local review account; configure and start the application;
resolve ports and process conflicts; and troubleshoot ordinary failures. The
fixed review account is `brian.daniel.schuster@gmail.com`; its approved password
comes only from protected machine-local coordinator state shared by all
worktrees and both slots. Never print or copy it into Git, Linear, PR text,
screenshots, test output, logs, tracked examples, or hosted configuration.

Before contacting Brian, use a browser to open the supplied URL, sign in through
the real application login, visit every review route and state, confirm seeded
data, check desktop and 375px layouts, and fix ordinary setup, runtime, and visual
defects. Record evidence that URL response, authentication, required states, both
viewports, and the protected coordinator lease were personally verified. Do not
claim readiness from scripts or HTTP probes alone. After completing those checks,
write their non-secret result to the ignored
`.lancers-runtime/visual-review.json`; the existing `db:review-ready` command
validates that record and fails closed if any fact is absent or the URL does not
match the assigned loopback application port.

Commit and push the issue branch. Open or update a normal **draft** PR against
`main`; never use the fast lane, auto-merge, merge, un-draft, deploy, or migrate
hosted Supabase. Fill every Production handoff line in the PR template,
including explicit `No` and `None` answers.

### UI-affecting and mixed checkpoint

After objective verification and agent visual preflight, but before final
verification and independent correctness review, mark the slot `review-ready`.
Only after the working URL, real login, seeded states, desktop and 375px evidence,
and protected lease are all verified may the issue move to In Review and the
session report `Awaiting owner visual review`.

The visual handoff supplies one clickable URL, the fixed email and password, the
exact routes/workflow, a short numbered list of concrete visual judgments, known
visual limitations, and a request to approve presentation or identify
corrections. It must state exactly:

- `Commands Brian must run: None`
- `Database/setup actions Brian must perform: None`
- `Production actions Brian must perform: None`

Never ask Brian to repeat automated checks or inspect invisible behavior. If
any readiness fact is false, continue troubleshooting; report `Visual review
environment not ready` only for a genuine missing-access, external-service,
permission, or owner-decision blocker, without delegating setup commands.

Stop at this checkpoint. The draft PR remains draft and must be described as
visual-pending, not complete or PR-ready. Do not launch final independent review.

After Brian responds, apply requested corrections. Repeat browser preflight and
the human checkpoint when presentation or flow changed materially. Once Brian
approves, run final verification at the current commit and continue to final
independent review. Nonvisual work skips this checkpoint entirely.

Inspect GitHub Actions for the current PR head SHA. Read the actual job
conclusions and failed logs, not merely a green badge or another agent's report.
CI for an older SHA is not evidence.

## 9. Route final independent review

Independent correctness review is final: for UI-affecting or mixed work it runs
only after owner visual approval and any corrections, and it is pinned to the
current verified commit. Visual approval never substitutes for tests, security
validation, CI, or this review.

For Low risk, read the complete diff and verification evidence yourself and
record why independent review is not required.

For Normal or Highest risk, launch exactly one fresh-context `code-reviewer` in
its own isolated worktree after the draft PR exists. Give it the issue, PR
number, exact current head SHA, internal matrix, review grade, authoritative
sources, and its local Supabase lease status. Never give it an implementer's
summary as evidence. Green CI is required but is not review.

Correct findings in this top-level session. For Highest risk, any correction
invalidates the prior result: commit and push the correction, wait for CI at the
new head, and launch a fresh reviewer to review the corrected head. Do not ask
the original reviewer to bless its stale result. Continue until the required
review is clear or a genuine blocker remains.

## 10. Final handoff

Add the draft PR link to the Linear issue. Then add exactly one final Linear
evidence/handoff comment covering completed implementation, automated
verification, reviewed head SHA and independent-review result, visual/human
review required, exact local URL and route, authentication method, remaining
Brian actions, post-merge database/production actions, and known limitations.
Use explicit `None` where no action remains. Do not set In Review unless human
visual acceptance is genuinely pending and the complete review environment has
been personally verified in a browser.

Return the same concise evidence to Brian. Do not set In Review unless human or
visual acceptance is genuinely pending. Leave the draft PR, worktree, branch,
and any review-ready environment recoverable. No agent merges.
