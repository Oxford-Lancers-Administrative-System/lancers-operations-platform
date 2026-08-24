@AGENTS.md

# Claude Code notes

`AGENTS.md` is the canonical working agreement. Shared policy belongs there;
keep this file limited to Claude-specific routing.

- The five skills under `.claude/skills/` are user-invoked
  (`disable-model-invocation: true`).
- `implementation-worker`, `code-reviewer`, and `scout` are the only
  subagents. Their frontmatter supplies isolation, model default, and tool caps.
- Delegation is flat: only the Mission Lead launches subagents; they launch none.
- `.claude/settings.json` supplements protected branches, checked-in gates,
  local-only database guards, and owner authority; it never replaces them.
