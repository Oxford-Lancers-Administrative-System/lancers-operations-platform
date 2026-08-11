# 0017 — A batched fast lane, merged by a workflow that re-derives eligibility

**Status:** Accepted · **Date:** 2026-08-11 · **Extends
[0013](0013-supervised-agent-development.md) and
[0015](0015-graded-review-levels.md)**

Low-risk repository work — a runbook stating a boundary accurately, a flaky test
corrected, coverage added — may now be batched into one pull request and merged
**automatically**, with no human reading the diff, once every required GitHub
check has passed. Everything else keeps the workflow it already had: a draft pull
request that Brian merges.

This does not replace the graded review model. Level 0–3 decides how much
scrutiny a supervised issue receives. This decides which changes need a
supervised wave at all.

## Context

ADR 0013 built one path and 0015 graded it, but both assume the same shape: an
issue, an implementer, a draft pull request, and Brian. That is proportionate for
a migration and absurd for a two-line correction to a runbook, and the cost is
not only Brian's time. A process applied inattentively to everything is the
outcome the structure exists to avoid, and four small maintenance issues
(LAN-97…LAN-100) were already queued behind it.

The obvious implementation is also the dangerous one. Three independent reviewers
blocked LAN-93 for a single defect repeated in different clothes: a check whose
two sides derived from the same source, and which was therefore satisfied by
construction. A workflow that merges because an agent applied a `fast-lane` label
has exactly that shape. The agent's own classification becomes the only thing
between a misclassification and `main`, and the failure is silent by
construction, because nobody watches a lane whose whole purpose is that nobody
watches it.

## Decision

**1. A GitHub Action performs the merge. No agent ever holds merge capability.**

`.claude/settings.json` keeps denying `gh pr merge`, `gh pr ready`, `gh api` and
every variant, and `tests/agent-harness.test.ts` keeps proving it; neither file
changed. Agents open drafts and never un-draft them. The workflow marks an
eligible pull request ready immediately before merging it. Authority lives in a
reviewable checked-in file, and revoking it is deleting that file.

**2. The workflow re-derives eligibility from the diff, and from nothing else.**

It reads the rules and the classifier from the base branch and applies them to
`git diff main...head`. It never trusts the label, the title, the body, a commit
trailer, or any other artifact written by the agent that opened the pull request.
The label expresses intent and is how a pull request asks; it is never the
evidence. It is a conjunct beside the recomputed verdict, never an alternative to
it.

Three things enforce this rather than merely asserting it: `classify()` has no
parameter through which a claim could reach it; the workflow triggers only on
events that execute the default branch's copy of a workflow, so a pull request
cannot rewrite the thing deciding whether to merge it; and the pull request's
objects are fetched and diffed but never checked out and never executed.

**3. The eligible set is path-based, small, and fails closed.**

Documentation, cross-cutting tests, and the pilot READMEs. Added and modified
files only. A path no rule classifies is `unclassified`, which is ineligible:
absence of a rule is never permission. A new top-level directory, a rename, a
deletion, a binary file or an empty diff all go to the normal lane.

**4. The lane cannot widen itself.** The rules mark the rules, the classifier,
the workflows, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, the ADRs, and the tests
that prove all of this as protected governance. Those rules cannot modify
themselves through the lane — twice over, because the workflow judges with the
base branch's copy of them.

**5. A test change may add or strengthen coverage, never remove or weaken it.**
Net-negative test lines, a net loss of `expect(` assertions, an introduced
`.skip`/`.only`/`.todo`, or a deleted or renamed test file each refuse the batch.

**6. Verification is proportionate per class and fixed in the rules**, so no
agent chooses its own. `npm run build` is not required locally for the eligible
classes, because nothing Next.js compiles can be in an eligible batch and CI
builds it regardless. That is the only narrowing of the repository-wide
`npm run verify` requirement.

## Consequences

- Small maintenance work stops consuming a supervised wave, and stops queueing
  behind Brian.
- **`main` can move without a deploy.** A merge performed with `GITHUB_TOKEN`
  does not trigger downstream workflows, so `deploy.yml` does not run. Correct
  for this lane — application code is ineligible — but it must be known rather
  than discovered.
- Changes will merge that nobody read. The compensating controls are the small
  path-based eligible set, failing closed, the inability to widen itself, and a
  comment plus a workflow summary on every merge recording what qualified and
  why.
- The lane depends on repository settings an agent cannot see or set: the
  `GITHUB_TOKEN` default permission, branch protection, squash merging, the
  label, and the Linear integration. They are written out in
  [`docs/fast-lane.md`](../fast-lane.md) as an owner checklist. Until they are
  done the lane merges nothing, which is the right failure.
- `agent-instruction` is an eligible class with an empty path list, because every
  agent-instruction file in this repository carries at least one protected
  governance rule. Widening it is Brian's decision, taken with a human reading
  the diff.

## Alternatives considered

**Merge on a label.** Rejected: it is the LAN-93 defect. The agent's
classification would be the only control.

**Let an agent merge, guarded by a checklist.** Rejected: it requires weakening
`.claude/settings.json` and the harness assertions, and it moves authority from a
reviewable file into a prompt.

**Auto-merge tiny application-code fixes.** Rejected, and out of scope for
LAN-102. Reachability, not size, is the criterion (ADR 0015); a four-line change
to an authorization predicate is exactly the change that must not merge
unreviewed.

**Section-level rather than path-level rules**, so part of `AGENTS.md` could be
eligible. Rejected: the workflow computes paths, and a rule that must understand
which paragraph changed cannot fail closed reliably.
