---
name: mission-intake
description: Prepare exactly one Release One mission packet through a durable ledger, workflow-by-workflow specification and mockup review, mechanical packet assembly, and an intake-artifacts-only pull request. Never executes the mission.
disable-model-invocation: true
argument-hint: <portfolio mission number>
---

# Intake one portfolio mission

Invocation: `/mission-intake $ARGUMENTS`

Require `$ARGUMENTS`, after trimming, to match exactly `^[1-9][0-9]*$`. Refuse a
missing value, mission id, range, list, words, or more than one portfolio mission
number. This workflow prepares one packet; it never executes a mission, plans an
implementation DAG, creates work packages, or implements application code.

## Initialize once; resume before all other work

Validate the argument, then perform only the minimum read needed to map the
portfolio number to one approved mission id and inspect `git worktree list
--porcelain`.

**Existing intake:** enter its `intake/<mission-id>` worktree and immediately run
`npm run intake -- status <mission-id>` before any other research or mutation.
Print the resume banner verbatim and ask Brian to confirm or correct it. Missing,
invalid, or ledger-inconsistent state means **mission intake system not ready**;
never infer position from prose or chat. If the worktree has uncommitted changes,
show the diff as unapproved scratch and ask whether to keep and commit it or discard
it before continuing. Never decide silently.

**First intake only:** when no worktree or ledger exists, create the dedicated
worktree and `intake/<mission-id>` branch from current `main`. As one bootstrap
commit, copy the templates into `missions/intake/<mission-id>/`, create
`workflows/`, `acceptance/`, `mockups/`, and `evidence/`, fill the real mission id
and baseline SHA into `state.json`, keep its `ledger_version`, and set the next
action to Stage 0. Immediately run `npm run intake -- status <mission-id>`, print
the banner, and obtain Brian's confirmation before any substantive research or
drafting. This bootstrap is the only exception to status being the first mutation
because status cannot exist until its state file does.

The ledger is memory; conversation is only the interface. Read files, not a prior
session summary. A state transition and the ledger evidence that justifies it are
one atomic commit. Quote Brian's approval words in the commit message. Keep
`PR.md` current. Commits remain local until Stage 5; push only when Brian says
`push` or when opening the packet PR.

## Authority and operating boundary

Approval is Brian's merge of the intake-artifacts-only PR. No status field, chat
approval, Notion property, or agent conclusion substitutes for that merge.
Authority order:

1. commissioned outcome and Brian's recorded decisions;
2. Notion product records and controlling briefs;
3. Linear delivery state;
4. GitHub and current repository reality;
5. transcripts and dropped evidence as provenance only.

Supporting evidence never becomes authority by discovery. Use durable references:
Notion URLs, PR links, and repository paths pinned to SHAs. Never cite chat-file
identifiers or unapproved external sites. Research safely resolvable facts before
asking Brian; explain consequences, recommend a supported default, ask in the
smallest sufficient batch, and never reopen a decision committed to the ledger.
Bias strongly toward clarification and contraction, not expansion.

Read the project home/Mission Control, Current Project Status, Release 1 Authority
Manifest, commissioned portfolio row, controlling briefs, relevant Linear state,
current GitHub reality, `AGENTS.md`, `docs/mission-harness.md`, the canonical packet
schema, and the approved `M-OPERATOR-ADMIN-WITHOUT-SQL` packet. Record versions in
`sources.md`. If the schema or canonical directories are missing, stop with
**mission intake system not ready** rather than inventing replacements.

Read `references/ported-intake-rules.md` in full during startup. Its commissioning,
splitting, determination, decision, readiness, drift, PR, owner-action, closeout,
receipt, and final-report rules are binding and preserve the owner-approved kickoff
contract. This file changes only the ledger and mockup execution surface.

Mission splitting is rare. Split only when outcomes can be independently approved,
executed, and accepted without inventing shared scope. Any added, moved, fused, or
split portfolio coverage requires Brian's explicit one-line decision before work
continues.

