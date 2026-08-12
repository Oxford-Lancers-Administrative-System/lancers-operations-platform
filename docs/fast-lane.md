# The fast lane

A batched, automatically merged path for low-risk repository work. It exists so
that documentation fixes and test improvements do not each need a supervised
wave, a full independent review and Brian's attention. Everything it does not
cover keeps the workflow it already had: a draft pull request that Brian merges.

`AGENTS.md` § **The fast lane** is the short version and the binding statement of
policy. This page is the mechanism, the reasoning, and the owner actions.

The rules that actually decide are in
[`.github/fast-lane-rules.json`](../.github/fast-lane-rules.json). The workflow
that enforces them is
[`.github/workflows/fast-lane-merge.yml`](../.github/workflows/fast-lane-merge.yml).
The decision is recorded in [ADR 0017](adr/0017-batched-fast-lane.md).

---

## The one property that makes this safe

**The merging workflow re-derives eligibility from the diff.**

It reads the eligibility rules and the classifier from `main` — already reviewed,
already merged — and applies them to `git diff main...head`. It does not trust
the `fast-lane` label, the pull-request title, the body, a commit trailer, a
classification an agent wrote into the template, or anything else produced by
the agent that opened the pull request.

The label is how a pull request **asks**. The diff is what **answers**.

This distinction is the whole design. A workflow that merges because an agent
applied a label has a check whose two sides come from the same source: the
agent's own classification becomes the only thing standing between a
misclassification and `main`. Such a check is satisfied by construction and
proves nothing. So:

- `classify(diff, rules)` takes the changed paths and the patch, and has no
  parameter through which a claim could reach it.
- The workflow triggers on `workflow_run`, `pull_request_target` and
  `workflow_dispatch`, all of which execute the **default branch's** copy of a
  workflow. A plain `pull_request` trigger would execute the pull request's copy
  and let a pull request rewrite the thing deciding whether to merge it.
- The pull request's objects are fetched and diffed. They are never checked out
  and never executed.
- The rules mark `.github/**` and `scripts/fast-lane/**` protected, so a pull
  request touching them is refused as well as powerless.

## No agent holds merge capability

A **GitHub Action** performs the merge, not an agent. `.claude/settings.json`
still denies `gh pr merge`, `gh pr ready`, `gh api` and every variant, and
`tests/agent-harness.test.ts` still proves it. Neither file changed for this.

Agents open **drafts** and are forbidden to take a pull request out of draft. The
workflow marks an eligible pull request ready for review immediately before
merging it — after eligibility was recomputed from the diff and after every
required check concluded `success`. Authority lives in a reviewable checked-in
file; revoking it is deleting that file.

## What is eligible

| Class               | Paths                                                                |
| ------------------- | -------------------------------------------------------------------- |
| `documentation`     | `docs/**/*.md`, `README.md`, `scripts/pilot/**/*.md`                 |
| `test`              | `tests/**/*.test.ts`, `tests/**/*.test.tsx`, `tests/helpers/**/*.ts` |
| `agent-instruction` | Deliberately empty today — see below                                 |

Added and modified files only. A deletion, a rename, a copy or a type change is
ineligible whatever it touches: deleting a runbook or renaming a test away is
exactly the shape of change that needs a human, and refusing the class outright
is easier to reason about than enumerating the safe deletions.

Operational and production runbooks **are** documentation and are eligible. That
is deliberate: `docs/pilot-data-runbook.md` gates a production action, and
stating a boundary in it accurately is the kind of small, honest correction this
lane exists for. It changes what a human is told, never what a machine does.

### Why `agent-instruction` is empty

LAN-102 makes agent-instruction changes eligible **except the protected
governance rules**. Applying that exclusion to this repository empties the class:
every agent-instruction file here — `AGENTS.md`, `CLAUDE.md`, `.claude/**`, and
the pull-request template — now carries at least one of the four protected rules.

This is a finding, not an oversight, and it is stated rather than quietly
resolved. Widening the class is a decision for Brian, taken with a human reading
the diff, which is the exact thing the exclusion exists to require.

## What is never eligible

- Application and production code: anything under `src/`, **regardless of line
  count**, including the tests colocated beside it, which cannot be told apart
  from the code by path.
- Schema, migrations and database configuration: `supabase/**`.
- Executable tooling: `scripts/**`, except the pilot READMEs beside the hand-run
  SQL.
