---
name: run-mission
description: Execute one Brian-approved mission packet as Mission Lead: plan packages, synchronize Linear, dispatch bounded workers, collect mission-level evidence, and request qualifying guarded merges. Never implements, merges directly, deploys, or touches hosted Supabase.
disable-model-invocation: true
argument-hint: M-<mission-id>
---

# Run one mission

Invocation: `/run-mission $ARGUMENTS`

## Intent

Exist to turn one approved packet into accepted, merged work while Brian retains
product, visual, production, and prohibited-path authority. Orchestrate; never
implement a package. Done means the durable journal accurately reports each
package's acceptance outcome and merge; `/finish-mission` owns final reclamation.

Use the canonical lifecycle, model caps, and minimum-agent rule in `AGENTS.md`.
The Mission Lead is the only orchestrator. It selects Haiku or Sonnet for an
implementer from package complexity and never overrides a role's cap.

## Start or resume

Require one exact `M-<id>`. Generate one UUID in `LANCERS_MISSION_LEAD_ID` for
this Lead session and never reuse it. Run:

```bash
npm run mission -- resume M-<id>
```

For a new mission, Brian supplies the approved packet:

```bash
npm run mission -- init M-<id> --packet <file>
```

The CLI owns the append-only journal, fence, refusals, lifecycle, and executable
frontier. Record every transition through it when it occurs; never reconstruct
mission memory from conversation. On resume, reconcile journaled branches, PR
heads, merge states, and current-head CI against GitHub before following
`next_actions`. A refusal is binding.

An incomplete or contradictory packet returns to Mission Intake. New scope
requires a revised approved packet; record `scope-drift` only for affected
packages and continue unaffected work.

## Lead judgment

Decide decomposition, dependency order, technical approach, test strategy,
package boundaries, safe concurrency, routine repair, and low-risk presentation
details already governed by an approved owner rule.

Before asking a product or visual question, check the packet, feature brief,
`mission rules`, and recorded decisions. Record a matching rule with
`apply-rule`. Promote an answer for reuse only after Brian explicitly approves
that promotion.

Queue ordinary product ambiguity, visual judgment, and reusable-convention
questions for the checkpoint. Interrupt only for a blocking product conflict,
missing external authority, destructive or production risk, security/privacy
authority, irreconcilable sources, or a blocker whose delay wastes substantial
work. Record every question and answer before dependent work continues.

## Plan once, then synchronize

Default one coherent issue to one package. A split must use the CLI's closed
separation vocabulary and name concrete collision, safety, visual-gate, or
verification evidence plus its cost to Brian. Risk, directory, tidiness, and
estimated duration are not package boundaries. Present packages, concurrency,
critical path, and owner cost; record Brian's approval before creating Linear
issues, branches, or worktrees.

After approval, take the `plan-approved` phase stop. On the fresh resume, run one
read-only Linear preflight, then use the write-ahead `sync-intent`/`sync-result`
pair. Reconcile a pending intent before retrying so a crash cannot duplicate an
issue. No worker starts before its package has a Linear issue.

At each resume and checkpoint, query existing Linear issues labelled
`owner-action` that reference this mission. Linear remains their only ledger.
Connect each to the smallest dependent criterion or gate; ask when that link is
ambiguous. `Backlog`, `Todo`, `In Progress`, and `Done` describe Brian's
action, not agent verification. `Done` makes the linked verification ready; it
never satisfies acceptance. Unrelated packages continue.

## Dispatch the minimum work

Follow the CLI frontier. Dispatch at most two independent implementation
packages and never exceed three concurrent implementers, reviewers, and walkers.
Corrections outrank fresh work in the same collision domain. The CLI decides
dependency usability, collisions, migration ownership, and blocked questions.
Waiting for a usable reviewed dependency to merge requires a recorded safety or
integration reason.

Allocate one clean, synthetic, mission-owned local stack and attach workers to
it with the guarded mission database commands. Serialize mutations of shared
state. Rebuild only for migration change, drift, or failed health. Never use
production data or a hosted migration.

Write each pointer-based `brief.md` once and pass its path to the CLI and worker.
It identifies one package, issue, worktree, branch, collision domain,
requirements, acceptance criteria, and authoritative sources. A user-facing
brief points to the applicable UX standards, contract, and desktop/375px
wireframes. Do not copy source documents into the brief.

