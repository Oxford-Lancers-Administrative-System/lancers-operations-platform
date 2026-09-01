# Running a mission

The owner's guide to Mission Harness v1: what Brian does, what the Mission
Lead does, and how to recover. The decision is
[`docs/adr/0027-mission-harness.md`](adr/0027-mission-harness.md); the
machine-readable merge rules are
[`.github/mission-merge-rules.json`](../.github/mission-merge-rules.json).
If this page and those files disagree, the checked-in rules and tests win.

## The one entry point

```
/run-mission M-<mission-id>
```

Brian may start concurrent Mission Leads, each for a different approved mission.
Exactly one fenced Lead controls a given mission at a time, and that fence
exists from the moment `mission init` records the packet — not from the first
heartbeat afterwards.
Everything else — planning, Linear issues, workers, reviews, corrections,
qualifying merges, checkpoints — is the Mission Lead's job.

To start a **new** mission, the approved packet must already be on `main` at
`missions/packets/M-<id>/packet.json`; the Lead runs
`npm run mission -- init M-<id> --packet missions/packets/M-<id>/packet.json`.
An invalid, `not_ready`, or unapproved packet is refused outright. To
**resume** after any interruption, the same `/run-mission M-<id>` invocation
is enough — the Lead replays durable state and continues; no chat history is
needed or used.

## Execution epochs

An epoch is an ordered group of one or two planned work packages. It is set
when the Lead records the decomposition, before Linear issues are created:

```json
{
  "execution_epochs": [
    { "id": "E-1", "package_ids": ["WP-a", "WP-b"] },
    { "id": "E-2", "package_ids": ["WP-c"] }
  ]
}
```

Every live package appears exactly once. A dependency must be in the same or an
earlier epoch. Packages in one epoch may run concurrently or sequentially;
the dependency DAG, collision domains, migration ownership and two-worker limit
still determine what is actually dispatchable.

The current epoch is the first planned group not completed at a checkpoint.
It stays current through implementation, review, correction, merge and
reclamation. Time, token use, review count and Lead replacement do not change
it. A replacement Lead resumes the same group from the journal with no epoch
token or handover protocol.

Once every package in the current group has merged and been reclaimed,
`next_actions` says `checkpoint-and-stop`. The Lead records that checkpoint and
ends the run before starting the next group. The next `/run-mission` invocation
then sees the next planned group. This is a soft run boundary: epochs describe
which issues the Lead should finish in this run; they do not add a second
permission lattice around ordinary mission events.

Planning, the integrated walker, cutover and closeout remain mission stages, not
epochs. Older plans without `execution_epochs` are projected deterministically
in topological plan order, two packages per group. Historical
`lead-epoch-*` journal events remain accepted and replay as inert records, so
existing journals need no rewrite.

`mission status`, `mission resume` and the checkpoint report all show the same
current group. There are no epoch-specific CLI commands.

## Review runtimes and the evidence they owe

Since LAN-179 the Mission Lead no longer owns a reviewer's environment. It asks
for a **capability profile**; a broker allocates, prepares, health-proves and
reclaims the runtime. The chain is one invariant:

> required capabilities → broker provision → fresh assigned actor executes →
> structured evidence → state gate → deterministic cleanup

### Who gets what

Implementation workers keep sharing the one mission stack, under the same
mutation-serialization rules. Every **review invocation** — including each
correction round — gets its own freshly prepared, exact-head runtime on a
coordinator slot whose purpose is `review`, never the implementation stack. The
integrated walker gets its own runtime at the current `main` head. A review
runtime cannot be attached to by an implementation worker, so a reviewer's reset
can never destroy what an implementer is working against.

For a visual package, `review provision` first relinquishes that package's
temporary implementation preflight environment. Only then does it allocate the
fresh reviewer runtime that can later be promoted for Brian's walkthrough.

Capacity is refused, never borrowed. When no slot is free the invocation records
`waiting-for-capacity` and keeps its identity and contract. The infrastructure
states — `ready`, `waiting-for-capacity`, `provisioning-failed`, `unhealthy`,
`abandoned`, `released` — share no vocabulary with `clear` and `blocked`, because
the failure this replaces was a missing runtime arriving at the journal wearing a
review verdict.

### The contract is generated, not written