### When to decide, and when to ask Brian

- **Decide, and record the assumption in the ledger**, for a reversible
  implementation detail that follows already-approved intent and changes no
  authority, no scope, no risk and no user-visible meaning.
- **Ask Brian** when the answer changes product intent, a workflow, mission
  ownership, authority, destructive behaviour, privacy, security or production
  risk, or anything already recorded as an owner decision.
- Never let informal wording in conversation silently supersede a recorded
  decision. A recorded decision changes only through an explicit, approved
  amendment or supersession, written into the ledger with Brian's exact words.

## Stage 0 — boundary

Write `00-boundary.md` from its template. Confirm the commissioned boundary against
the portfolio row. Record any amendment and Brian's exact approval in both the file
and `state.json.approvals.boundary`. Advance `state.json` to `overview` in the same
approval commit.

## Stage 1 — overview

Write `01-overview.md`: purpose, why now, in/out, privacy and capability boundary,
state vocabulary, audit posture, and other cross-cutting invariants. Brian corrects
the file, not chat memory. On explicit approval, commit it with `state.json`
recording `approvals.overview` and advancing to `inventory`.

## Stage 2 — controlling decisions, then the frozen workflow inventory

### 2a — inventory the controlling decisions first

Before the workflow inventory is frozen, inventory every controlling decision in
every controlling source, and read that source's own exclusions, handoffs,
delegations and shared dependencies. Appearance in a brief is not evidence that
this mission owns the behaviour, and a decision that no workflow mentions is the
one most likely to be lost — `D42`, `D66`, `D67` and `D68` survived the first
intake's surface-and-action sweep and were only found when Brian reopened `W4`.

Record the result in `state.json.decision_coverage` as the canonical truth:
`sources[]` naming each source's id, durable `ref`, pinned `version` and the
`decision_ids` it declares, and `decisions[]` giving every one of those ids exactly
one disposition:

| Disposition                 | Also required                                                              |
| --------------------------- | -------------------------------------------------------------------------- |
| `workflow`                  | one owning `workflow: "Wn"` in the frozen inventory                        |
| `excluded`                  | `evidence` citing the source's own exclusion                               |
| `delegated_to_mission_lead` | `evidence` that the source leaves the mechanism unspecified                |
| `other_mission`             | `other_mission: "M-<slug>"` and `evidence` for the seam                    |
| `shared_cross_mission`      | `shared_owners` naming this and at least one other mission, and `evidence` |
| `superseded`                | `superseded_by`, and `approval` with Brian's exact words and date          |

Every disposition carries a `reason`. A `workflow` disposition names exactly one
owning `Wn`; other workflows may cite the decision in `also_referenced_by` without
becoming additional owners. Where two sources each declare the same bare id, every
mapping and every cross-reference is qualified as `<source-id>:<decision-id>`.

Ask, of each decision, the boundary seam question:

> Would the product decision remain the same if the transport, provider or
> implementation mechanism changed tomorrow?

It is a diagnostic aid for spotting a decision that belongs to another mission's
seam. It never replaces reading the source's own handoffs and exclusions.

`npm run intake -- coverage --write` renders `decision-coverage.md` from that
state. Never maintain a second, hand-written truth: `npm run intake -- status`
fails when the generated file and the ledger disagree. The validator refuses an
unmapped decision, duplicate authoritative homes, an unknown workflow, a
source-less ambiguous decision id, an unsupported exclusion, delegation,
other-mission or shared classification, a supersession without approval evidence,
and a superseded decision still treated as current authority — so the intake
cannot reach the workflow stage while coverage is missing or conflicting.

### 2b — freeze the inventory

Write `02-workflows.md`. A workflow is one primary actor's end-to-end journey from
trigger and entry point to one user-visible result. An actorless or resultless item
is a stage or cross-cutting invariant, not a workflow. Brian explicitly approves
the numbered list; then freeze its IDs, order, names, and count into `state.json`.
Record Brian's words/date in `state.json.approvals.inventory` in that same commit.
No agent re-derives, splits, merges, adds, removes, or renumbers it. A discovered
gap becomes a proposed inventory amendment and requires a Brian-approved atomic
change to both files.

