# Run report template

The lead produces this at the end of **every** batch — including a batch that
was abandoned, blocked, or interrupted. It is the durable evidence that the run
happened and what state it left behind.

A worker's summary is not evidence. Every claim below must have been checked by
the lead against the repository itself: the actual diff, the actual commits, the
GitHub Actions logs for the current head SHA, and the actual review result.

This file is a template, not the record. Before launch, post the completed Wave
record and test matrix as a new Linear comment on every selected issue. At the
end, post the full completed report as another Linear comment on every attempted
issue, with links to each draft pull request and CI run. Do not edit this
checked-in template or commit run evidence into a feature branch.

---

# Batch run report — `<date>`

## Wave record

Written **before** launch, and left unedited afterwards. If reality diverged
from it, say so in Corrections rather than rewriting this section.

| Issue    | Why it is unblocked                                         | Dependency status        | Worktree / branch | Database lock   |
| -------- | ----------------------------------------------------------- | ------------------------ | ----------------- | --------------- |
| `LAN-nn` | `<blocking issues, and the merge commit that cleared each>` | `<all merged into main>` | `<branch>`        | HELD / NOT HELD |

**Expected collisions:** `<shared files, migrations, generated types — and how
they were serialised, or why the pair is genuinely independent>`

**Human gates still in effect for this wave:**

- `<e.g. LAN-90 UX approval — not yet recorded, so LAN-73..LAN-82 stay out of scope>`
- `<e.g. automated delivery approach unresolved — invitation-delivery issues out
of scope; LAN-78, LAN-82 and the project summary still specify manual link
distribution, which contradicts the locked automated-WhatsApp requirement, so
all three are blocked until Brian corrects them>`

**Database lock:** `<which agent holds it, and the hand-over order — exactly one
holder at a time across the whole wave, reviewers included>`

**Where this is persisted:** `<links to the Linear comments carrying the wave
record, each test matrix, and this report>`

## Per issue

### `LAN-nn` — `<title>`

- **Branch / pull request:** `<branch>` · `<draft PR URL>` · still draft: yes/no
- **Test matrix:** `<link or inline>` — material behaviours: `<n>`, critical: `<n>`
- **Tests added:** `<files, and what each proves>`
- **Commands run, and observed result:**

  ```
  <the actual tail of npm run verify, and any database commands>
  ```

- **Head commit reviewed:** `<$HEAD_SHA — the SHA the reviewer reported, which
must match the pull request head>`
- **CI:** `<check names, current head SHA, run URL, and conclusion per required
check — verified from gh pr checks plus the Actions log for this commit, not
from a worker's claim. Note the test count observed.>`
- **Independent review verdict:** blocked / clear
  - Blockers: `<verbatim, or "none">`
  - Suggestions: `<or "none">`
- **Critical behaviours challenged** (reviewer injected a plausible defect and
  confirmed a test failed):

  | Behaviour challenged | Defect injected                 | Test that caught it | Caught?      |
  | -------------------- | ------------------------------- | ------------------- | ------------ |
  | `<rule>`             | `<what was relaxed or removed>` | `<test name>`       | yes / **no** |

  A **no** is a finding, not a footnote: the rule is unprotected.

- **Reviewer worktree clean:** `<git status --porcelain empty; no injected defect
committed, staged, pushed, or left behind; database lock released>`
- **Corrections made:** `<what came back, what changed, and the re-verification>`
- **Untested areas and residual risk:** `<from the matrix's deliberately-untested
section, plus anything discovered during the run>`

## Database-lock timeline

| Holder                      | Phase                        | Acquired | Released | Database actions performed |
| --------------------------- | ---------------------------- | -------- | -------- | -------------------------- |
| `<implementer or reviewer>` | `<implementation or review>` | `<time>` | `<time>` | `<commands/tests>`         |

There may never be overlapping holders.

## Blockers and owner decisions needed

| #   | What is blocked        | Why                          | What Brian needs to decide |
| --- | ---------------------- | ---------------------------- | -------------------------- |
| 1   | `<issue or behaviour>` | `<the stop rule that fired>` | `<the specific question>`  |

Never convert one of these into an assumption to keep the run moving.

## Repository state

- Branches created, and whether each still exists: `<...>`
- Worktrees created, and whether each was cleaned up: `<...>`
- Draft pull requests open: `<...>`
- Linear issue statuses now: `<...>`
- Database lock: `<released / still held, and by whom>`
- Anything left in a partial state, and exactly where: `<...>`
- Durable evidence links: `<Linear comment URLs for the wave record, test
matrices, and this report>`

## Recommended next action

`<One concrete next step for Brian — usually: review and merge PR #n, then
re-read the graph before a second wave. A second wave does not start without his
approval.>`
