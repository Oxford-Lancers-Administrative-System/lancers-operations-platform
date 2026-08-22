# Owner-approved intake rules preserved from the kickoff page

These rules retain the existing intake contract. The ledger-first stages in
`SKILL.md` change where decisions are recorded and how designs are reviewed; they
do not loosen these rules.

## Commissioning and approval

- Brian or the Project Manager may commission an intake.
- A commission identifies one proposed outcome. If it does not, ask for the
  smallest clarification before proceeding.
- Brian is the final packet approver even when the Project Manager commissioned
  the intake.
- Completeness, validation, or opening a PR does not approve a packet. Brian's
  merge of the dedicated intake-artifacts-only PR approves the exact version and commit.
- No Mission Lead or implementation worker begins before that merge.

## Implementation boundary

Define what must be true, not how engineering is organized. Do not create the DAG,
work packages, implementation issues, application code, migrations, or deployment
steps. The Mission Lead owns internal decomposition and technical design inside
the approved invariants.

The default is one proposed outcome remains one mission. Recommend a split only
before finalizing the packet and only when one mission creates a substantial
safety, authority, readiness, dependency, or outcome-coherence problem. Size,
multiple technologies, many packages, many PRs, or internal phases are not enough.
For a proposed split: explain the material danger; show why the Mission Lead's DAG
cannot contain it; prove no outcome expansion; identify the minimum boundaries and
dependencies; and obtain Brian's approval before drafting multiple packets.

## Startup and system-ready gate

Read, in order and only as far as relevant:

1. the commissioned portfolio row and project home/Mission Control;
2. Current Project Status and the Release 1 Authority Manifest;
3. controlling product briefs and owner decisions;
4. relevant Linear issues, dependencies, ownership, and history;
5. current GitHub `main`, implemented reality, interfaces, and verification;
6. relevant transcripts or historical discussions for provenance only.

Record the observed full `main` SHA. Locate the canonical packet schema,
validator, and packet directory on that `main`. If they are not usable, stop with
**mission intake system not ready**. Never invent a competing schema, directory,
or approval convention.

## What intake must determine

For the commissioned outcome, document:

- intended outcome and why it matters now;
- authoritative sources and exact controlling decisions;
- in-scope behavior and artifacts, exclusions, and non-goals;
- locked invariants the Mission Lead may not reinterpret;
- acceptance criteria and required evidence;
- external systems, permissions, and authority boundaries;
- safety, privacy, consent, security, recovery, and rollout constraints;
- prerequisite gates and dependencies;
- qualifying asynchronous owner actions, including readiness prerequisite,
  required owner outcome, completion evidence, affected requirement or gate, and
  subsequent agent verification;
- permitted clarifications and defect handling;
- discoveries that require a revised packet;
- observed `main` SHA and repository-drift rule;
- nonblocking unknowns and explicit handling rules;
- actors, triggers, entry points, consequential route or action placement,
  actions, state transitions, handoffs, exceptions, and visible outcomes; and
- classification of every consequential workflow and IA decision.

Decision classifications mean:

- **Locked:** an approved source controls the behavior, or another choice would
  materially alter the authorized workflow.
- **Proposed for owner approval:** the choice is consequential and unresolved.
  Propose a coherent default and include it in the smallest batched questions.
- **Delegated to the Mission Lead:** the choice does not materially change the
  workflow, authority, safety, acceptance, or user understanding.

Research every safely resolvable fact before asking. Explain each answer's
consequence, recommend one when evidence supports it, and do not reopen anything
already committed as settled. Contract rather than expand.

## Readiness and drift

Use `ready` only when the packet is complete, coherent, schema-valid, supported by
the required acceptance evidence, and has no open owner decision or readiness
gate. Otherwise use `not_ready` and name what remains. A nonblocking unknown is
allowed only with an explicit handling rule that preserves safe execution.

Compare execution-time `main` with `baseline.commit`. Drift that does not change
meaning, feasibility, invariants, interfaces, or acceptance evidence may be
recorded and tolerated. Drift affecting any of those requires re-intake or a new
packet version. Never silently reinterpret the approved packet around current
code.

## Owner-action qualifying test and closeout

Track an asynchronous owner action only when all five are true:

1. Brian cannot reasonably resolve it during active intake or a normal check-in.
2. Brian must leave the workflow to coordinate with another person, wait for an
   external organization, obtain access or approval, or perform a separately timed
   real-world action.
3. The outcome matters to eventual execution or acceptance.
4. Intake and other useful work can continue while it remains unresolved.
5. It is expected to remain unresolved at intake closeout and therefore needs a
   durable place for Brian to manage it later.

When uncertain, use normal intake; never create one just in case. Create qualifying
Linear issues only at closeout, deduplicated against the Owner Actions view. Each
issue names mission id, affected requirement or gate, exact owner outcome,
readiness prerequisite, completion evidence, and follow-up agent verification.

## Packet artifacts and PR mechanics

The packet directory contains `packet.json`, a human-readable `README.md`,
`sources.md` with provenance, reviewed mockups, and acceptance records. Apply the
repository formatter before computing or refreshing hashes. Run the canonical
validator and exact required PR checks. After every packet change, wait for green
checks on the exact final head SHA. If checks cannot run locally, remain
`not_ready` and let GitHub Actions provide the gate. Only then hand Brian the
single merge action. Approved packets on `main` are immutable; material revision
uses a new `packet_version` and intake-artifacts-only PR.

## Project Manager receipt and final report

The receipt states primary and deliberately shared portfolio coverage,
dependencies, superseded boundary, remaining unassigned Release One coverage,
packet path/version/PR/SHA, validation results, and owner-action status.

The end-of-run report contains: verdict; mission; packet; boundary; split decision;
questions or blockers; validation; next action; Project Manager receipt; and
ledger state (files committed in this session and next unfinished stage).
