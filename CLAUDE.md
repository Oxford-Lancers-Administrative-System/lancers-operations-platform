@AGENTS.md

# Claude Code notes

`AGENTS.md`, imported above, is the canonical working agreement: purpose and
scaffold boundary, tooling, every command, directory conventions, the workflow,
the definition of done, the hard rules, and when to stop and ask. Read it first.
Nothing from it is repeated here, so that the two cannot drift apart.

Only genuinely Claude-specific notes belong in this file.

- **One workflow and one subagent.** Brian invokes `/start-issue LAN-###`; the
  top-level session implements exactly that issue inside its dedicated
  worktree. `code-reviewer` is the only subagent and is used only for graded
  independent review. See `docs/adr/0018-single-issue-agent-development.md`.
- **`/start-issue` is user-invoked.** It is not model-invocable, never selects a
  second issue, and never delegates implementation.
- **Keep shared guidance in `AGENTS.md`.** If a rule would apply equally to
  Codex or any other coding agent, it belongs there, not here. The role
  definitions under `.claude/` are the exception only because the file format
  is Claude Code's.
