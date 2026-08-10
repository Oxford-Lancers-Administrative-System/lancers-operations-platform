# 0013 — Supervised parallel agent development, capped at two workers

**Status:** Accepted · **Date:** 2026-08-10

Supersedes the blanket "no custom subagents, skills, hooks, slash commands, or
agent hierarchy" rule previously stated in `AGENTS.md` and `CLAUDE.md`. That rule
is narrowed, not removed: everything it excluded is still excluded except the
three roles named here.

## Context

The prohibition existed for a good reason. An unbounded cast of specialised
agents is a maintenance surface with no owner, it drifts from the working
agreement it was supposed to encode, and it makes it impossible to say who
changed what. Nothing about that has become untrue.

What changed is the shape of the work. The twelve functional issues of the First
Operational Vertical Slice are now specified and ordered, several are genuinely
independent of each other, and Brian is the only human in the loop. Running them
strictly one at a time wastes the independence that the dependency graph already
proves exists. Running them without structure is worse: agents sharing one
checkout overwrite each other, an agent that reviews its own work approves it,
and a self-reported "verify passed" is not evidence of anything.

The gap was never mechanical enforcement. Pull-request CI already covers format,
lint, typecheck, tests, production build, migrations-from-empty, RLS posture,
generated-type drift, synthetic seeding, and a container build-and-serve probe.
`main` is already protected with those two checks required and no bypass
(ADR 0006). The gap was **bounded orchestration and independent review of
application code** — the part CI cannot do.

## Decision

Three checked-in roles, and no more, under `.claude/`:

| Role                                  | What it is                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `.claude/skills/supervise-batch/`     | The lead workflow. Brian invokes `/supervise-batch`; it is not model-invocable. |
| `.claude/agents/issue-implementer.md` | One issue, one worktree, one branch, one draft pull request.                    |
| `.claude/agents/code-reviewer.md`     | Fresh context, read-only, reviews the diff and never repairs its own findings.  |

The operating model:

- A top-level Opus session is the lead. It selects work from the Linear
  dependency graph, briefs workers, verifies their evidence **against the
  repository rather than against their reports**, routes each draft pull request
  to the independent reviewer, and returns the result to Brian.
- Implementers run with `isolation: worktree`. A shared checkout is not an
  acceptable substitute; two writers in one working tree is the failure this
  whole structure exists to prevent.
- The reviewer starts cold, holds no editing tools, and is given the pull request
  number, the head commit SHA, the issue identifier, the test matrix, and its
  lock status — never the implementer's summary.
- **No agent merges, un-drafts, deploys, migrates hosted Supabase, or writes to
  production.** Brian merges. Every batch ends with him holding reviewed pull
  requests.
- Work that could collide is serialised rather than parallelised. The list is in
  the lead workflow: migration ordering, generated database types, auth
  boundaries, shared routing or shell, root dependency files, shared theme, the
  same service or API or core test fixture.
- **The database lock covers every agent, not only implementers.** Worktree
  isolation isolates files; it does not isolate the local Supabase stack, which is
  one set of containers shared by every worktree. A reviewer running the
  Supabase-backed tests or challenging an RLS rule mutates the same database an
  implementer is running against. Exactly one holder at a time across a wave,
  stated in writing in every brief, handed over explicitly.
- **The reviewer pins itself to the pull request's exact head commit** before
  reading, testing, or challenging anything, and reports that SHA. A reviewer
  starts on the default branch, so without this step it reviews `main` and is
  confidently wrong. An injected defect is never committed, staged, pushed, or
  left behind, and the reviewer proves a clean worktree at the exact head commit
  before it finishes.
- **The lead reads the GitHub Actions run itself** — job conclusions and logs for
  that head commit — rather than a worker's claim or an unopened green tick.
- **Plans, test matrices, and run reports are persisted in Linear** as comments on
  the issue they belong to: the wave record and matrix before launch, the run
  report after, both linked from the pull request. Agent context is transient and
  is not evidence.

### Testing is a contract written before implementation

The lead writes a **test matrix** for each issue before its implementer is
launched, derived from the acceptance criteria and the authoritative
requirements. Each material behaviour records its expected success, its
invalid/failure behaviour, its boundary conditions, its authorization and
privacy expectations, the appropriate test level, and whether it is critical.
Everything deliberately left untested is listed with its reason and residual
risk.

