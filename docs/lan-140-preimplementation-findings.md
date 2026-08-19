# LAN-140 pre-implementation findings

Audited 2026-08-19 against `origin/main` at `aac9ef1`, LAN-140 and its related
issues (LAN-91, LAN-112, LAN-121, LAN-122, LAN-139), the complete harness roles,
skills, state/packet/CLI code, local coordinator, merge gate/workflow, governing
documents/ADRs, and harness/database tests.

## Current behavior and gaps

- Mission journals and locks were already keyed by mission ID. Multiple journals
  could coexist; the only mission-count rule was prose saying one Lead/mission at
  a time. There was no global scheduler to remove.
- The two-worker refusal was already calculated from one replayed mission state,
  so it was correctly per mission. Collision-domain and migration-owner refusals
  were also per mission, despite broader wording in some instructions.
- The Lead lease was checked only by `resume`. Every other CLI mutation bypassed
  it, and the recorded owner was the short-lived CLI PID rather than a stable
  Lead-session identity.
- A worker left active by a crash had no terminal event. Stop/resume replayed the
  stale active record, which could permanently consume a worker slot.
- The local coordinator had exactly two fixed definitions. Mission workers were
  instructed to acquire one per issue, so independent missions and ordinary
  issue work competed for the same two stacks.
- The merge workflow's `concurrency: mission-merge` is correct repository-wide
  integration ordering, not mission admission. It needs no change.
- Open PR #49 / LAN-139 changes Vitest database-suite serialization only. This
  correction does not touch its files or duplicate its test-isolation work.
- LAN-121 and LAN-122's review budget, lineage and finding-disposition rules are
  already encoded and unaffected.

## Smallest coherent correction

1. Remove the prose mission-count restriction while keeping two workers per
   mission and the serialized merge lane.
2. Fence every mission CLI mutation with a stable Lead-session identity, retaining
   PID only as liveness evidence.
3. Add a durable worker-abandonment transition that preserves history and frees
   the per-mission slot.
4. Preserve the standing issue slots and add dynamically allocated mission-owned
   stacks with unique project IDs, complete port sets, recorded base/migration
   versions, and explicit worker-worktree attachment.
5. Update only the governing instructions, runbook, narrow superseding ADR and
   focused state/coordinator/harness tests.

## Pre-implementation self-review

The plan adds no scheduler, portfolio supervisor, global worker pool, mission
cap, migration registry, worker lease, or long-held allocation lock. The only
new lock use is the existing momentary allocator critical section, justified by
the demonstrated duplicate-port/project risk. The stable Lead fence addresses
demonstrated split-control bypass; worker abandonment addresses demonstrated
unrecoverable active state. Merge serialization and all owner, review, hosted
database and production boundaries remain unchanged.