`mission review request` reads the package's own diff from the repository —
`<base>...<head>`, so the package's changes and not everything that landed on the
base branch since — and classifies it through the checked-in `reviewContract`
rules in `.github/mission-merge-rules.json`. The capabilities and the job set
come from that plus durable state: the package's `requirement_ids` against the
packet, the sensitive-path intersection, the rendered classifier, the
public-token surfaces, the transport seam, and any changed seed or fixture
source. The state machine re-reads the diff itself when the request is appended,
overwrites whatever the request declared, re-derives the contract and refuses any
difference — so a Lead may add a diagnostic question and can never remove a
generated capability or job, nor narrow one by understating the diff.

A diff this checkout cannot read is not an empty diff. It is recorded as
`diff_source: "unknown"` and classified as every surface at once, so the review
is maximally equipped rather than minimally; deterministic clearance is
unreachable in that state.

Deterministic clearance survives only while the sensitive, rendered and evidence
union is empty; the classifier output is journaled either way. A seed or fixture
change is review-affecting even though no component changed.

The walker's contract carries **every** completion criterion in the packet, as
stable ordinal ids (`CE-001`…) with the text preserved verbatim, plus one job per
workflow-matrix id. A nonempty `jobs_completed` string is no longer accepted in
its place. A targeted re-walk may contain only the criteria the blocked smoke's
findings named in `affected_jobs`.

### What a clear receipt has to prove

Invocation, runtime, agent identity, contract hash and exact head must all match
what was dispatched, and there must be one job result for every contract job —
set equality, so an omission is refused rather than summarized away. Each result
records what was executed, the assertion outcome, an evidence reference, the
synthetic scenario ids, its evidence kind, and — for a rendered job — the width
each browser context actually measured (exactly 375, and at least 1280). A job
whose contract says `live` cannot be discharged by static reasoning, and a
passing job cannot be described as skipped, not performed, or blocked by a busy
port, lease or slot. A blocked receipt names findings, and every blocked job is
named by one.

The reviewer or walker identity may not be the Mission Lead's, may not be an
implementer of the work, and may not be an identity that already held an
invocation on this mission.

### Owner-ready environments

A promotion is accepted only from a machine-cleared invocation at the exact head,
and records the environment id, its URL, the fixed local review identity, the
desktop and 375px state manifest, and `owner_commands: 0`. Brian runs nothing.

### Reclamation

Every terminal path — clear, blocked, provisioning failure, abandonment, obsolete
head, mission stop — asks for a release, and the frontier says so without the
Lead remembering. `mission-finalized` refuses while any brokered runtime is still
held: nothing runs after that event, so a runtime held at that moment is held for
good. A release records the slot, that the lease went back, that the
application stopped, that the slot is reusable, that status no longer reports it
active, and that the checkout was clean with nothing unpushed. Cleanup refuses a
runtime whose invocation is still live and refuses to reclaim work that would be
destroyed.

### Commands

```
npm run mission -- review request M-<id> WP-<pkg> --head <sha> \
    [--round N] [--finding-ids R-001,R-002]
npm run mission -- review provision M-<id> --invocation <id> [--attempt N] [--outcome <file>]
npm run mission -- review dispatch M-<id> --invocation <id> --agent <id> --session <id>
npm run mission -- review status M-<id> [--invocation <id>]
npm run mission -- review abandon M-<id> --invocation <id> --reason <why>
npm run mission -- review receipt M-<id> WP-<pkg> --file <review.json> [--check]
npm run mission -- walker request M-<id> --head <sha> [--affected CE-003,CE-011]
npm run mission -- walker dispatch M-<id> --invocation <id> --agent <id> --session <id>
npm run mission -- walker receipt M-<id> --file <integrated-review.json> [--check]
npm run mission -- runtime status M-<id>
npm run mission -- runtime promote M-<id> --invocation <id> --environment <id> --url <url> \
    --identity <review account> --states <manifest file>
npm run mission -- runtime release M-<id> --runtime <id>
npm run mission -- runtime cleanup-stale M-<id>
```

The original `mission review M-<id> WP-<pkg> --receipt <file>` still files a
receipt; a subcommand name can never be a mission id, so both forms are exact.

### The honest limit

Two other boundaries are enforcement rather than proof. The refusal of
substitution language is a keyword vocabulary transcribed from Mission 4's
accepted receipts: it fails safe — a false positive forces a reviewer to reword an
honest narrative or record a block, never the reverse — but a paraphrase sharing
none of its keywords is not structurally ruled out. And the check that a runtime's
slot is not the implementation stack's is enforced against the live coordinator
registry by the broker before any event is written; the same comparison in the
journal validator is a coherence check on two self-reported fields, not a second
independent boundary.