If an issue is ambiguous, internally inconsistent, or missing a material
acceptance criterion, the wave **stops and escalates**. Product ambiguity is
Brian's to resolve. An implementer choosing its preferred reading is how a slice
silently becomes a different product, and it is the failure mode a test matrix
written up front is specifically designed to catch — while it is still cheap.

### The implementer writes the tests; it does not certify them

Self-certification is the structural weakness of a single agent doing the work.
So the reviewer independently compares the issue, the requirements, the matrix,
the implementation, the tests, and the CI result, and answers seven questions
explicitly: is every material acceptance criterion evidenced; are negative and
boundary cases covered; are authorization and privacy rules tested; do mocks
conceal integration failures; do the tests assert observable outcomes rather than
internal calls; could an incorrect implementation still pass; are untested areas
disclosed accurately.

**A green CI run is not approval.** It reports that the tests which exist pass,
which is a different claim from the right tests existing.

### Critical behaviours are challenged, not reasoned about

For every matrix row marked critical — business rules, security, privacy, state
transitions — the reviewer injects a plausible defect in its own worktree, runs
the tests that should catch it, records whether they did, and discards the
change. A test that does not fail when the rule is removed is not protecting the
rule, and no amount of reading it will reveal that.

This is deliberately a reviewer's habit rather than a tool. No mutation-testing
framework is installed under this decision: the dependency and the runtime cost
are not justified until repeated use shows the manual version is the bottleneck.

It is also the one bounded exception to the reviewer being read-only. The
mutation happens via the shell, in the reviewer's disposable worktree, and is
discarded before it finishes — it never reaches the pull request, the branch, or
the main checkout.

### End-to-end coverage arrives with the screens, not before

No speculative Playwright suite is added ahead of a working interface. Once an
issue delivers a user-facing workflow, its matrix must include a small browser
suite for that workflow's load-bearing path, and by the end of the First
Operational Vertical Slice the principal operator journey and the player RSVP
journey both have end-to-end coverage. Browser tests complement service,
integration, database, RLS, and authorization tests — they never substitute for
them, because they are the slowest and least precise way to prove anything that
a cheaper level can prove.

### Human gates outrank the dependency graph

A clear dependency graph does not make an issue eligible. Two gates are recorded
explicitly in the lead workflow because they are the ones an agent would
otherwise reason its way past:

- **UX approval (LAN-90).** No user-facing implementation before Brian's dated
  approval of `docs/ux/slice-ux.md`. It blocks LAN-73 and transitively LAN-74
  through LAN-82; it deliberately does not block LAN-71 or LAN-72, which have no
  interface. If an implementer would have to invent a screen, a state, a primary
  action, or a label, the gate has not been passed.
- **Delivery.** **Automated WhatsApp delivery is a locked requirement.** Manual
  posting or manual distribution is never an MVP, pilot, fallback, or separate
  acceptable path. No invitation-delivery workflow begins before Brian resolves
  the feasible approach, and an agent may never implement a manual path, offer it
  as an interim step, treat it as satisfying an automated-delivery requirement,
  or assume it to resolve an ambiguity.

  This currently contradicts the requirements themselves. **LAN-78**, **LAN-82**,
  and the First Operational Vertical Slice **project summary** still specify
  manual distribution. That wording is stale; those artifacts are recorded as
  blockers for Brian, and the lead is forbidden from selecting any of them until
  the requirements are corrected. An agent does not resolve the contradiction by
  editing the issue, by reinterpreting it, or by building the automated version
  from a document that specifies the manual one.

### Waves are recorded, and blockers are never assumptions

Each wave is recorded before launch (selected issues and why they are unblocked,
dependency status, expected collisions, worktree and branch assignments, human
gates still in effect) and reported afterwards, including when it is abandoned
or interrupted. The pre-launch record and test matrix, then the completed run
report, are persisted as Linear comments on every attempted issue; chat and a
temporary worktree are not durable evidence. Eight stop rules end a wave rather than being reasoned around,
and the supervisor may never silently convert a blocker into an assumption.
Correction is bounded to one reasonable cycle before a failure becomes a
reported blocker rather than a grind.

A failed or interrupted wave leaves branches, worktrees, draft pull requests and
Linear statuses in place and says where each was left. Cleaning up by destroying
the evidence is worse than the mess.

Two mechanical guards back this up, because a role description is a prompt and a
prompt is not a control:

