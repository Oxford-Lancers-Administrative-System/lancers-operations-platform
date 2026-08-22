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

| Grade   | Route                                                                                                                                       | Criterion                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low     | Top-level verification only; no independent reviewer.                                                                                       | Non-behavioral or unreachable, with no schema, dependency, security, privacy, or production impact.                                                  |
| Normal  | One fresh-context `code-reviewer` after implementation.                                                                                     | Reachable application behavior outside the highest-risk surfaces.                                                                                    |
| Highest | One fresh-context `code-reviewer`; narrow corrections use bounded correction review and material risk-surface changes reset to full review. | Authentication, authorization, migrations, grants/RLS, secrets, privileged credentials, production-affecting workflows, or the agent harness itself. |

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
If that state is absent on a clean machine, initialize it through the guarded
bootstrap's private `LANCERS_LOCAL_REVIEW_PASSWORD` process environment from the
owner-approved credential already supplied in the agent's private task context.
Never put that value in a shell command, durable record, or owner instruction;
after initialization, remove it from the process environment and use the shared
mode-0600 state. A missing private value is agent setup to restore, not a command
for Brian.

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

For Normal or Highest risk, launch one fresh-context `code-reviewer` in its own
isolated worktree after the draft PR exists. Review has three operations:

- **Full review** independently reconstructs material requirements before
  reading the PR body, implementer summary, or acceptance matrix, then reviews
  the complete implementation and returns a structured receipt.
- **Correction review** reviews only
  `previous_reviewed_sha..current_head_sha`, the named blockers, affected
  behavior, and targeted regression evidence. It reuses the prior receipt and
  controlled-defect evidence for unchanged behavior.
- **Requirement adjudication** is a fresh-context `code-reviewer` invocation in
  `requirement-adjudication` mode. It resolves a premise that blocked two
  consecutive rounds from authoritative sources without receiving the PR body,
  implementer framing, prior reviewer reasoning, or code diff. It is not another
  code-defect search, but it consumes one of the three automatic reviewer
  invocations. If sources do not resolve the premise, it returns one precise
  owner decision.

The initial brief gives the reviewer the issue, draft PR number, exact current
head SHA, review mode `full`, review grade, authoritative sources, and local
Supabase lease status. The acceptance matrix and other implementer-authored
framing are withheld until the reviewer has recorded requirement provenance.
Green CI is required but is not review.

### Finding impact and gate disposition

Every finding has two independent attributes. `impact_severity` is exactly
`critical`, `high`, `medium`, or `low` and communicates consequence; severity
alone never decides whether another reviewer runs. `gate_disposition` is
exactly one of:

- `block`: correction is mandatory and independently triggers correction
  review under the existing lineage rules. Use it for an authoritative
  acceptance failure; incorrect reachable behavior; authentication,
  authorization, privacy, or security failure; data loss, corruption,
  integrity, migration, RLS, or transaction risk; unauthorized production or
  external effect; material required-verification failure; or a critical
  regression test that stays green under a plausible relevant defect.
- `correct-before-handoff`: correction is mandatory before the PR may be
  reported ready for merge or enter final handoff, but does not by itself
  consume an independent reviewer invocation. The implementer records
  proportionate deterministic verification or exact artifact read-back. It
  cannot authorize scope expansion or a follow-up issue.
- `advisory`: record only. It never authorizes a correction, commit, review
  round, or follow-up issue.

Authentication, authorization, privacy, security, data integrity, incorrect
reachable behavior, migration, RLS, transaction risk, and unauthorized
production or external effects are hard exclusions: they may never be
`correct-before-handoff` or `advisory`. Before implementing a
`correct-before-handoff` correction, reclassify it as `block` if it changes
executable behavior or crosses an authorization, privacy, security,
data-integrity, migration, transaction, trust, or production boundary.

Style, naming, formatting, speculative future-proofing, compliant alternative
designs, pre-existing problems not worsened by the PR, unsupported out-of-scope
edges, maintainability preferences without material failure, and minor findings
first discovered in unchanged code during correction review are normally
advisories. A materially false issue-owned artifact may instead be
`correct-before-handoff` when exact read-back can prove its correction.

Only unresolved `block` findings make the independent-review result `blocked`.
Unresolved `correct-before-handoff` findings still prevent ready-for-merge final
handoff. Correct them before final handoff, but do not consume another
independent review round unless the correction changes executable behavior or
crosses a material-risk boundary.

During correction review, a new blocker is permitted only when the correction
introduced it or it is a previously missed critical correctness, security,
privacy, or data-integrity defect. A blocker against unchanged code must state
the controlling authoritative source or invariant, concrete failure evidence,
material blocking impact, and why the full review missed it. Every other new
finding against unchanged code is advisory.

### Corrections, reset conditions, and circuit breaker