The host exposes no way to prove that a reviewer is a genuinely fresh model
context, and a pid proves nothing — every agent in one session shares it. What
the harness enforces is the strongest boundary available: a distinct agent and
session identity per invocation, refused when it is the Lead's, an implementer's,
or an identity that already reviewed on this mission. That is a real fence
against the Mission 4 shape; it is not, and is never reported as, proof of a
fresh model.

## Finishing a mission

`/run-mission` stops short of closeout, for the reason `/start-issue` does:
while work is in flight a worktree is not debris, and an agent must never delete
a dirty or unmerged one. Reclamation is its own invocation —
`/finish-mission M-<id>`, or `npm run mission:finish -- M-<id>` — because the
case that matters most is the one where the Lead is gone and has nothing left to
run an exit step.

It reclaims **per package**: a package's worktree, branch and attachment to the
mission stack are released the moment its pull request merges, proved from the
repository and never from the pull-request body or the Linear state — the
`mission-merge` lane merges without a human, so nobody may infer that Brian did.

The proof is the **merge commit**, not the branch head. This repository squash-
merges, and a squash produces a new commit, so the head is never an ancestor of
`main` afterwards; proving by ancestry alone would report every merged package
as unmerged and reclaim nothing. `gh pr view` must report `MERGED` and its merge
commit must be on `origin/main` (fetched first, so a stale local view cannot
condemn finished work). A true merge commit leaves the head reachable, and that
is accepted as an independent proof. `--delete-branch` having removed the remote
branch is evidence the work landed, not unpushed work.

The mission-owned stack is shared by several workers, so **whoever detaches last
retires it**. A mission whose acquiring worktree is already gone can still be
tidied up, and no sibling mission's stack or the standing slot is ever touched.

A mission ends as `mission-finalized` — every live package merged and reclaimed,
no workers running, and the closeout evidence already written into the Notion
mission record — or as `mission-abandoned`, which records why it is unfinished
and what was deliberately preserved. A resumed Lead reads that distinction from
the journal; it is how it tells a finished mission from one that was walked away
from. Reclaiming resources and finishing a mission are different acts, and the
second requires the first.

It refuses while another Lead's fence is live, and there is no override.

## The mission packet

The packet is the pinned execution contract for one approved mission. The
Mission Intake Agent drafts it at `missions/packets/<mission-id>/packet.json`
and opens a **packet-only pull request** — **Brian's merge of that PR is the
approval**, binding the exact packet version and commit; no field in the
file substitutes for it, and `missions/**` is prohibited from every
automatic merge lane. A draft that cannot honestly be completed ships with
`status: "not_ready"` — valid to store, impossible to execute. Check any
draft with `npm run mission -- validate --packet <file>` (pure; writes no
state).

Since LAN-149 that pull request is **intake-artifacts-only** rather than
packet-only: it carries exactly `missions/intake/<mission-id>/**` and
`missions/packets/<mission-id>/**`, and nothing else. The completed ledger is
the packet's provenance, so the one owner-approved merge lands both together —
`M-EVENTS-CALENDAR-TARGET-STATE` needed a second pull request to put its ledger
on `main` after its packet was already there. Skill, validator and application
changes still travel their own normal pull requests. Check the diff with
`npm run intake -- pr-paths <mission-id> --diff main`.

The mechanical schema is `scripts/mission/lib/packet.mjs`; the synthetic
example is `tests/fixtures/mission/approved-packet.json`. A packet records:
`packet_version`, `mission_id`, `status` (`approved` | `not_ready`),
`objective`, `non_goals`, `sources` (each with a pinned `version`),
`requirements` (each tracing to a source), `decisions`, `baseline` (branch
and the exact `main` SHA it was drafted against — drift is computed from
it), `gates`, `merge_envelope` (which can never widen the autonomous classes
nor drop an owner-gated class), `completion_evidence`, and the `approval`
record. Notion remains authoritative for product intent; the packet pins
versions, it does not replace authority. Genuinely new scope requires a
revised packet — a new version in a new packet PR, never a mutation of the
approved one — and drift stops only the affected packages while the rest
continues.