Advancing to `workflows` also requires `mockup_hub`: `"generated"` for a mission
that draws surfaces, or `{"not_applicable": "<reason>"}` for one that genuinely
draws none. Silence is never the not-applicable answer.

## Stage 3 — workflow loop and design pass

For every frozen Wn, create `workflows/Wn-<slug>.md` from the template. Capture
purpose and intended outcome, actor, trigger, entry, route/placement, actions,
transitions, handoffs, exceptions, visible result, dependencies and mission
boundaries, controlling source, acceptance evidence, and core decisions. Classify
every decision exactly:

- `locked`: already controlled by authority; cite it.
- `proposed for owner approval`: consequential and unsettled; recommend a coherent default.
- `delegated to Mission Lead`: an implementation choice that cannot change approved product intent.

### Walk Brian through it before showing him the file

Never ask for specification approval by presenting the file first. Before Brian is
shown `workflows/Wn-<slug>.md` or asked to approve it, explain the workflow to him
conversationally, in his own terms, covering:

1. purpose and intended outcome;
2. the actor;
3. the trigger and entry conditions;
4. the normal sequence, end to end;
5. the important actions and state transitions;
6. the handoffs into and out of this workflow;
7. the meaningful exceptions and failure states;
8. the dependencies and mission boundaries; and
9. the genuine owner decisions, each with a recommendation.

Keep it short enough to hold in one reading. Then show the file, then ask for
approval. Approval given before that walkthrough has not been informed, and the
walkthrough is what turns a specification review into a product decision.

For user-facing work, build `mockups/Wn-<slug>.html` from
`assets/mockup-exemplar.html` and `docs/ux/mockup-standards.md`, whose
current-versus-proposed banding, dispositions, named deltas, new-surface wording,
commentary placement, 375px condensation and surface-reuse rules are binding.
Ground proposals in current real screens using Playwright screenshots. If the app
cannot run, use code-only grounding, set `grounding: code-only` in acceptance, and
report screenshot restoration as open; never claim screenshots ran.

`mockups/index.html` is generated, not written: run `npm run intake -- hub --write`
after any change to state, artifacts, amendments or feedback, and commit the result
with that change. `npm run intake -- status` fails when the committed hub differs
from what the ledger generates. Auto-open every new or revised mock in Brian's
browser.

Feedback uses screen IDs. Track open items in `state.json`. Each approval advances
separately and atomically:

1. Spec approval commits the approved workflow file plus Brian's words/date in
   `state.json`, advancing to `spec_approved`.
2. Mock approval commits the approved mock plus Brian's words/date in `state.json`,
   advancing to `mock_approved`.
3. Completion writes `acceptance/Wn.md`, clears feedback, and advances to `done` in
   one commit.

Approval order is serial: Wn must be done before Wn+1 receives either approval.
Draft specs and mocks may pipeline ahead in `spec_draft` or `mock_draft`. If an
earlier decision invalidates any downstream draft, mark it `stale: true` in the
same commit; regenerate and clear staleness before presenting it. Never present or
approve a stale draft or touch a workflow outside the frozen inventory.

## The durable mission record

The packet names the existing Notion mission record among its sources. That
record is where the mission's closeout is written when it ends — outcome,
shipped issues, pull requests and exact merged SHAs, acceptance and injection
evidence, unresolved findings and their dispositions, owner and external
actions, elapsed time and cost, and the next action. Intake's job is to pin it,
so the Lead does not have to guess where Brian looks. Closeout extends that
record; it never creates a Linear planning document or an automatic
deferred-findings issue.
## Scripted edits and generated artifacts

