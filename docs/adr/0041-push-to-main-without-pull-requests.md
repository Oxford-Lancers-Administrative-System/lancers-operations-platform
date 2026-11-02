# 0041 — No pull requests: branch, check locally, push to main

**Status:** Accepted · **Date:** 2026-11-02 · **Supersedes:**
[0038](0038-one-universal-merge-rule.md) · **Amends:**
[0006](0006-solo-developer-branch-protection.md),
[0027](0027-mission-harness.md)

Decided by Brian on 2026-11-02 (LAN-523), after the delivery analysis in that
issue.

## Context

The pipeline had grown two gates that said the same thing. Every change ran the
full CI suite on a pull request, was held to an up-to-date head, auto-merged by
GitHub, and then ran the same suite again on `main`. Measured over the last
month, one CI run took about 6.5 minutes and the second run on `main` repeated
the first on the same tree. When pull requests queued, the up-to-date rule forced
a fresh run per `update-branch`. The longer waits (55 to 88 minutes between the
last green run and the merge) were review, rebase and Brian's turnaround, not
GitHub.

What actually stands between a bad commit and production was never the merge
gate. `deploy.yml` is manual and its preflight refuses any commit that is not on
`main` with both required checks green at that exact SHA. Production keeps
running the last deployed image whatever `main` holds.

The club has one administrator. A pull request in front of every change, a
workflow to arm auto-merge, a draft bit as the authorization, and a mission
journal keyed on pull-request state were all machinery for a second person who
does not exist.

## Decision

**There are no pull requests.** A branch reaches `main` exactly once, in one
fast-forward push, as the last act of the work, and that push is the landing.

1. Work happens on one side branch per issue or batch (`feat/`, `fix/`,
   `docs/`, `chore/` plus `lan-###-…`). Several issues may share a branch, one
   commit each.
2. Every check runs locally on the branch first: `npm run verify`; when
   migrations change, `db:reset`, `db:seed`, `types:generate`/`types:check`,
   `check:rls`; and the database suites.
3. Review is cut down to the paths that earn it. One `code-reviewer` pass at the
   branch's final head, and only when the real diff touches a path in
   `reviewRequired` in `.github/merge-rules.json` (the list that was
   `prohibited` under ADR 0038, kept in full, with its meaning changed from
   "Brian merges this" to "this gets reviewed"). Everything else is pushed with
   no review. Visual work still needs Brian's visual approval recorded against
   that same head.
4. The branch reaches `main` in one push: merge `origin/main` into the branch
   (never rebase; force-push stays denied), rerun `npm run verify` if main moved,
   then `git push origin HEAD:main`. Agents may take this push, under the rule in
   `AGENTS.md` "Merging". A branch that touches an `ownerOnly` path is pushed by
   Brian alone; today that is `missions/**/packet.json`, whose landing on `main`
   is Brian's approval of that exact packet version.
5. `ci.yml` runs once, on `main`. If `main` goes red it is fixed forward at once
   and nothing else lands until it is green.
6. Deploy is unchanged. Brian runs `gh workflow run deploy.yml`; its preflight
   refuses any commit whose required checks are not green. A hosted
   `supabase db push` happens only after `main` is green at the commit that
   carries the migration.
7. No agent deploys, applies a hosted migration, or writes to production.
8. The Production handoff block that used to live in the pull-request body is one
   Linear comment on the issue, posted when the branch lands on `main`. The
   commit body carries the why.

### What changed in the repository

- Deleted: `.github/workflows/merge.yml`, `.github/PULL_REQUEST_TEMPLATE.md`,
  `scripts/merge/gate-cli.mjs`, `scripts/merge/checks.mjs`,
  `scripts/production/lan-209-agent-merge-rule.sh`.
- `ci.yml` triggers on a push to `main` only, never cancels a commit's run, and
  always runs the tooling suites. Side branches are not triggered: the checks
  already passed locally, and a second run would restate that.
- `merge-rules.json` keeps `requiredChecks` (`deploy.yml` reads it) and
  `visualSurfaces`/`reviewContract`; `prohibited` becomes `reviewRequired`, and a
  new `ownerOnly` list carries the packet.
- The mission journal records `head-recorded` (a branch head to review) and
  `main-pushed` (the head reached `main`, route `agent` or `owner`) where it
  used to record `pr-opened` and `merge-recorded`. The lifecycle names are
  unchanged: `merged` now means on `main`, and `gate-passed` means the push gate
  passed. Reclamation is proved by ancestry of the pushed SHA on `origin/main`.
- `.claude/settings.json` allows `git push origin HEAD:main` and pushes of
  `feat/ fix/ docs/ chore/` branches. Every deny on force-push, deletion, deploy,
  `gcloud` and hosted database commands stays.
- `scripts/production/github-merge-protection.sh` now sets a ruleset that blocks
  force pushes and deletion of `main` and nothing else.

## Consequences

- **A red commit can sit on `main`.** It blocks every deploy until fixed, and
  production is untouched because deploy is manual and gated. The cost is delay
  and one repair push. This is the price of the model and it is small.
- **The first proof of a migration is local.** Nothing enforces that `db push`
  waits for a green `main`; it is a written rule, in `AGENTS.md`, the migration
  runbook and the deployment runbook.
- **The branch ruleset no longer stops Brian pushing red code.** The only
  remaining guards are force-push and deletion blocks, the local checks, and the
  deploy preflight.
- **Dependabot security updates still open pull requests.** Version updates are
  already off (`open-pull-requests-limit: 0`); a security update, if one opens,
  is merged by Brian by hand in the GitHub UI. That is the one place a pull
  request survives, and no workflow acts on it.
- **Per-change history is the commit.** One commit per issue replaces the squash
  commit, and the commit body replaces the pull-request description.
- **The mission harness keeps its per-package review inside a mission.** The
  cut-down review rule applies to issues and branches; a mission package still
  needs the clear package review its contract generates, because that review is
  also where its visual and runtime evidence is filed.
