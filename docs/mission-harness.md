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

## Lead epochs

A **Lead epoch** is the bounded orchestration assignment one Mission Lead holds.
It is mission control state — not another package lifecycle, and not another
Linear status. The harness derives it from durable state before the Lead acts,
and refuses mission mutations outside it.

Mission 4 is why. Its journal holds 645 events, 448 of them Lead heartbeats, and
one Lead ran from plan approval through five packages, twenty correction
dispatches and every merge — while the status still reported that the post-plan
recycle was owed. The rule existed; nothing enforced it. An epoch makes the
recycle a precondition on the events that change state.

### The phases, and what ends each one

| Phase                 | Derived when                                      | Ends when                                    |
| --------------------- | ------------------------------------------------- | -------------------------------------------- |
| `planning`            | No approved plan                                  | Brian's approval is recorded                 |
| `post-plan-boundary`  | Plan approved, recycle not yet taken              | A fresh Lead opens the first execution epoch |
| `implementation-wave` | Live packages remain                              | Every package in the wave has merged         |
| `integration`         | All live packages merged, mission smoke not clear | The integrated smoke is clear                |
| `acceptance-cutover`  | Smoke clear, owner decisions still open           | Every open owner decision is answered        |
| `closeout`            | Nothing but closeout remains                      | The mission is finalized                     |

An **execution wave** is at most two implementation packages, chosen
deterministically from the executable frontier in plan order, with anything that
already carries a worker taken first — a rotation drains running work, it never
strands it. Collision domains, migration ownership and dependency order apply to
a wave exactly as they apply to dispatch.

The Lead does not choose this. `lead-epoch-opened` is validated against the
definition the harness derives, so an epoch that named itself an extra package,
skipped the recycle, or promoted itself from a wave into the integrated walker
is refused.

### Boundaries are fences, not advice

A boundary is reached by the state, not by the Lead agreeing to it: the moment
the plan is approved, the planning epoch is boundary-pending. Red health reaches
one too.

At a boundary the epoch may finish what is already running — worker receipts, PR
heads, review receipts, merge evidence in flight — and it may always accept
owner answers, checkpoints, journal annotations and reclamation. It may not
synchronize Linear for new execution, dispatch a worker, start a correction
outside an already-active one, progress an out-of-scope package, file the
integrated review, or write the closeout. `mission epoch drain` pins that to
exactly the work that was active when draining began.

A **revised approved packet** is neither: it is the owner's contract arriving,
not new execution, so a boundary accepts it and drift-stopped work can resume.
A closed epoch does not, because nobody holds the mission then — and that
packet replaces the requirements, decisions, non-goals and owner gates the
whole mission is judged against.

Reading and checking never mutate. `mission status`, `mission epoch status` and
journal reads stay available throughout, and the pure `receipt --check` /
`review --check` paths never append — they report exactly the refusals the
append would, epoch fences included.

### The handover

`mission epoch close` issues a **one-use resume token**, writes a generated
dossier, and releases the Lead fence. Opening the next epoch requires that
unspent token **and a different Lead identity**; the token is consumed when the
epoch opens, and the same session can never resume its own closed epoch. A
closed epoch never reopens.

**What this proves, and what it does not.** When the host exposes a trustworthy
Claude session identifier the epoch records it. When it does not — which is the
case today — the fallback is a fresh `LANCERS_MISSION_LEAD_ID` plus the one-use
token, initiated from a session Brian started. That is harness-level fencing and
a user-started handshake. It is **not** cryptographic proof of a fresh model
context, and a pid is never offered as evidence of one.

The incoming Lead is handed a **dossier** generated from reduced state, written
beside the journal and never into the repository: objective and frozen
invariants, phase and boundary, completed/active/blocked/waiting packages, the
heads and receipts that still matter, open owner decisions and operative
corrected ones, owner and external actions, unverified acceptance criteria, a
resource summary at the existing abstraction level, and the next permitted
actions. Heartbeats, superseded receipt prose and lease mechanics are absent
because it is a projection of state, never a reading of the narration. The
outgoing Lead writes no handover of its own. The journal remains the audit
source.

### Health: green, yellow, red

The colour is deterministic and explainable, and every reason carries a code and
the journal index that produced it. No model self-assessment is evidence.

- **Yellow** — one recoverable pressure signal: the epoch is four hours old, six
  owner answers have landed in it, a review is blocked or a correction is
  running, or the wave is one merge from its exit condition.
- **Red** — six hours old, ten owner answers, a corrected or disputed Lead
  journal entry, an abandoned worker, a third review round on one package
  lineage, a session replaced under the same assignment, a reused or absent Lead
  identity, or the Lead filing evidence that belongs to a worker.