- Dependencies: `package.json`, `package-lock.json`.
- Deployment, infrastructure and workflows: `Dockerfile`, `.github/**`.
- Build, quality-gate and test-harness configuration: `next.config.ts`,
  `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `.prettierignore`,
  `.gitignore`, and the rest.
- Secrets and configuration surface: `.env.example`.
- Decision records: `docs/adr/**`. Amending or reversing one is Brian's.
- The architecture and data-model documents.
- Any test change that removes or weakens valid coverage.
- Any batch mixing eligible and ineligible work. It is refused whole; the
  eligible part is not merged on its own. Split it into two pull requests.

### The protected governance rules

A change to any of these must use the normal workflow and get Brian's approval,
even though several of them are Markdown:

1. **Fast-lane eligibility** — `.github/fast-lane-rules.json`,
   `scripts/fast-lane/**`.
2. **The required verification for the fast lane** — the same files, plus
   `AGENTS.md`.
3. **Automatic-merge authority** — `.github/workflows/**`, `.claude/**`.
4. **The protection of these rules** — `tests/fast-lane-*.test.ts`,
   `tests/agent-harness.test.ts`, `docs/fast-lane.md`, `docs/adr/**`,
   `AGENTS.md`, `CLAUDE.md`.

These rules cannot weaken or remove their own protections through the lane. Two
independent things stop it: the rules mark those paths protected, and the
workflow judges with `main`'s copy of the rules rather than the pull request's.

### Coverage may be added or strengthened, never removed

Whenever any file in a batch takes the `test` class, the whole batch is measured:

- net-negative test lines → refused;
- more `expect(` assertions removed than added → refused;
- a `.skip`, `.only`, `.todo`, `xit`, `xdescribe`, `.skipIf` or `expect.soft`
  introduced → refused;
- a deleted or renamed test file → refused.

None of these is forbidden in the repository. They are forbidden as an
**unreviewed** change.

## Fail closed

A path no rule classifies is `unclassified`, which is ineligible. Absence of a
rule is never permission. A new top-level directory, a binary file, a renamed
file or an empty diff all send the pull request to the normal lane, where a human
reads it. That converts "the rules went stale as the repository grew" from a
silent risk into an inconvenience.

## Proportionate verification

Fixed per class in the rules file, so no agent chooses its own:

| Class               | Local, before opening the pull request                                      |
| ------------------- | --------------------------------------------------------------------------- |
| `documentation`     | `npm run format:check`, `npm run test`                                      |
| `test`              | `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test` |
| `agent-instruction` | as `test` (stated so the rule exists if the class is ever widened)          |

`npm run build` is not required locally for these classes: no file Next.js
compiles can be in an eligible batch, and CI builds the application and the
container on every pull request regardless. **This is the only narrowing of the
repository-wide `npm run verify` rule, and it applies only to these classes.**
Everything else still runs the full `npm run verify` locally.

Required GitHub CI is the merge gate and is not proportionate to anything — it
runs in full on every pull request. A green CI run is necessary and never
sufficient: it cannot make an ineligible change eligible.

## How a batch is run

1. Classify each candidate issue against the checked-in rules and record the
   verdict and the reason. If any part is ineligible, **split it** — an eligible
   batch pull request, and a normal pull request for the rest.
2. Put several eligible issues in **one** branch and one pull request.
3. Run the local verification for every class present, and observe it pass.
4. Open a **draft** pull request using the template, filling in the **Fast lane**
   block and naming every included issue as `Closes LAN-nn`. The keyword is
   required — `close`, `fix` or `resolve`, in any tense, optionally governing a
   comma-separated run. A bare mention is **not** a delivery: a batch may
   explain that LAN-99 is a separate fix without claiming to have delivered it,
   and the workflow will refuse a batch that names no issue it intends to close.
5. Apply the `fast-lane` label.
6. CI runs. The merge workflow recomputes eligibility from the diff, checks every
   required check, marks the pull request ready, squash-merges it, and comments
   with the classification, the issues and the merged commit.
7. If it refuses, it says why on the pull request. The pull request stays a
   draft, in the normal lane.

## Consequences worth knowing before they surprise you

**A fast-lane merge does not deploy.** A merge performed with `GITHUB_TOKEN`
**does not trigger downstream workflows**, so `deploy.yml` does not run, and
neither does `ci.yml`'s `push: main` job. For this lane that is correct —
application code is ineligible, so nothing merged this way needs deploying — but
`main` can move without a Cloud Run revision following it. The next ordinary
merge deploys the accumulated documentation along with the code.

**Nobody is watching.** That is the point of the lane and it is also its risk.
The compensating controls are that the eligible set is small and path-based, that
it fails closed, that it cannot widen itself, and that every merge leaves a
comment and a workflow summary saying what was merged and why it qualified.

**Two batches racing is untested.** Concurrency is capped at two workers, and the
workflow serialises on a single concurrency group and refuses a stale head, but a
second batch merging while the first is mid-flight has not been exercised.

---

## Owner actions — Brian only

The lane cannot merge anything until these are true. An agent can neither
perform nor verify them.

### 1. Workflow permissions

**Settings → Actions → General → Workflow permissions.**

- Required: **Read and write permissions**.
- A workflow can only _narrow_ `GITHUB_TOKEN`'s permissions, never widen them
  past the repository default. If the default is **Read repository contents and
  packages permissions**, the `contents: write` and `pull-requests: write`
  declared by `fast-lane-merge.yml` are silently ineffective and the merge fails
  with a 403.
- `ci.yml` and `deploy.yml` both declare `contents: read` explicitly, so raising
  the default does not widen what they can do.
- Also on that page: **Allow GitHub Actions to create and approve pull
  requests** is _not_ required. Leave it off.

### 2. Branch protection on `main`

**Settings → Branches → `main`**, or the equivalent ruleset.

An API merge is not a direct push, so the existing rule that rejects direct and
force pushes does not block it. What must be true:

- Required status checks include **`Format, lint, typecheck, test, build`** and
  **`Container builds and serves`** — the two job names in `ci.yml`, and the same
  two names in `requiredChecks` in the rules file. A test fails if those drift
  apart, but only Brian can confirm GitHub is actually requiring them.
- Required approving reviews stays at **0** (ADR 0006). If it is ever raised, the
  Actions bot cannot approve its own pull request and the lane stops — which is a
  safe failure, not a silent one.
- **Do not** add the `github-actions[bot]` app to a bypass or "allow specified
  actors" list. The lane must merge _through_ the protection, not around it. The
  workflow never passes `--admin` and a test asserts it never acquires one.
- If a **ruleset** is in force with "Restrict updates" or "Block force pushes"
  plus **Do not allow bypassing the above settings**, confirm by watching the
  first merge: a blocked merge surfaces as a failed workflow step, not a silent
  no-op.
- **Allow squash merging** must be enabled (Settings → General → Pull Requests).
  The workflow uses `gh pr merge --squash --delete-branch`.

### 3. The `fast-lane` label

Already created — confirm it exists under **Issues → Labels**, named exactly
`fast-lane`. If it is ever deleted, recreate it with
`gh label create fast-lane --color 0E8A16`. Without it every pull request is
refused for not having asked, which is the right failure.

### 4. Linear closure

The issues carry `gitBranchName`, so the Linear GitHub integration is connected.
**Prefer the integration.** Confirm in Linear → Settings → Integrations → GitHub
that "Automate issue closing on merge" (or the equivalent) is on, and that the
magic-word list includes `Closes`. A batch pull request has one branch name and
several issues, so closure comes from the `Closes LAN-nn` lines in the pull
request body, not from the branch name. The workflow reads the same keywords
Linear does, so what its merge comment records as delivered is the same set
Linear acts on — and a bare mention closes nothing in either.

If the integration turns out not to close them, **do not** design a Linear API
key into this repository. A new privileged credential is Brian's decision and is
out of scope here; the fallback is that the lead closes the issues explicitly and
records that it verified each one moved to Done.

### 5. Verifying the first merge

The end-to-end path has been implemented but **the live merge has never run**,
because no agent may perform it and the permissions above did not exist. To
prove it:

1. Merge LAN-102 (this lane) into `main`.
2. Complete actions 1–4.
3. Take the prepared LAN-100 pull request (#13) — documentation-only, one file,
   `docs/pilot-data-runbook.md`, already labelled `fast-lane` — and confirm CI
   is green on it.
4. Run the workflow by hand once: **Actions → Fast-lane merge → Run workflow**,
   with the pull-request number. This is needed only for a pull request whose CI
   finished before the workflow existed; afterwards `workflow_run` fires on its
   own.
5. Expect: the workflow summary shows `documentation`, `LAN-100`, and
   `Decision: MERGE`; the pull request is marked ready, squash-merged, and
   commented on; LAN-100 moves to Done in Linear.
6. If any step fails, the pull request stays a draft and nothing is merged. The
   failure mode of this lane is that it does nothing.
