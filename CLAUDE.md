@AGENTS.md

# Claude Code notes

`AGENTS.md`, imported above, is the canonical working agreement: purpose and
scaffold boundary, tooling, every command, directory conventions, the workflow,
the definition of done, the hard rules, and when to stop and ask. Read it first.
Nothing from it is repeated here, so that the two cannot drift apart.

Only genuinely Claude-specific notes belong in this file.

- **Two workflows and two subagents.** Brian invokes `/start-issue LAN-###`
  to implement exactly one issue in the top-level session, or
  `/run-mission M-<id>` to execute one approved mission packet as the Mission
  Lead. `code-reviewer` performs graded independent review;
  `implementation-worker` implements one Mission-Lead-assigned work package
  and spawns nothing. See `docs/adr/0027-mission-harness.md` and, for the
  preserved single-issue model, `docs/adr/0018-single-issue-agent-development.md`.
- **Both workflows are user-invoked.** Neither is model-invocable. `/start-issue`
  never selects a second issue and never delegates implementation;
  `/run-mission` never implements in its own session, keeps delegation flat,
  and records every material transition in durable mission state
  (`npm run mission`).
- **Visual acceptance is a mid-workflow gate.** UI-affecting work stops only
  after a complete agent browser preflight and before final correctness review;
  nonvisual work does not stop. Brian receives a live, protected environment and
  runs no setup commands.
- **Keep shared guidance in `AGENTS.md`.** If a rule would apply equally to
  Codex or any other coding agent, it belongs there, not here. The role
  definitions under `.claude/` are the exception only because the file format
  is Claude Code's.
