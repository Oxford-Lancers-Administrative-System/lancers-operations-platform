---
name: mission-intake
description: Prepare one Release One mission packet through its durable ledger, workflow specification/mockup review, mechanical validation, and one intake-artifacts-only draft PR. Never executes a mission.
disable-model-invocation: true
argument-hint: <portfolio mission number>
---

# Intake one portfolio mission

Invocation: `/mission-intake $ARGUMENTS`

## Intent

Turn one commissioned subject—not merely the portfolio examples—into its first
complete, owner-approved product definition and source-traceable packet. Never
execute, decompose implementation packages, or write application code. Done
means the ledger and packet land in one owner-merged intake-only PR and the
Project Manager receipt identifies the next action.

Require one positive integer. Map it to one approved mission id with the minimum
read and inspect worktrees.

## Resume or initialize

Existing intake enters its `intake/<mission-id>` worktree and first runs
`npm run intake -- status <mission-id>`. Print the banner and let Brian correct
it. Invalid/missing/inconsistent state is `mission intake system not ready`;
never infer position from chat. Show uncommitted scratch and ask whether to keep
or discard it.

First intake creates one worktree/branch from current `main`, copies the
templates, creates workflow/acceptance/mockup/evidence directories, fills the
mission id and base SHA, preserves `ledger_version`, and records Stage 0 in one
bootstrap commit. Then run status and obtain Brian's confirmation.

The ledger is memory. Each transition and its evidence are one atomic commit
containing Brian's exact approval words. Keep `PR.md` current; push only when
Brian requests it or Stage 5 opens the PR.

Read `references/ported-intake-rules.md` completely at startup. It is the
detailed commissioning, split, readiness, drift, PR, owner-action, closeout, and
receipt contract. Read project/Mission Control, current status, authority
manifest, portfolio row, controlling briefs, relevant Linear/GitHub reality,
`AGENTS.md`, `docs/mission-harness.md`, packet schema, and the approved
operator-admin exemplar. Pin source versions in `sources.md`.

Authority order is commissioned outcome/Brian decisions, Notion product records,
Linear delivery state, GitHub/repository reality, then provenance-only
transcripts/evidence. Supporting material never becomes authority by discovery.
Decide only reversible implementation detail that changes no intent, scope,
risk, or visible meaning. Ask Brian for product/workflow/ownership/authority,
destructive, privacy, security, production, or recorded-decision changes.

Mission splitting is rare and requires independently approvable/executable/
acceptable outcomes plus Brian's explicit one-line decision.

## Stage 0 — boundary

Create `00-boundary.md` around the commissioned outcome: owned operation, pages,
administration, states/failures, external tools, and adjacent-mission seams. Add
only scope grounded in club operation, Release One, implemented behavior, or a
concrete seam. Present the whole boundary, including additions, for one approval.
Record Brian's words in the file and `state.json.approvals.boundary`; advance
atomically to `overview`.

## Stage 1 — overview

Create `01-overview.md`: purpose/why now, in/out, privacy/capability boundary,
state vocabulary, audit posture, and shared invariants. Brian corrects the file,
then explicit approval advances atomically to `inventory`.

## Stage 2 — decisions and frozen workflows

Draft the workflow inventory and `state.json.subject_coverage` together; show
both before Brian approves either. Each area records why it belongs and one
disposition—workflow (`new|retained|modified`), invariant, shared, another
mission, provisional handoff, approved exclusion, or unresolved. A provisional
handoff blocks unless this mission defines its side and remains independently
walkable and acceptable.
Brian's boundary and inventory approvals judge completeness; the validator only
checks dispositions. After approval advances to `workflows`, generate
`subject-coverage.md` with `npm run intake -- subject --write`.

Use the map to sweep users, administration, states/failures, shared machinery,
external tools, inputs, and mission gaps. Retained behavior stays in scope.

Inventory every controlling source's decisions, exclusions, handoffs,
delegations, and shared dependencies before defining workflows. In
`state.json.decision_coverage`, each source has durable id/ref/version/decision
ids and every qualified decision has exactly one reasoned disposition:

- `workflow`: one owning `Wn`;
- `excluded`: source exclusion evidence;
- `delegated_to_mission_lead`: evidence that mechanism is unspecified;
- `other_mission`: mission id plus seam evidence;
- `shared_cross_mission`: all owners plus evidence; or
- `superseded`: replacement plus Brian's dated approval.

