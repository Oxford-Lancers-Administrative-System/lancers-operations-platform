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

Brian starts one Mission Lead in a Claude Code session at the repository.
Everything else — planning, Linear issues, workers, reviews, corrections,
qualifying merges, checkpoints — is the Mission Lead's job. One mission runs
at a time.

To start a **new** mission, the approved packet must already be on `main` at
`missions/packets/M-<id>/packet.json`; the Lead runs
`npm run mission -- init M-<id> --packet missions/packets/M-<id>/packet.json`.
An invalid, `not_ready`, or unapproved packet is refused outright. To
**resume** after any interruption, the same `/run-mission M-<id>` invocation
is enough — the Lead replays durable state and continues; no chat history is
needed or used.

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

Answer the questions in the session; the Lead persists each answer
(`npm run mission -- answer …`) before dependent work resumes. When an
answer expresses a general convention, say so — the Lead records it as a
proposed rule, and it becomes reusable across missions only after this
explicit approval (`promote-rule`). A promoted rule means that class of
question is never asked again.

**Visual review is unchanged from ADR 0020.** UI-affecting packages wait
for Brian to open a live, protected `review-ready` environment — normally at
a checkpoint — with one URL, the fixed login, and zero commands. His
approval is recorded (`visual-approve`) and the merge gate requires it; the
merge workflow independently refuses a "nonvisual" claim whose diff touches
a visual surface.

## What merges by itself, and what never does

There are three tiers, decided by Brian on 2026-08-18:

**Merges by itself.** Standard application work at low or normal risk, with
a clear independent review at the exact head SHA, recorded visual approval
(or genuinely nonvisual), no open owner question, and green required checks
at that exact commit, merges through the checked-in `mission-merge` workflow
after the Mission Lead publishes its receipt and applies the `mission-merge`
label. The workflow re-derives everything server-verifiable from evidence
and fails closed; a refusal is posted on the pull request. A review-blocked
correction or any new head clears a previously recorded visual approval —
Brian approved what he saw, not whatever came later.

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
and credentials; deployment and production data; Highest-risk work; and
visual work without recorded approval. These arrive as ordinary draft PRs
for Brian to merge.

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
  state and next actions before doing anything.
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

- One Mission Lead at a time; at most two implementation workers; two local
  database slots.
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
