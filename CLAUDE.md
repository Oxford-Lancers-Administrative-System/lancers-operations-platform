@AGENTS.md

# Claude Code notes

`AGENTS.md`, imported above, is the canonical working agreement: purpose and
scaffold boundary, tooling, every command, directory conventions, the workflow,
the definition of done, the hard rules, and when to stop and ask. Read it first.
Nothing from it is repeated here, so that the two cannot drift apart.

Only genuinely Claude-specific notes belong in this file.

- **Three roles under `.claude/`, and no more.** `/supervise-batch` is the lead
  workflow; `issue-implementer` and `code-reviewer` are the only subagents.
  Adding a fourth role, a hook, or raising the two-worker cap is Brian's
  decision. See the Agent tooling section of `AGENTS.md` and
  `docs/adr/0013-supervised-agent-development.md`.
- **`/supervise-batch` is how a batch is run.** Brian invokes it; it is not
  model-invocable, so do not attempt to start one on your own initiative.
- **Keep shared guidance in `AGENTS.md`.** If a rule would apply equally to
  Codex or any other coding agent, it belongs there, not here. The role
  definitions under `.claude/` are the exception only because the file format
  is Claude Code's.
