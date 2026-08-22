---
name: mission-intake
description: Prepare exactly one Release One mission packet through a durable ledger, workflow-by-workflow specification and mockup review, mechanical packet assembly, and a packet-only pull request. Never executes the mission.
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
`workflows/`, `acceptance/`, `mockups/`, and `evidence/`, seed the mockup hub, fill
the real mission id and baseline SHA into `state.json`, and set the next action to
Stage 0. Immediately run `npm run intake -- status <mission-id>`, print the banner,
and obtain Brian's confirmation before any substantive research or drafting. This
bootstrap is the only exception to status being the first mutation because status
cannot exist until its state file does.

The ledger is memory; conversation is only the interface. Read files, not a prior
session summary. A state transition and the ledger evidence that justifies it are
one atomic commit. Quote Brian's approval words in the commit message. Keep
`PR.md` current. Commits remain local until Stage 5; push only when Brian says
`push` or when opening the packet PR.

## Authority and operating boundary

Approval is Brian's merge of the packet-only PR. No status field, chat approval,
Notion property, or agent conclusion substitutes for that merge. Authority order:

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

## Stage 2 — frozen workflow inventory

Write `02-workflows.md`. A workflow is one primary actor's end-to-end journey from
trigger and entry point to one user-visible result. An actorless or resultless item
is a stage or cross-cutting invariant, not a workflow. Brian explicitly approves
the numbered list; then freeze its IDs, order, names, and count into `state.json`.
Record Brian's words/date in `state.json.approvals.inventory` in that same commit.
No agent re-derives, splits, merges, adds, removes, or renumbers it. A discovered
gap becomes a proposed inventory amendment and requires a Brian-approved atomic
change to both files.

## Stage 3 — workflow loop and design pass

For every frozen Wn, create `workflows/Wn-<slug>.md` from the template. Capture
actor, trigger, entry, route/placement, actions, transitions, handoffs, exceptions,
visible result, controlling source, acceptance evidence, and core decisions.
Classify every decision exactly:

- `locked`: already controlled by authority; cite it.
- `proposed for owner approval`: consequential and unsettled; recommend a coherent default.
- `delegated to Mission Lead`: an implementation choice that cannot change approved product intent.

For user-facing work, build `mockups/Wn-<slug>.html` from
`assets/mockup-exemplar.html` and `docs/ux/mockup-standards.md`, plus a self-contained
`mockups/index.html`. Ground proposals in current real screens using Playwright
screenshots. If the app cannot run, use code-only grounding, set
`grounding: code-only` in acceptance, and report screenshot restoration as open;
never claim screenshots ran. Auto-open every new or revised mock in Brian's browser.

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
`packet_version` in a new packet-only PR.

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

## Stage 5 — packet-only PR and receipt

Ensure the PR diff contains only `missions/packets/<mission-id>/**`; skill or
validator changes use their own normal PR. On Brian's word, push once and open a
draft packet-only PR from `PR.md`. Wait for every required check to pass on the
exact final head SHA. Never merge or un-draft. Hand Brian one action: merge.

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