- `.claude/settings.json` denies, session-wide, the commands that would merge,
  un-draft, close or reopen a pull request, push to `main`, rewrite history,
  delete a branch, deploy, reach hosted Supabase, mutate GitHub through the raw
  API, or change repository settings and secrets — including the alternate forms
  (`git -C`, `git -c`, `git push origin --force`, refspec `+`, `--mirror`,
  `bunx`/`pnpm dlx`/direct `node_modules/.bin` paths, raw `curl` at the GitHub
  API) and the shell indirections that would hide them (`bash -c`, `sh -c`,
  `eval`, flagged `xargs`). It also denies edits to `.claude/**`, so an agent
  cannot rewrite the guardrails it runs under. Deny rules are evaluated ahead of
  everything else and take effect without workspace trust, because they only
  restrict. The file grants nothing.
- The same file sets `disableBypassPermissionsMode`, so those denials cannot be
  skipped by starting a session in bypass mode. This is deliberately preserved:
  without it, an autonomous run could switch off every control above.

**These deny rules supplement the real controls; they do not replace them.**
Bash pattern matching is prefix-based and a determined or unlucky agent can
always find a spelling nobody enumerated. The controls that actually hold are
structural, and the deny rules exist to stop the easy accident before it reaches
them:

| Real control                | What it guarantees                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Protected `main` (ADR 0006) | No direct push, no force-push, no deletion — including for administrators. CI is required.                                       |
| A human merge               | Brian is the only one who merges, and only from a draft pull request he has read.                                                |
| Restricted credentials      | No production Supabase key or deploy credential exists on a development machine. Hosted work needs authorisation no agent holds. |
| Worktree isolation          | An implementer's writes land in its own checkout, not in anyone else's.                                                          |
| Independent review          | A second agent, cold, checks the diff and challenges the tests.                                                                  |

If a deny rule is ever the only thing standing between an agent and a
destructive action, that is a design defect to fix structurally — not a rule to
add another pattern to.

`tests/agent-harness.test.ts` asserts these invariants and runs inside the
existing `npm run test` step. No new CI job was added, and no existing check was
duplicated.

## Why concurrency starts at two

Two is the smallest number that is not one. It is enough to prove the mechanism
— that worktree isolation holds, that the lead really does check evidence, that
an independent reviewer finds things the implementer did not — while keeping the
failure modes legible. With two workers, a collision is obvious and its cause is
findable. With five, the lead's own attention becomes the bottleneck and the
supervision degrades into rubber-stamping, which is precisely the outcome this
structure is meant to avoid.

The binding constraint is not machine capacity. It is that one human merges
everything, and each pull request must be reviewable in one sitting.

**Raising the cap is Brian's decision, not the lead's**, and it needs evidence
from completed batches rather than a feeling that things went well:

- at least three consecutive two-worker batches with no cross-worker file
  collision and no worktree escape;
- the reviewer producing at least one substantive blocker that the implementer
  missed, showing the review step is doing real work;
- no case of the lead accepting a self-report that the repository contradicted;
- pull requests still reviewable by one person in one sitting at the current
  size;
- a resolution for the shared local Supabase stack, whose one wave-wide lock
  today serialises database-backed work by implementers and reviewers no matter
  how many worktrees exist.

Until then, a batch is at most two issues.

## Consequences

- `AGENTS.md` and `CLAUDE.md` no longer prohibit agent tooling outright; they
  point here and name the three roles. The prohibition on anything beyond them
  stands, and adding a fourth role is a decision for Brian.
- A separate test-breaker or adversarial-testing role is deliberately deferred
  until repeated use shows it is needed.
- Agents can still do the wrong thing inside their scope. The controls narrow the
  blast radius; they do not make review optional. CI remains the mechanical gate
  and Brian remains the merge gate.
- The reviewer keeps `Bash`, because it must fetch the diff, check status, and
  challenge critical tests. Its file-editing tools are removed and it runs in its
  own worktree, so "read-only" is enforced for every file tool and asserted — not
  enforced — for the shell. "Read-only" here means it never changes the pull
  request, the branch, or the main checkout; it does mutate its own throwaway
  worktree on purpose, and discards it.
- A wave now costs more up front: the test matrix is written before any code.
  That is the intended trade. Ambiguity found while writing the matrix costs
  minutes; the same ambiguity found after two implementers have built around
  opposite readings costs both of them.
- Playwright is not a dependency yet, and this decision deliberately defers it to
  the first issue that ships a screen rather than adding it now.

## Revisit when

The evidence above accumulates, the shared local Supabase stack stops being a
single point of contention, or a second human reviewer exists — at which point
the reviewer role's independence could come from a person instead.
