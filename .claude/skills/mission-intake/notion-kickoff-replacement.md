# Proposed replacement for the Notion mission-intake kickoff page

Mission intake now runs in the repository's Claude Code harness, where its ledger
survives context compression and session restarts.

From the current `lancers-operations-platform` repository root, invoke:

```text
/mission-intake <portfolio mission number>
```

The skill resolves the approved Release One Mission Portfolio row, creates or
resumes a dedicated intake worktree, and prints its ledger-backed resume banner.
The conversation is only the review interface; `missions/intake/<mission-id>/`
is the working memory. Brian approves boundary, overview, frozen workflow
inventory, each workflow specification and mockup, and finally the packet by
merging its packet-only PR.

The authoritative intake rules remain on this Notion page and in the linked
portfolio and product records. The execution procedure is
`.claude/skills/mission-intake/SKILL.md`. The skill never executes a mission.

Brian pastes this replacement into Notion himself after reviewing the skill PR.