## Brian's rhythm: the hourly checkpoint

Roughly once an hour, open the Mission Lead's session. It presents a
checkpoint generated from durable state:

- **Completed since last checkpoint** — merged and implemented packages.
- **Currently running** — active workers.
- **Need from Brian** — a short numbered queue: product choices, visual
  judgments, authority questions. Immediate blockers sort first. No routine
  technical questions belong here.
- **Rules learned** — answers proposed as reusable rules, and rules applied
  without asking.
- **Next hour** — what runs after the checkpoint.
- **Deploy drift** — how far `main` is ahead of production.
- **Resources** — active stacks, lease states, worktree count, and current
  1/5/15-minute system load. The Lead runs the guarded `db:cleanup-stale` and
  prunes repository-proven merged worktrees before reporting it; anything
  dirty, unpushed, active, or unmerged stays and is named.

For overnight missions, the Lead keeps the machine awake with
`caffeinate -dims` (or the platform equivalent). Machine sleep stalled a worker
during the 23 August run and is an operating condition, not a worker failure.

Answer the questions in the session; the Lead persists each answer
(`npm run mission -- answer …`) before dependent work resumes. When an
answer expresses a general convention, say so — the Lead records it as a
proposed rule, and it becomes reusable across missions only after this
explicit approval (`promote-rule`). A promoted rule means that class of
question is never asked again.

### Asynchronous owner actions are separate

Mission Intake may have created Linear issues labelled `owner-action` for
meaningful human work Brian must do outside the mission conversation. On every
start, resume and checkpoint, the Mission Lead reconciles matching issues that
reference the mission and connects each to its named requirement, acceptance
criterion, external gate or verification package. Linear is the durable source;
the mission does not create a second owner-action ledger.

These issues are not ordinary checkpoint questions. `Backlog` means an external
prerequisite has not cleared; `Todo` means Brian can act; `In Progress` means he
is acting; and `Done` means only that his human step is complete. Open actions
block only dependent work or verification, never unrelated packages. After an
action reaches `Done`, its linked agent verification becomes ready or visibly
pending; only successful verification with recorded evidence can satisfy the
criterion.

Each checkpoint reports owner actions separately as **Ready for Brian**,
**Waiting on prerequisites**, or **Brian acted; verification pending**, naming
the Linear issue, required outcome, linked criterion or gate, remaining human
and agent work, and next actor. Questions Brian can answer in the conversation
remain in **Need from Brian** and never enter the owner-action section.

**Visual review keeps ADR 0020's protected environment and follows ADR 0037.**
Targeted checks and exact-head CI precede one package gate. It reviews the union
of sensitive paths and, for visual work, every approved mockup state at desktop
and measured 375px. Mockups govern structure and copy; application conventions
govern styling. An empty union launches no reviewer. Only then does Brian open
the live `review-ready` environment with one URL, the fixed login and zero
commands. `visual-approve` records the exact package head he checked. At that
unchanged head no reviewer or worker runs afterwards; the deterministic merge
gate is next. A rendered head change repeats the affected evidence, while a
classifier-proven non-rendered delta carries the owner approval forward.

Each approved issue merges immediately. After all mission issues are on `main`,
one bounded Sonnet walker smoke-tests the predetermined end-to-end journeys and
visible hand-offs. That final smoke is not another visual review and does not
reopen merged issues. Its findings become new corrective issue/PR work; only the
affected journey repeats once after that correction merges. A second failure
stops automated correction and returns to Brian for adjudication.

## What merges by itself, and what never does

There are three tiers, decided by Brian on 2026-08-18:

**Merges by itself, by default.** Auto-merge is the default disposition
(Brian, 2026-09-01), and a refusal must be earned from evidence. Every pull
request is evaluated by the checked-in `mission-merge` workflow; the
`mission-merge` label no longer gates the lane and only asks for a refusal
comment.

There are two routes. On the **standard route** a pull request with no
receipt merges when it touches no prohibited surface, names a Linear issue,
and has every required check green at the exact head. On the **package
route** a pull request carrying the Mission Lead's receipt additionally
proves clear required security coverage, Brian's visual approval where the
work is rendered, a reviewed head equal to the current head, and a cited
owner decision for any checkpoint-approval surface.

The standard route exists because the receipt route could only ever serve
work packages — 30 of the first 122 merged pull requests. Corrections, seed
fixes, documentation and ordinary visual work were permanently owner-merged
however safe the diff was, and walk findings become corrective issues rather
than packages by design, so reviewing carefully guaranteed more hand merges.