Thresholds live in `EPOCH_LIMITS` in
[`scripts/mission/lib/epochs.mjs`](../scripts/mission/lib/epochs.mjs) and are
behaviour-tested.

Yellow recommends a fresh Lead and leaves the work available. Red is a fence:
the epoch becomes boundary-pending and continues only on Brian's explicit
risk-accepting authorization.

**Green means no recorded pressure signal since the epoch opened. It never means
the Lead's context has been proved healthy.** The host exposes no context-usage
telemetry, so that signal reads `unknown` and is reported as unknown; it is
never counted as evidence of health.

### Adjusting an epoch — Brian's call, never the bot's

The Lead may recommend an adjustment from journal evidence. Only an explicit
owner message authorizes filing one, and the event records Brian's own words.

**`--extend-current`** keeps this Lead for one bounded unit of work: one adjacent
package already eligible on the approved frontier, or one already-active
correction cycle. Once per epoch. Green only, unless Brian records an exception
naming every current warning or risk reason code. It never crosses into the
integrated walker, cutover or closeout, and it expires when the named work
stabilizes or after two hours — after which the fence returns by itself.

**`--recut-future`** regroups later waves within the approved dependency graph
and collision rules. It keeps no session alive, so it costs no extension budget
and may be filed at any health. Neither form changes the approved packages,
requirements, dependency DAG or acceptance criteria.

The journal records the health the harness computed. Accepting a risk never
relabels a red epoch green.

### At a boundary, Brian sees exactly three choices

`mission status`, `mission epoch status` and the checkpoint all show the same
thing: **continue with a fresh Lead** (the recommended default, with the close
and resume commands), **pause or stop the mission**, and **adjust the current or
future epochs** (owner approval required, with what an adjustment may and may not
change). Alongside them: the health colour and its reasons, the current and
proposed next scope, and the work being drained.

### Existing journals

Journals written before epochs replay unchanged and are never rewritten. Their
package history, questions, approvals, merge evidence and phase recycles stay
exactly as they were, and no epoch is invented for work already done. The next
mutating resume bootstraps one from current reduced state; until then status
stays readable and the CLI refuses mission work with an instruction rather than
a crash. A Mission 4-shaped journal bootstraps to `post-plan-boundary` — it must
hand the mission to a fresh Lead before any further implementation or cutover.

### Commands

```
npm run mission -- epoch status M-<id> [--json]
npm run mission -- epoch boundary M-<id> --reason <what was met>
npm run mission -- epoch drain M-<id> [--packages WP-a,WP-b]
npm run mission -- epoch close M-<id> [--reason <why>]
npm run mission -- epoch adjust M-<id> --extend-current --package WP-x \
    --by Brian --authorization "<Brian's words>" --reason <why> [--accept-risk <codes>]
npm run mission -- epoch adjust M-<id> --recut-future --waves <file.json> \
    --by Brian --authorization "<Brian's words>" --reason <why>
npm run mission -- resume M-<id> --token <token>
```

`mission init` opens the planning epoch in the same breath as recording the
packet, so there is never a window in which a Lead is unbounded.

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

**Merges by itself.** Standard application work whose exact package head has
clear required security coverage, Brian's issue approval (or is genuinely
nonvisual), no open owner question, and green required checks at that exact
commit merges through the checked-in `mission-merge` workflow
after the Mission Lead publishes its receipt and applies the `mission-merge`
label. The workflow re-derives everything server-verifiable from evidence
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
  state and next actions before doing anything. Because the fence is written
  by `mission init` and moves with each epoch, this holds from the mission's
  first event. The lost Lead's epoch is closed as lost — not as finished — and
  the fresh Lead opens the epoch the harness derives.
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

1. Create the `mission-merge` label in the repository (Issues → Labels).
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

- One Lead per mission, bounded by one epoch at a time; at most two
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

## Context and turn economy

Brian selects Sonnet or Opus for the Mission Lead. The Lead assigns Haiku only
to mechanically bounded, low-risk implementation with a complete contract and
mechanical acceptance; complex implementation and every correction use Sonnet,
which is the implementation cap. Every reviewer is Sonnet, also capped there;
the scout defaults to Haiku. Handoffs are on-disk pointers (`brief.md`,
`receipt.json`, and walker/review reports), not conversational payloads.
Independent commands are batched; long output goes to `/tmp/out.log` with only
its last 20 lines shown, and a diff stat precedes a full diff.

The Lead stops and a fresh Lead resumes after plan approval, before durable
execution begins — and after each execution wave, before the integrated walker,
and before cutover and closeout. Those boundaries are enforced by the state
machine, not by this paragraph; see **Lead epochs** above. Every resume
reconciles the journal against GitHub first. The Lead delegates repository
investigation to the bounded read-only scout and waits for completion
notifications instead of polling.