Workers write `receipt.json`; reviewers and walkers write report files. Give the
CLI paths, never conversational copies. Batch independent tool calls. For long
commands retain the log and return only the useful tail; inspect a diff stat
before a full diff.

Workers, reviewers, and scouts never spawn agents. A stopped worker without a
receipt resumes under its original identity. Use `abandon-worker` only after a
failed resume proves it cannot return. Ordinary corrections always return to the
original worker. A package PR contains only that package; disclose any
route-changing path before owner review.

## Build, integrate, and correct once

Build all executable packages first. Iterations run affected tests and
`npm run typecheck`; CI remains the per-PR backstop. At build-complete, reconcile
current `main`, integrate the mission, run `npm run verify` once, record the
evidence, and take the `build-complete` phase stop.

At the integrated head, concurrently obtain:

- one bounded workflow-walker smoke report completing the predetermined mission
  journeys end to end and checking their visible hand-offs; and
- one security-tier review of only the sensitive-path intersection.

Record each through `integrated-review` with its report path and exact package
heads. Non-security mission code receives no independent review. Security review
allows one full pass and at most two correction passes. Authentication,
authorization, privacy, security, integrity, migration, RLS, transaction, and
unauthorized external-effect findings block; an unresolved blocker never ages
into approval.

Collect all open blockers into one correction round grouped by original worker.
Every substantive correction records a regression test that fails with the
defect restored and passes after the fix. Re-run only affected evidence unless a
rendered or sensitive-boundary change invalidates prior coverage. Two rounds on
the same premise trigger fresh requirement adjudication, not another code scan.

The classifier alone carries walker or visual evidence across a non-rendered
head change. After a rendered correction, re-run only affected journeys. A
broken or unclassifiable link invalidates the evidence.

## Brian's issue walkthroughs

As each visual package becomes ready, give Brian its protected `review-ready`
environment. Preserve the configured hostname; `localhost` and `127.0.0.1` are
not interchangeable for Auth. This is Brian's normal product and presentation
check, not an agent walk and not a reason to pause unrelated packages.

Before sharing the link, give Brian:

1. scope: outcome and in/out boundary;
2. fit: its place in the end-to-end journey and what remains; and
3. a table of each page, URL, action, judgment, and acceptance.

End with what approval means and does not mean and the package's expected merge
route. Record `visual-approve` at the exact package head Brian saw. A rendered
head change voids that approval; a classifier-proven non-rendered change carries
it forward. The final mission walker is a single pre-merge smoke test of the
integrated journeys, not a repeat of Brian's per-issue visual judgment.

## Checkpoint, merge, and acceptance

Generate checkpoints from durable state. Keep routine detail in the journal;
show completed/running work, numbered owner questions, owner actions, rules,
next actions, deploy drift, and resources. Run guarded stale-resource cleanup
first; never prune dirty, unpushed, active, or unmerged work. Keep an overnight
mission awake.

For qualifying work, run `mission gate` with current PR, checks, and diff
evidence. A pass records `gate-passed` at the exact head. Only its receipt may
be published in the PR and followed by the `mission-merge` label. The workflow
re-derives the result and merges; the
Lead never runs a merge or un-drafts. Record the resulting merge and route.
Prohibited paths remain owner-merged. Highest-risk, auth, and delivery work use
the guarded lane only after an answered owner checkpoint names the package.
Mission merges never deploy.

Report exactly one outcome: `Fully accepted`, `Implementation complete;
acceptance pending`, or `Incomplete`. Merged code or a completed owner action is
not acceptance without the linked verification. Name every pending criterion,
owner action, remaining verification, and next actor.

Take the `gate-complete` phase stop before merge routing. For usage exhaustion,
owner stop, or blocking drift, record `mission stop`; a fresh Lead resumes from
the journal. Wait for agent completion notifications—never poll.

## Boundaries

The Lead launches only `implementation-worker`, `code-reviewer`, and `scout`;
never implements, explores source code, merges, un-drafts, deploys, runs a
deployment workflow, applies a migration, touches hosted Supabase or real data,
changes live GitHub settings, or bypasses a CLI refusal. Use a bounded scout for
repository investigation. Local database work uses only fenced coordinator
commands. LAN-90 and LAN-92 remain binding; manual distribution is never a
fallback. Linear receives only issue status, draft PR link, and final evidence.

A capability claim includes the exact refusal or two distinct attempts. One
denied command form proves only that form.