The workflow re-derives everything server-verifiable from evidence
and fails closed; a refusal is posted on the pull request. A review-blocked
rendered correction clears the applicable visual evidence — Brian approved
what he saw, not whatever came later.

Merging is where a package's lifecycle ends. A worker or review receipt that
arrives after the merge is refused, and a journal that somehow contains one
still replays to `merged`: the receipt is kept as evidence, but a finished
package never walks backwards into review or re-dispatch.

**Merges by itself only after Brian heard about it** — the
checkpoint-approval surfaces (`src/lib/auth/**`, `src/lib/delivery/**`).
Workers may change them freely, but the diff-derived scan detects them and
the merge is refused unless an **answered owner question** naming the
package exists in mission state and the receipt cites it. In practice: the
Lead raises it in the "Need from Brian" queue — "this package changes the
recipient allowlist, OK?" — Brian answers at the checkpoint, the answer is
persisted, and the merge proceeds. The ask cannot be skipped, only
affirmatively falsified, which is a durable, auditable lie. The delivery
entry is expected to loosen once the recipient allowlist becomes database
records.

**Always Brian's, never autonomous:** schema and migrations; RLS and the
authentication routes; the public RSVP token surfaces (`src/lib/rsvp/**`);
mission packets (`missions/**` — the packet PR _is_ the approval); secrets
and credentials; deployment and production data; and visual work without
recorded approval. These arrive as ordinary draft PRs for Brian to merge, and
each is decided from the diff by the prohibited-path scan rather than from a
risk label.

Highest risk is **not** on that list any more. A grade says how rigorously a
change is reviewed; it does not decide the route. Highest-risk work may use the
lane only when an answered owner checkpoint names the package, so Brian hears
about it before it merges — see
[ADR 0033](adr/0033-harness-after-the-first-live-mission.md) §4.

**A mission merge does not deploy** — decided deliberately. `main` moves
ahead of production until Brian ships it:

```
gh workflow run deploy.yml
```

That builds one image from the current head of `main` (all accumulated
merges, each individually CI-green) and deploys it with the full smoke test.
Any PR Brian merges himself also triggers a deploy and carries the
accumulated work with it. The checkpoint's drift line says when this
matters; rollback is unchanged (`docs/deployment.md`).

## Recovery

Durable mission state lives outside the repository at
`~/.local/state/lancers-operations-platform/<repo-hash>/missions/<id>/journal.ndjson`
(owner rules beside it in `owner-rules.json`), append-only, replayed on
every read.

- **The Lead's session died, was compacted, or was closed:** start a fresh
  session, `/run-mission M-<id>`. The new Lead validates the Lead lease
  (a still-live prior Lead is refused; a dead one is reclaimed after its
  heartbeat expires), replays the journal, and reports the reconstructed
  state and next actions before doing anything. The Lead lease is written by
  `mission init`, so this holds from the mission's first event. The fresh Lead
  continues the same planned execution epoch.
- **Claude usage ran out:** the Lead checkpointed and stopped durably
  (`mission stop --reason usage-exhausted`). When capacity returns, a fresh
  session resumes exactly as above. There is no automatic wake-up in v1.
- **A worker died mid-package:** its lease expires and its package returns
  to the frontier; the worktree and branch are never deleted while dirty or
  unmerged, and re-dispatch reuses them.
- **Something looks wrong:** `npm run mission -- status M-<id>` projects every
  package onto the canonical lifecycle, then prints open questions and the
  executable frontier without changing anything. Detailed journal mechanics
  remain in plain NDJSON and are safe to read.

A passing `mission gate` records `gate-passed` at the exact head. Re-running a
now-failing gate invalidates that milestone, so volatile GitHub evidence cannot
leave status falsely green.

Workers can validate a completed receipt before filing it:

```
npm run mission -- receipt M-<id> WP-<id> --worker <worker-id> --receipt receipt.json --check
npm run mission -- review M-<id> WP-<id> --receipt review.json --check
```

The check applies the same state-aware receipt rules and does not append to the
journal. A correction dispatch separates findings that require injection proof
with `--findings` from findings for which no regression test can exist with
`--record-only`. That flag classifies injection-proof capability only; it does
not change `block` / `correct-before-handoff` / `advisory` review disposition or
authorize work on an advisory. Re-running `mission correction` for the same
active worker replaces that correction scope in place; it preserves the worker
identity, package lifecycle and append-only lineage, so `abandon-worker` is not
a re-scoping tool.

