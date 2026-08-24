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

**Visual review keeps ADR 0020's protected environment and moves to mission
level under ADR 0034.** After all packages are built, one workflow walker and
one cross-surface pass run at the integrated head. Brian opens one live
`review-ready` environment with one URL, the fixed login, and zero commands.
His approval is recorded once (`mission-visual-approve`) with the exact package
heads it covers. A rendered batched correction requires a scoped re-walk and
re-approval; a classifier-proven non-rendered delta may carry them forward.

## What merges by itself, and what never does

There are three tiers, decided by Brian on 2026-08-18:

**Merges by itself.** Standard application work whose exact package head is
covered by the clear integrated security-tier review, the mission visual
approval (or genuinely nonvisual), no open owner question, and green required checks
at that exact commit, merges through the checked-in `mission-merge` workflow
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
  by `mission init`, this holds from the mission's first event.
- **Claude usage ran out:** the Lead checkpointed and stopped durably
  (`mission stop --reason usage-exhausted`). When capacity returns, a fresh
  session resumes exactly as above. There is no automatic wake-up in v1.
- **A worker died mid-package:** its lease expires and its package returns
  to the frontier; the worktree and branch are never deleted while dirty or
  unmerged, and re-dispatch reuses them.
- **Something looks wrong:** `npm run mission -- status M-<id>` prints the
  package states, open questions, and executable frontier without changing
  anything. The journal itself is plain NDJSON and safe to read.

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

- One Lead per mission; at most two implementation workers and at most three
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

The top model is reserved for the Mission Lead's judgment, implementation and
the integrated security-tier review. Walkers, browser preflight, cross-surface
comparison, Linear sync, cleanup, scouts and mechanical corrections use a
Sonnet-class model. Handoffs are on-disk pointers (`brief.md`, `receipt.json`
and walker/review reports), not conversational payloads. Independent commands
are batched; long output goes to `/tmp/out.log` with only its last 20 lines
shown, and a diff stat precedes a full diff.

The Lead stops and a fresh Lead resumes at plan-approved, build-complete and
gate-complete. Every resume reconciles the journal against GitHub first. The
Lead delegates repository investigation to the bounded read-only scout and
waits for completion notifications instead of polling.
