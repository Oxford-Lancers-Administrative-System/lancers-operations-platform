# Delegation brief template

The lead fills this in completely and passes it as the implementer's prompt.
All eight fields are mandatory. An `issue-implementer` is instructed to stop and
report rather than guess if any of them is missing or vague, so an incomplete
brief costs a whole worker launch.

Replace every `<…>`. Delete nothing.

---

## 1. Issue

`<LAN-nn>` — `<issue title>`
`<issue URL>`

Acceptance criteria, copied verbatim from Linear:

- `<criterion>`
- `<criterion>`

## 2. Objective

`<One paragraph: what must be true of the repository when you are done. Written
as an outcome, not as a list of steps.>`

## 3. Test matrix — the contract your tests are judged against

`<Paste the completed matrix from test-matrix.md, or link to it. It was written
before you were launched, from the acceptance criteria and the authoritative
requirements.>`

You write these tests. You do **not** certify them: an independent reviewer
judges their adequacy against this matrix and challenges every row marked
critical by injecting a defect and checking that a test fails.

Assert observable outcomes, not internal calls. Prove database constraints and
RLS against the database, not a mock. If a row proves untestable at the level
named here, report that — do not move it somewhere it proves less.

If this issue is ambiguous, internally inconsistent, or missing a material
acceptance criterion, **stop and escalate**. Do not resolve product ambiguity by
choosing the behaviour you prefer.

Browser tests: only if a row above names one, and only for a load-bearing path
of a screen that exists. They complement the other levels, never replace them.

## 4. Scope — the files and directories you own

- `<path>` — `<why it is yours>`
- `<path>` — `<why it is yours>`

Nothing outside this list is yours to change. If the issue turns out to require
a file outside it, stop and report rather than widening it.

## 5. Boundaries — what you must not touch

Owned by the other worker in this wave (`<LAN-nn>`), off limits entirely:

- `<path>`
- `<path>`

Off limits to every worker, always:

- `.claude/` — the harness that governs you
- `.github/workflows/` and branch protection
- `supabase/migrations/` — unless this brief's scope explicitly includes it
- `src/lib/supabase/database.types.ts` — generated; regenerate, never hand-edit
- any hosted Supabase project, Cloud Run, Artifact Registry, or secret store

## 6. Verification

Database lock: **`<HELD` / `NOT HELD>`**

> The local Supabase stack is one set of containers shared by every worktree and
> every agent — implementers and reviewers alike. Worktree isolation isolates
> files, not the database. Exactly one agent holds this lock at a time across the
> whole wave, and the lead grants the same single lock to reviewers one at a time
> when they need to challenge a database rule.
>
> If the lock is NOT HELD, do not configure or touch that stack, and do not run
> `npm run db:reset`, `npm run db:seed`, `npm run db:seed-user`, a migration, or
> the Supabase-backed tests — they would destroy another agent's database state
> mid-run. Run the database-free checks locally, let the isolated CI job execute
> the complete database suite, and disclose that local limitation. Ask the lead;
> never take the lock.
>
> If it is HELD, tell the lead when you are finished with the database so it can
> be handed to the next agent.

Run and observe passing:

```bash
npm ci
npm run verify
```

`<If the lock is HELD and migrations changed, also:>`

```bash
npm run db:reset && npm run db:seed && npm run types:generate && npm run check:rls
```

Report the tail of each command's actual output. A claim without output is not
evidence, and the lead will send it back.

## 7. Branch and base

Branch: `<feat|fix|docs|chore>/lan-<nn>-<short-slug>`
Base: `main`

Finish with a **draft** pull request into `main`, referencing `<LAN-nn>`.

## 8. Stop conditions for this issue

Beyond the standing ones in your role definition, stop and hand back if:

- `<issue-specific condition>`
- `<issue-specific condition>`

---

## What to send back

- branch name;
- draft pull request URL;
- `git log --oneline main..HEAD`;
- `git diff --stat main...HEAD`;
- the tests you added, and which matrix row each one covers;
- every matrix row you did **not** cover, and why;
- the tail of each verification command's output;
- untested areas and residual risk, disclosed accurately;
- anything you stopped on, and exactly where.