A scripted replacement that matched nothing, and continued as though it had
applied, corrupted work during the first intake. Every intake-owned scripted edit
and every generated artifact therefore goes through
`npm run intake -- edit --file <path> --find <text> --replace <text> --expect <n>`,
or the helpers in `scripts/intake/lib/edit.mjs`, which:

- assert the expected match count and fail on an unexpected zero or multiple match;
- report the identity — line and column — of every target changed;
- reload the artifact from disk after formatting it; and
- run the relevant intake, hub, coverage or packet validation against the reloaded
  bytes, rolling the edit back if the reloaded ledger no longer validates.

Never hand-edit `mockups/index.html` or `decision-coverage.md`; regenerate them.

## Stage 4 — mechanical packet assembly

Assemble `missions/packets/<mission-id>/` from ledger facts, not recollection:
`packet.json`, `README.md`, `sources.md`, approved mockups, and acceptance records.
Every requirement, decision, claim, count, and workflow row cites an approved ledger
file. The workflow matrix must match `02-workflows.md` exactly by ID and count.

Use `templates/packet-section-checklist.md`. Every packet contains
`workflow_matrix`, `delegated_to_mission_lead`, `nonblocking_unknowns`,
`escalation_rules`, `repository_drift`, and `blockers`, either populated or an
explicit `not_applicable` object with a reason. Unfinished or owner-gated work is
`status: "not_ready"`; never mark ready around an open owner gate. Run Prettier
before refreshing hashes, then run
`npm run mission -- validate --packet <file> --inventory missions/intake/<mission-id>/02-workflows.md`
and the exact required PR checks. The `--inventory` comparison is mandatory for an
intake-produced packet; never validate it without the separately approved ledger
file.

Approved packets on `main` are immutable. Material change means a higher
`packet_version` in a new intake-artifacts-only PR.

## Owner actions and authoritative corrections

Create Linear owner-action issues only at closeout and only under the exact
five-condition test in `references/ported-intake-rules.md`. When uncertain, keep it
in normal intake. Deduplicate against the Owner Actions view. Include mission id,
affected requirement/gate, exact owner outcome, prerequisite, completion evidence,
and follow-up agent verification. Questions and visual judgments never become
owner-action issues.

Maintain `notion-corrections.md` with page, exact old text, exact proposed new text,
and status. Never edit Notion unprompted. For each correction: propose; obtain
Brian's explicit approval of that exact edit; apply it; re-fetch to verify; record
the result and timestamp. Packet approval is not blanket correction approval.
Unrelated reconciliation, reorganization, and reusable cross-mission rules are out
of scope.

## Stage 5 — the intake-artifacts-only PR and receipt

The final pull request carries this mission's completed ledger and its packet, and
nothing else: exactly `missions/intake/<mission-id>/**` and
`missions/packets/<mission-id>/**`. Both land in the one owner-approved merge,
because the ledger is the packet's provenance and a packet-only merge leaves it
dangling off `main`. Skill, validator and application changes use their own normal
PR. Prove the diff with `npm run intake -- pr-paths <mission-id> --diff main` and
`npm run intake -- check <mission-id>` before pushing.

On Brian's word, push once and open a draft intake-artifacts-only PR from `PR.md`.
Wait for every required check to pass on the exact final head SHA. Never merge or
un-draft. Hand Brian one action: merge.

After merge, emit the Project Manager receipt: primary and shared portfolio
coverage, dependencies, superseded boundary, remaining unassigned Release One
coverage, packet path/version/PR/SHA, validation results, owner-action status, and
the existing protocol updates required for the portfolio row and Mission Control.
Do not invent a tracking surface. Run a ten-minute retro; accepted process changes
become a separate small skill PR with a dated CHANGELOG entry.

End every run with: verdict, mission, packet, boundary, split decision,
questions/blockers, validation, next action, Project Manager receipt, and ledger
state (files committed this session and next unfinished stage). The ledger remains
the authority.

## Evidence drop-in

Index anything Brian places in `evidence/` in `sources.md` as provenance-only.
Never allow it to override the authority order.
