# Simplification — the brief

Status: **running as LAN-300** (Brian, 10 September 2026): one issue, one
branch, one draft PR, one visual review at the end — not a mission, not
sub-issues. This document is the audit and the rules; LAN-300 supersedes its
packaging (§ 5) and its numbers, which are restated below from the ticket.

## 1. Why

Six missions of agent-written code in four weeks have produced an
application that works and is hard to move. Brian's words: "a lot of slop
got in there." The measurements below say what that is, concretely, so the
work can be scoped against them and its result measured against them.

## 2. What the code looks like, with targets

Measured on `main` at `768cf3b` (the original brief) and at `a0c9130`
(LAN-300's base). The final column is LAN-300's target; the pull request
restates every row with its final value.

| Measure                                                         | Brief (`768cf3b`) | Now (`a0c9130`) | Target                                      |
| --------------------------------------------------------------- | ----------------- | --------------- | ------------------------------------------- |
| Non-test source lines                                           | 106,033           | 130,061         | lower; report it                            |
| Comment lines / ratio (excluding generated `database.types.ts`) | 30,636 (29%)      | 37,306 (28.7%)  | **< 10%**                                   |
| Files importing MUI `Alert` / rendering `Chip` directly         | 64 / 39           | 2 / 6           | 0 / 0 or a reason each                      |
| Local `Fact` / `Section` / `Metric` outside `src/components`    | 8 / 6 / 2         | 0 / 0 / 0       | 0 (hold)                                    |
| `page.tsx` files over 300 lines                                 | —                 | 5               | **0**                                       |
| `src/app` files over 600 lines                                  | 14                | 14              | **0**                                       |
| `src/lib` files over 800 lines (excluding generated and auth)   | —                 | 23              | **0**, delivery/messaging per the carve-out |
| Public names in `src/lib/services`                              | —                 | —               | unchanged; barrel re-exports                |
| Local branches merged into `main`                               | ~160              | 189             | deleted                                     |
| Dead exports (`knip`)                                           | —                 | not measured    | 0                                           |
| `docs/architecture/components.md`                               | —                 | missing         | exists                                      |

The component kit the original brief wanted first (P1) already exists —
LAN-225 built it and LAN-231–235 adopted it — so the `Alert`, `Chip` and
local-definition rows are holds, not work.

Three patterns account for most of the weight.

**Pages are monoliths.** Each route is one file that reads its data, defines
its own presentational components at the bottom, and lays them out at the
top. Nothing is imported from a neighbour, so the same `Fact` (label, value,
note) is written eight times with eight slightly different `sx` blocks, and
a change to how the club shows a labelled fact is eight edits. This is also
why "moving the UI" is hard: a panel cannot be lifted out of one page and
used on another without copying it.

**Comments are essays.** A third of the source is prose: file headers of
forty to eighty lines explaining the decision history, per-function
paragraphs restating the requirement id and the mockup that justified it.
Some of that is valuable and belongs in an ADR or the intake record where
it can be found; in the source it is a wall between a reader and the code.
Example: `src/lib/delivery/config.ts` is 538 lines, of which roughly 300 are
comment. `local-sink.ts` 454, roughly 120.

**Services are wide.** Four files near two thousand lines each combine
reads, writes, validation, rendering of operator-facing sentences, and audit
in one module. Each is internally consistent and well tested; each is also a
file an agent has to load whole to change one thing, which is where the
"three agents, two implementers" cap bites.

## 3. Goals, in priority order

1. **A shared component kit** so the same thing is written once, and pages
   can be rearranged by moving imports rather than code.
2. **Pages under 300 lines**, each a data read plus a layout of imported
   parts.
3. **Comment ratio under 10%**, with nothing lost: rationale moves to where
   it is findable.
4. **Services split by responsibility**, no file over 800 lines, no
   behaviour change.
5. **Housekeeping**: worktrees, branches, the unmerged `chore/lan-164-simplify`,
   dead exports.

Not goals: any behaviour, UX, route, schema, permission, security or ADR
change. The bug list from tester week is worked _inside_ these packages
where it touches the same file, and as separate `fix/` issues where it does
not.

## 4. Rules

- **Behaviour-preserving, proved by the existing tests.** Tests are not
  weakened or deleted to make a refactor pass. Where a refactor exposes a
  test that was asserting an implementation detail rather than behaviour,
  the test is rewritten in the same package with the reason in the PR.
- **Visual equivalence, approved.** Every package that touches a page gets
  the review environment and Brian's desktop + 375px approval against the
  current build, per `docs/ux/standards.md`. The bar is "identical or
  better, and where better, say so".
- **One package, one PR, one measurement.** Each PR states the measures in
  § 2 it moved, before and after.
- **`npm run verify` observed green** at every head; `templates:check` and
  `types:check` unchanged.
- **Comment relocation is a move, not a deletion.** A header paragraph that
  explains a decision becomes a line in the relevant ADR or a new
  `docs/decisions/` note, and the source keeps a one-line pointer. A
  paragraph that restates what the code plainly does is deleted.
- **Protected paths stay protected.** `.claude/`, `AGENTS.md`, workflows,
  `supabase/migrations/`, auth and trust boundaries are out of scope, as
  LAN-118 had them.

## 5. The packages

Superseded by LAN-300's four packages (housekeeping, pages, services,
comments), committed in that order on one branch. Kept here as the original
shape and the reasoning behind each cut.