Correct `block` findings and any `correct-before-handoff` findings in this
top-level session, commit and push, and wait for CI at the new head. Record
deterministic verification or exact read-back for every
`correct-before-handoff` correction. For a narrow `block` correction, launch a
correction review with
the prior receipt, previous reviewed SHA, current head SHA, blocking finding
IDs, correction intent, and relevant targeted tests. Prior coverage remains
valid for unchanged behavior; the reviewer challenges only corrected or newly
affected critical behavior and does not repeat controlled-defect exercises for
unchanged behavior.

Reset to a full review only when the correction materially expands or
invalidates the reviewed risk surface by changing an authoritative requirement
or material acceptance criterion; introducing a new workflow or externally
reachable behavior; changing an authorization, privacy, credential, or trust
boundary outside the original finding; adding or materially changing a
migration, RLS policy, transaction boundary, or production side effect; or
replacing the test strategy so prior defect-sensitivity evidence is no longer
credible. Diff size and editing a Highest-risk file are not reset conditions.
Record the specific reset reason.

If two consecutive rounds block on substantially the same requirement,
mechanism, or finding family, stop correction work and do not launch another
code-review round. If an automatic invocation remains, launch a new
fresh-context `code-reviewer` in `requirement-adjudication` mode. Its brief names
only the issue, disputed requirement/mechanism/finding family by stable IDs,
authoritative sources, current round count, and remaining budget; it excludes
the PR body, implementation, diff, acceptance matrix, correction intent, prior
reviewer reasoning, and proposed resolution. The adjudicator reconstructs the
premise independently and returns an adjudication receipt with the disputed
IDs, provenance, resolution or one precise owner decision, and remaining review
budget. If no invocation remains, stop at `budget-exhausted` with the exact
premise and owner decision instead of launching adjudication.

### Review budget, receipt, and stopping behavior

Without explicit owner authorization, allow at most one initial full review,
two correction reviews, and three total reviewer invocations, including any
full reset. At the limit, launch no reviewer and never auto-approve an unresolved
material blocker. Return the exact blocker and required decision. If no `block`
findings remain, the independent review is clear; advisories remain recorded,
and any `correct-before-handoff` findings still require correction and recorded
verification before final handoff. Do not create another Linear issue or expand
scope.

Every review returns a structured receipt stored in a dedicated PR-body section
or another non-commit PR artifact; never commit a receipt containing its own
commit SHA. It contains at least `issue`, `pr`, `review_mode`,
`full_review_sha`, `correction_base_sha`, `reviewed_head_sha`, `round`,
`requirement_provenance` entries with criterion/source/location/controlling
quotation, `resolved_finding_ids`, `findings`, `blocking_findings`,
`correct_before_handoff_findings`, `advisories`, and
`result` (`clear`, `blocked`, `requirement-adjudication-required`, or
`budget-exhausted`). Every `findings` entry includes stable ID,
`impact_severity`, `gate_disposition`, concrete reachable consequence, whether
it caused another reviewer invocation, and the exact SHA or mutable artifact it
applies to. A `correct-before-handoff` entry also records its deterministic
verification or exact read-back once resolved.

## 10. Final handoff

Lead the final handoff with the requested owner action and preserve review
lineage. Do not enter final handoff while any `correct-before-handoff` finding
is unresolved or lacks recorded verification. Summarize findings by consequence
rather than relaying every review result with equal alarm. For each finding give
its stable ID, impact severity, gate disposition, concrete reachable
consequence, review-invocation effect, and applicable SHA or mutable artifact.
For a clear head say: `Ready for merge. Full review completed at A;
correction delta A..B was approved; current head B is covered.` For a pending
delta say: `Reviewed through A. Current head B contains a pending delta
affecting X. Prior review remains valid; only this delta is pending.` For a
budget stop say: `Automatic review stopped after three rounds. One material
blocker remains: X. No additional reviewer was launched.` Never describe the
whole implementation as unreviewed merely because current head differs from the
full-review SHA.

Add the draft PR link to the Linear issue. Then add exactly one final Linear
evidence/handoff comment covering completed implementation, automated
verification, full-review SHA, correction base and delta, current reviewed head,
round count, blockers, correct-before-handoff findings and their verification,
advisories and independent-review result, visual/human review required, exact
local URL and route, authentication method, remaining Brian actions, post-merge
database/production actions, and known limitations.
Use explicit `None` where no action remains. Do not set In Review unless human
visual acceptance is genuinely pending and the complete review environment has
been personally verified in a browser.

Return the same concise evidence to Brian. Do not set In Review unless human or
visual acceptance is genuinely pending. Leave the draft PR, worktree, branch,
and any review-ready environment recoverable. No agent merges.

Closeout is a separate, later invocation and never part of this one. After
Brian merges, `/finish-issue LAN-###` proves the terminal state, stops the
services, releases the lease, removes the worktree and local branch, and closes
the ticket. This session never releases its own lease as a finishing move,
never removes its own worktree, and never sets the issue Done.