`also_referenced_by` never creates another owner. Qualify duplicate bare ids by
source. Use the transport-change seam question only as a diagnostic.
`npm run intake -- coverage --write` generates the coverage file; never
hand-maintain it. The validator owns completeness/conflict refusals.

Create `02-workflows.md`. One workflow is one actor's end-to-end journey from
trigger to visible result. Brian approves the numbered IDs/order/names/count;
freeze them and the approval atomically. Amendments require another explicit
approval. Record `mockup_hub` as generated or reasoned not-applicable.

## Stage 3 — workflow loop

For each frozen Wn, create its template-backed specification covering outcome,
actor, trigger/entry, route, actions/transitions, handoffs/exceptions,
dependencies/boundaries, authority, acceptance, and decisions classified
`locked|proposed for owner approval|delegated to Mission Lead`.

Before showing the file, explain in Brian's terms: outcome, actor, trigger,
normal journey, key actions/states, handoffs, failures, dependencies/boundaries,
and each real owner decision with a recommendation. Then show it and request
approval.

For user-facing work, render current `main` locally with synthetic data and
inspect equivalent interactions, states, errors, navigation, and permissions.
Reuse its routes, components, language, and patterns unless approved intent or a
concrete defect justifies a departure. Default to current-versus-proposed proof
at desktop and 375px.

Build template-backed HTML mockups under `docs/ux/mockup-standards.md`. Both
sides of a screen come from the same producer. A surface that exists on `main`
is photographed on both sides:

```bash
npm run intake -- shoot --screen <Wn-nn> --route <path> [--proposal <file.js>]
```

A new surface uses the nearest implemented route/shell; with no analogue, draw
both sides and label the current side `New surface, nothing to compare`. Never
pair a photograph with a drawing on one screen. If the application cannot run,
draw every screen and mark acceptance `grounding: code-only`.
Generate—never hand-edit—the mockup hub after state/artifact/feedback changes
and show revised mocks in the browser.

Track feedback by screen id. Spec approval, mock approval, and acceptance each
advance atomically with Brian's words. Wn completes before Wn+1 approval, though
later drafts may pipeline. Mark invalidated drafts stale immediately; never show
or approve stale/out-of-inventory work.

## Generated edits and packet

All intake scripted replacements use:

```bash
npm run intake -- edit --file <path> --find <text> --replace <text> --expect <n>
```

The helper proves match count/locations, reloads formatted bytes, validates, and
rolls back invalid output. Regenerate `mockups/index.html`,
`decision-coverage.md`, and `subject-coverage.md`; never hand-edit them.

Assemble `missions/packets/<mission-id>/` mechanically from approved ledger
facts. The workflow matrix exactly matches the frozen inventory. Use the packet
checklist; populate required sections or explicit reasoned `not_applicable`.
Open gates mean `status: not_ready`.

Run Prettier, refresh hashes, then:

```bash
npm run mission -- validate --packet <file> --inventory missions/intake/<mission-id>/02-workflows.md
```

Never omit the separately approved inventory comparison. Approved packets on
`main` are immutable; material revision increments `packet_version` through a
new intake-only PR.

## Owner actions, corrections, and Stage 5

Create owner-action Linear issues only at closeout when the referenced
five-condition test passes; deduplicate first. Questions and visual judgments
remain normal intake. Collect append-only consequences for briefs,
requirements, portfolio entries, and other missions in
`state.json.amendment_plan`. Show Brian the full batch before editing anything;
apply only the approved batch, then refetch each target and record proof.

The final PR contains exactly this mission's `missions/intake/**` and
`missions/packets/**` artifacts. Prove paths and state with:

```bash
npm run intake -- pr-paths <mission-id> --diff main
npm run intake -- check <mission-id>
```

On Brian's word, push once, open the draft PR from `PR.md`, and wait for every
required check at the final SHA. Never merge and never lift a draft; Brian's merge is
packet
approval.

After merge, return the Project Manager receipt: coverage, dependencies,
superseded boundary, unassigned Release One coverage, packet path/version/PR/SHA,
validation, owner actions, and existing portfolio/Mission Control updates. Run a
short retro; accepted process changes use a separate skill PR. End every run with
verdict, mission, packet, boundary/split, questions, validation, next action,
receipt, and ledger state. Evidence drop-ins are provenance only.
