# 0038 — One universal merge rule: draft is the readiness gate

**Status:** Accepted · **Date:** 2026-09-01 · **Supersedes:**
[0017](0017-batched-fast-lane.md) · **Amends:**
[0027](0027-mission-harness.md), [0033](0033-harness-after-the-first-live-mission.md)

Approved by Brian through LAN-209.

## Context

On 2026-09-01, LAN-202 merged itself before Brian could look at it. The cause
was structural, not a slip.

`mission-merge.yml` triggered on `workflow_run: [CI] completed` and resolved
whichever open pull request contained the head SHA. Nothing scoped it to
mission work, so it evaluated every pull request in the repository — including
`/start-issue` pull requests, which `start-issue/SKILL.md` says to leave as
drafts for Brian. LAN-207 had removed the label conjunct, leaving a standard
route that merged on three facts: no prohibited path, a Linear issue named
somewhere, CI green. None of those is a review. And the gate fired the instant
CI finished, which is before any receipt recording a review could exist — so
the receipt route was unreachable on first CI completion for any package.

Underneath all of it, **draft state was decorative.** The gate read `isDraft`
and ignored it, and both merge workflows called `gh pr ready` immediately before
merging. GitHub natively refuses to merge a draft, and its auto-merge waits for
the draft to lift. We had built machinery that defeats the platform's own
safety.

Two lanes, two label vocabularies, two near-identical workflows, a receipt
format, an eligibility classifier and a middle tier of "owner approval surfaces"
all existed to reconstruct a signal GitHub already gives for free.

## Decision

**A pull request leaves draft exactly once, as the last act of the work, and
that act is the authorization to merge it.** An agent may lift the draft only
when all three are true: the diff touches no prohibited path; review is clear at
the pull request's exact current head; and, for visual work, Brian's visual
approval is recorded against that same head. Otherwise the draft stays and Brian
merges. **No agent merges, ever.**

There are no lanes. There is one rule, applied to every pull request in the
repository, whatever opened it.

### What enforces it

- GitHub refuses to merge a draft, and its auto-merge waits for the draft to
  lift. That is the mechanism; nothing here reimplements it.
- `.github/workflows/merge.yml` is the only merge workflow. It never merges and
  never un-drafts. It skips drafts; re-derives the diff from the base branch;
  enables nothing and comments once when the diff touches a `prohibited` path in
  `.github/merge-rules.json`; and otherwise runs
  `gh pr merge --auto --squash`.
- Auto-merge is enabled at `ready_for_review` rather than at open, because
  GitHub's documentation does not state whether auto-merge can be enabled on a
  draft. Enabling it at the moment the draft lifts sidesteps the question and
  matches the rule.
- `scripts/production/github-merge-protection.sh` sets the GitHub side: a
  ruleset on `main` requiring a pull request with both CI checks green at an
  up-to-date head, squash only, no force push or deletion, **zero required
  approving reviews**, no bypass actors, plus repository auto-merge on and
  Actions forbidden from approving pull requests. Zero approvals is deliberate:
  Brian is the only human here, GitHub reviews are not how this repository
  decides anything, and a required approval he cannot give himself would lock
  him out of his own work.

### Who may lift a draft

`/start-issue` and `/run-mission`, and nothing else. `implementation-worker`
opens the pull request and the Lead lifts it after review; `/finish-issue`,
`/finish-mission`, `/mission-intake`, `code-reviewer` and `scout` never lift
one. `AGENTS.md` states the rule once and `tests/agent-harness.test.ts` proves
every skill and agent file carries it.

`.claude/settings.json` moves `Bash(gh pr ready *)` from `deny` to `allow`;
`Bash(gh pr merge *)` stays denied. This is a real loosening of the agent fence
and it is deliberate: merge authority stays with GitHub, and only the readiness
signal moves to the agent. Those permissions are session-wide, so the
restriction to two roles is enforced by the written rule and its test rather
than mechanically.

### What is deleted

Both merge workflows; both opt-in labels; `.github/fast-lane-rules.json` in
full, with its eligibility classes, `allowedChangeStatuses`, `testGuards` and
per-class `verification`; `scripts/fast-lane/` entirely; `docs/fast-lane.md`;
and the receipt in its entirety — `buildMissionReceipt`, `renderReceiptBlock`,
`extractReceipt`, `receiptDefects`, `ownerDecisionCited`,
`visualCarryForwardDefects`, `evaluateProspectiveMissionGate`, and the
`standardRoute` and `ownerApprovalSurfaces` blocks in the merge rules.

The receipt existed only because a workflow that could not see the mission
journal had to be told what the journal said. The workflow no longer needs
telling: the act that authorizes a merge is the Lead lifting the draft, and the
Lead does that locally, where the journal is visible.

### What survives

The `prohibited` list, unchanged in substance and not expanded — it is now the
only rule with teeth. `requiredChecks`, `baseBranch`, `visualSurfaces` and
`reviewContract`. `globToRegExp` and `parseNameStatus` move to
`scripts/merge/paths.mjs`, and `requiredChecksPassed` to
`scripts/merge/checks.mjs`; the prohibited-path scan and the visual classifier
move to `scripts/merge/gate.mjs`, and the rules file is renamed
`.github/merge-rules.json` so no file is named after a lane that no longer
exists. Two protections follow their code: `scripts/fast-lane/**` becomes
`scripts/merge/**`, and `tests/fast-lane-*.test.ts` becomes
`tests/merge-*.test.ts`. `journalConjuncts` is repurposed from "may the Lead
publish a receipt" to "may the Lead lift the draft" — same conditions, new
consumer — and `mission gate` is what asks it.

## Consequences

- **`docs/adr/**` becomes auto-mergeable.** It was protected by the fast lane's
  list, not the mission one, and the prohibited list does not expand. Known and
  accepted at LAN-209.
- **There is no re-draft-on-push machinery, deliberately.** Un-drafting is the
  final step; nothing is expected to happen to a pull request afterwards. A
  commit landing after that means the process was run wrong, and that is not a
  case to build for.
- **A merge still does not deploy.** `deploy.yml` is `workflow_dispatch` only,
  and a GITHUB_TOKEN merge triggers no downstream workflow. `main` moves ahead
  of production until Brian deploys.
- **Draft state now carries real weight.** Anything left as a draft is
  unmergeable by every automated path in this repository, which is the point.
