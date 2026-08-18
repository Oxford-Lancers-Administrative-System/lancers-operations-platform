# 0027 — Mission Harness v1: mission-oriented orchestration with a guarded autonomous merge lane

**Status:** Accepted · **Date:** 2026-08-18 · **Extends:**
[0017](0017-batched-fast-lane.md), [0020](0020-zero-command-visual-review.md),
[0024](0024-bounded-lineage-aware-review.md),
[0025](0025-separate-finding-impact-from-gate-disposition.md) ·
**Supersedes in part:** the single-issue-only orchestration posture of
[0018](0018-single-issue-agent-development.md) and
[0020](0020-zero-command-visual-review.md)

Approved by Brian on 2026-08-18 through the "Build Mission Harness v1 for
Autonomous Multi-Issue Engineering" task, whose green-callout boundary this
decision implements. Three owner decisions recorded that day govern the
design: a guarded autonomous merge does **not** deploy; ADR 0020's live
visual review stays mandatory for UI work; and this build itself traveled
the normal single-issue workflow with Brian merging its pull request.

## Context

The single-issue model — one user-invoked `/start-issue`, one top-level
implementer, one bounded reviewer, one draft PR, owner handoff — produced
strong controls and too much Brian. Every issue required him as dispatcher
and merger, so the sustained rate of correctly completed work was bounded by
his availability rather than by the fixed Claude/ChatGPT subscriptions. The
desired operating model is mission-oriented: Brian defines and corrects
product intent; a Mission Lead owns engineering execution inside approved
intent; Brian checks in roughly hourly, answers a short queue, and walks
away.

Two prior decisions constrained the design. ADR 0018 asserted no
implementation subagents and no multi-issue planning. ADR 0017 rejected, as
its alternative 3, letting an agent merge "guarded by a checklist," because
it would weaken `.claude/settings.json` and move authority from a reviewable
file into a prompt. This decision changes the orchestration posture
deliberately and keeps 0017's actual safety mechanism intact.

## Decision

**1. Mission state is an append-only journal, replayed on read.**
`scripts/mission/lib/state.mjs` stores one NDJSON journal per mission under
the same machine-local, repository-identity-keyed root the database
coordinator uses. There is no persisted snapshot: `reduce(events)` is the
state, so a fresh Mission Lead after a kill, compaction, or usage stop holds
exactly what the journal proves. Every transition validates against the
replayed state under a lock, and every control-plane refusal — dispatch
before Linear sync, a third worker, a colliding domain, a second migration
owner, a replacement implementer for an ordinary correction, an unapproved
rule promotion — lives at that single write path. Mission memory never
depends on chat history.

**2. Two workflows, two subagents, flat delegation.** `/run-mission M-<id>`
makes the top-level session the Mission Lead: it plans a work-package DAG
with stable IDs and declared collision domains, synchronizes Linear through
write-ahead intent/result pairs (idempotent under crash and retry),
dispatches at most two `implementation-worker` subagents, routes reviews
through the unchanged `code-reviewer`, and resumes the **original** worker
for ordinary corrections. Workers inherit the proven `/start-issue`
execution contract and cannot spawn agents. `/start-issue` is preserved
unchanged for deliberate manual use. The reviewer's contract — isolation,
exact-SHA pinning, provenance-before-framing, dispositions, reset
conditions, circuit breaker, three-invocation budget (0024/0025) — is
untouched; only the receipt's recipient generalizes to the orchestrating
session.

**3. Owner interaction is a durable queue plus a rule registry.** Questions
are classified `immediate` or `hourly` when recorded; an unanswered question
pauses exactly the packages it names, and the answer is persisted before
dependent execution resumes. Brian's answers become reusable rules only
through explicit promotion with recorded approval evidence; before asking
any product or visual question the Lead checks requirements, brief, registry,
and recorded decisions, in that order. The hourly checkpoint is rendered
from durable state and includes the main-versus-deployed drift.

