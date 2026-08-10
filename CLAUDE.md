@AGENTS.md

# Claude Code notes

`AGENTS.md`, imported above, is the canonical working agreement: purpose and
scaffold boundary, tooling, every command, directory conventions, the workflow,
the definition of done, the hard rules, and when to stop and ask. Read it first.
Nothing from it is repeated here, so that the two cannot drift apart.

Only genuinely Claude-specific notes belong in this file.

- **Agent tooling stays minimal.** Do not add custom subagents, skills, hooks,
  or slash commands under `.claude/`. There are none today, and that is
  deliberate — see the Agent tooling section of `AGENTS.md`.
- **Keep shared guidance in `AGENTS.md`.** If a rule would apply equally to
  Codex or any other coding agent, it belongs there, not here.
