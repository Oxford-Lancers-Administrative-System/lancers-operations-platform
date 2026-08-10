# Run report template

The lead produces this at the end of **every** batch — including a batch that
was abandoned, blocked, or interrupted. It is the durable evidence that the run
happened and what state it left behind.

A worker's summary is not evidence. Every claim below must have been checked by
the lead against the repository itself: the actual diff, the actual commits, the
actual command output, the actual review result.

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
- `<e.g. automated delivery approach unresolved — LAN-78 automated channels out of scope>`

## Per issue

### `LAN-nn` — `<title>`

- **Branch / pull request:** `<branch>` · `<draft PR URL>` · still draft: yes/no
- **Test matrix:** `<link or inline>` — material behaviours: `<n>`, critical: `<n>`
- **Tests added:** `<files, and what each proves>`
- **Commands run, and observed result:**

  ```
  <the actual tail of npm run verify, and any database commands>
  ```

- **CI:** `<passing / failing / queued>` — `<check names and conclusion from gh pr checks>`
- **Independent review verdict:** blocked / clear
  - Blockers: `<verbatim, or "none">`
  - Suggestions: `<or "none">`
- **Critical behaviours challenged** (reviewer injected a plausible defect and
  confirmed a test failed):

  | Behaviour challenged | Defect injected                 | Test that caught it | Caught?      |
  | -------------------- | ------------------------------- | ------------------- | ------------ |
  | `<rule>`             | `<what was relaxed or removed>` | `<test name>`       | yes / **no** |

  A **no** is a finding, not a footnote: the rule is unprotected.

- **Corrections made:** `<what came back, what changed, and the re-verification>`
- **Untested areas and residual risk:** `<from the matrix's deliberately-untested
section, plus anything discovered during the run>`

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
- Anything left in a partial state, and exactly where: `<...>`

## Recommended next action

`<One concrete next step for Brian — usually: review and merge PR #n, then
re-read the graph before a second wave. A second wave does not start without his
approval.>`