**4. A guarded autonomous merge lane for standard application work — and
what it deliberately trusts.** The fast lane's mechanism is inherited whole:
a checked-in workflow (`.github/workflows/mission-merge.yml`) that only ever
runs the default branch's copy, fetches the PR's objects without executing
them, re-derives every server-verifiable conjunct from evidence — base,
fork, mergeability, a prohibited-path scan of the real diff against
`.github/mission-merge-rules.json`, required checks green at the exact head
— and merges with `GITHUB_TOKEN`, `--match-head-commit`, never `--admin`,
restoring the draft on failure. Agents still hold no merge capability;
`.claude/settings.json` is unchanged.

Where this lane departs from 0017: the review result, visual approval, and
owner-question facts have machine-local ground truth the workflow cannot
see. The Mission Lead therefore satisfies the journal-side gate first and
publishes a structured `mission-merge-receipt` into the PR body; the
workflow checks that receipt's coherence rather than taking it whole — its
reviewed SHA must equal the current head, and a `nonvisual` claim is refused
from evidence when the diff touches a visual surface. Alternative channels
were considered and rejected: a check-run or commit status must be written
by a workflow from the same Lead-authored text and adds nothing; a CI
artifact is produced by executing PR code, which is strictly worse; a
committed receipt cannot contain its own SHA. The residual trust is a
bounded, auditable extension Brian approved for **standard application work
at low or normal risk only**: migrations, RLS/auth/security, secrets,
deployment, WhatsApp and external configuration, Highest-risk work, and
visual work without recorded approval can never travel the lane, because the
prohibited-path scan and the receipt schema refuse them from evidence. The
lane cannot widen itself — its rules, workflow, gate, proofs, and runbook
are prohibited from both automatic lanes and protected in the fast lane's
rules.

**5. A mission merge does not deploy.** Decided by Brian: `GITHUB_TOKEN`
suppression is the feature, matching the v1 exclusion of autonomous
production deployment. `main` moves ahead of production until Brian runs
`gh workflow run deploy.yml` or merges something himself (which deploys and
carries the accumulated work). The checkpoint reports the drift so deploying
is a told fact, not a remembered chore.

**6. The harness tests are rewritten as the new constitution, not
weakened.** `tests/agent-harness.test.ts` now pins both workflows, both
agents, flat delegation, the two-worker cap, migration serialization,
dispatch-after-sync, correction lineage, rule-before-question, the
fail-closed gate, and the owner boundary — while preserving every assertion
the fast-lane governance suite depends on. `tests/mission-*.test.ts` prove
the state machine, the gate, the workflow's governance, and the thirteen
synthetic readiness rehearsals, and are themselves protected governance.

## Consequences

- Brian's involvement per unit of standard application work drops to packet
  approval, hourly checkpoints, visual judgments, and deploys. His authority
  over schema, security, production, external services, and product intent
  is structurally unchanged.
- A class of merge now happens with no human reading the final diff. The
  compensating controls are the evidence-derived conjuncts, the coherence
  tripwire, current-SHA CI, the unchanged independent review whose receipt
  the merge requires, and the audit trail (journal + PR receipt + workflow
  verdict artifact). A fabricated receipt is an affirmative, durable lie
  auditable against the journal — the same accountability model 0024 relies
  on for review receipts.
- Real Linear writes, real workers, and real guarded merges are pilot
  evidence, not this decision's evidence: v1 readiness is proved by
  deterministic synthetic rehearsals only.
- One Mission Lead runs at a time; the schema stores many missions but
  concurrent mission scheduling is out of scope, as are more than two
  workers, a third database slot, and automatic wake-up after usage limits.

## Alternatives considered

- **Keep the single-issue model and batch harder.** Rejected: the bound is
  Brian-as-dispatcher, not batch size.
- **Let the Mission Lead merge directly under a prompt checklist.** Rejected
  again for 0017's reason — authority belongs in a reviewable checked-in
  workflow, and `gh pr merge` stays denied to every agent.
- **Trust the mission journal from the workflow by uploading it.** Rejected:
  an uploaded journal is still Lead-authored text; shipping it adds surface
  without adding independence. The receipt plus coherence checks is the same
  trust, smaller and inspectable where the merge happens.
- **Agent Teams / recursive delegation.** Explicitly excluded by the
  approved task for v1.