## One-time owner actions before the first live mission

Agents cannot change live GitHub settings, so Brian performs these once:

1. Create the `mission-merge` label in the repository (Issues → Labels). It
   no longer gates the lane; it only requests a refusal comment.
2. Confirm Actions workflow permissions allow workflows the write access the
   fast lane already uses (Settings → Actions → General → Workflow
   permissions: read and write). `mission-merge.yml` narrows its own token
   from there and never uses `--admin`.
3. Nothing else: no secrets, no rulesets, no new services. Branch protection
   on `main` stays exactly as it is — it is the gate both lanes depend on.

## Readiness and its evidence

Mission closeout reports one of three states: **Fully accepted** when both
implementation and all required acceptance verification have recorded evidence;
**Implementation complete; acceptance pending** when code work is complete but
an owner action, external prerequisite or subsequent agent verification remains;
or **Incomplete** while required implementation remains. A merge, completed work
package, stopped worker, or `Done` owner-action issue cannot independently prove
acceptance. An acceptance-pending receipt enumerates each affected criterion,
linked owner-action issue, remaining verification and next actor.

Mission Harness v1 is validated by deterministic synthetic rehearsals only —
`tests/mission-rehearsals.test.ts` maps each numbered readiness criterion
from the approved task to a test that runs in CI with no real Linear write,
no real worker, and no real merge. Reproduce the evidence any time with:

```
npx vitest run tests/mission-rehearsals.test.ts
```

Real Linear writes, real workers, and a real guarded merge are the pilot's
evidence, produced with Brian watching. The pilot recommendation and the
harness verdict live in the Mission Harness v1 pull request's implementation
report. **Declaring not ready** is always a legitimate outcome, at every
level: an intake draft ships `status: "not_ready"`; a Mission Lead that
cannot safely complete a required workstream preserves the partial PR and
its evidence, stops with `npm run mission -- stop`, and reports not ready
with the missing work named; a package blocks rather than pretends.

## Known limitations in v1

- One Lead per mission, working one planned epoch at a time; at most two
  implementation workers and at most three
  concurrent implementers, reviewers and walkers per mission. There
  is no harness-level mission count. Each active mission owns a uniquely ported
  disposable local database; the standing non-mission stack remains available.
- The workflow trusts the Lead's published receipt for facts whose ground
  truth is machine-local (review result, visual approval, owner queue),
  bounded by the evidence-derived conjuncts and the coherence tripwire —
  see ADR 0027 for exactly what is trusted and why.
- Linear synchronization is recorded durably, but the MCP calls themselves
  are made by the Lead's session; a crash between intent and result is
  detected and reconciled rather than prevented.
- No automatic wake-up after usage limits; resuming is one command in a
  fresh session.
- Mission state is machine-local: a different machine starts from the
  repository's durable artifacts (PRs, branches, Linear), not the journal.
- Reviewer and walker freshness is enforced by agent and session identity, not
  proved: no host signal distinguishes a fresh model context from a reused one.
- The broker's live provisioning path (worktree, dependencies, database reset and
  seed, application, health) runs the repository's own guarded commands; its
  decisions — allocation, queueing, health judgement, reclamation refusals — are
  what the test suite proves, with the executors injected.

## Context and turn economy

Brian selects Sonnet or Opus for the Mission Lead. The Lead assigns Haiku only
to mechanically bounded, low-risk implementation with a complete contract and
mechanical acceptance; complex implementation and every correction use Sonnet,
which is the implementation cap. Every reviewer is Sonnet, also capped there;
the scout defaults to Haiku. Handoffs are on-disk pointers (`brief.md`,
`receipt.json`, and walker/review reports), not conversational payloads.
Independent commands are batched; long output goes to `/tmp/out.log` with only
its last 20 lines shown, and a diff stat precedes a full diff.

The Lead checkpoints and stops after each planned execution epoch, before the
next issue group begins. The integrated walker, cutover and closeout remain
ordinary mission stages. See **Execution epochs** above. Every resume reconciles
the journal against GitHub first. The Lead delegates repository
investigation to the bounded read-only scout and waits for completion
notifications instead of polling.