### P1 — The component kit (`src/components/`)

Extract the primitives the pages already repeat, with the union of their
current props and one visual style each:

`Fact`, `Section` (title, optional action, children), `Metric`, `StatusChip`
(a single status→colour map, replacing 39 local ones), `Notice` (the
`Alert` wrapper with the four shapes the app actually uses: info, refusal,
warning, success — 64 sites), `PageHeader` (title, breadcrumb, actions),
`EmptyState` (what would be here, and how to make it so), `Field` and
`LabeledField` for forms.

Replace every local definition with the import. Nothing else changes.
Measure: local definitions of those names → 0; files importing `Alert`
directly → 0.

_Sonnet. One implementer. Visual approval on a sample of six pages._

### P2 — Page decomposition

For the fourteen files over 600 lines: `page.tsx` keeps the data reads and
the top-level layout; each local component moves to a sibling file (the
repository already does this in places — `share-panel.tsx`,
`renotify-panel.tsx`, `change-panels.tsx` beside the event page). Where a
panel is used by two routes it moves to `src/components/`. `presentation.ts`
files that only format one page's strings are folded into that page's
sibling files; those shared across routes stay.

Measure: no `src/app` file over 300 lines.

_Sonnet. Two implementers, disjoint route trees. Visual approval on every
touched page._

### P3 — Comment relocation

A mechanical pass over `src/lib` and `src/app`: file headers capped at ten
lines with a pointer; per-function prose reduced to what a reader needs to
call it; decision history moved to `docs/adr/` (append to the ADR that
made the decision) or to the mission intake record under `missions/intake/` that made the decision. The delivery and
messaging modules first, since they are the ones the Meta work will touch
next.

Measure: comment lines / source lines < 10%; every removed decision
paragraph traceable to its new home in the PR description.

_Haiku-class is plausible for the mechanical half with a Sonnet review;
the "where does this paragraph go" judgement is Sonnet._

### P4 — Service splits

`operator-administration.ts`, `delivery.ts`, `operator-invitations.ts`,
`messaging-scheduler.ts`, then the next seven over 1,000 lines. Split by the
seams already visible in each file's section comments: reads / writes /
sentences / audit. Public function names unchanged; barrel re-exports so no
caller moves in this package.

Measure: no `src/lib/services` file over 800 lines; zero import changes
outside `src/lib`.

_Sonnet. One implementer. No visual review._

### P5 — Housekeeping

`git worktree prune`; delete branches whose issues are Done; rebase and
merge `chore/lan-164-simplify` or close it; run a dead-export finder
(`knip` or `ts-prune`) and delete what it proves unreachable; decide
`feat/lan-195-nav-drawer` (an unmerged navigation shell — either the shell
P2 wants, or a branch to close).

_Deterministic script first; Haiku for the residue._

## 6. What the work returns rather than decides

Anything that looks like a product or UX change surfaced while simplifying
— two pages that answer the same question differently, a status name used
two ways, a refusal message that contradicts another — is returned as a
finding with evidence, in the LAN-146 shape, not fixed in place.

## 7. Acceptance

- Every measure in § 2 restated with its new value in the pull request.
- `npm run verify` green at the merged head; CI green.
- Brian's visual approval recorded at the final head for every page the
  pages package touched, at desktop and 375px.
- No entry in the `qa` bug list regressed; each is either closed in a
  package or left open with a reason.
- A one-page `docs/architecture/components.md` naming the kit and the rule
  for adding to it: _a component is shared when the second page needs it,
  and it is defined once._
