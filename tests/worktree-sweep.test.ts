import { describe, expect, it } from "vitest";

import {
  classify,
  isInjectedAgentsBlock,
  parseWorktreeList,
  workInStatus,
} from "../scripts/worktrees/sweep.mjs";

const INJECTED = [
  "diff --git a/AGENTS.md b/AGENTS.md",
  "@@ -250,0 +251,2 @@",
  "+# This is NOT the Next.js you know",
  "+This block is written and re-added by `next dev` — verify it.",
].join("\n");

const clean = {
  primary: false,
  locked: false,
  recent: false,
  work: [],
  onMain: false,
  mergedPr: null,
};

describe("the worktree sweep (LAN-523)", () => {
  it("reads git's porcelain listing, including detached and locked trees", () => {
    const records = parseWorktreeList(
      [
        "worktree /repo",
        "HEAD aaa",
        "branch refs/heads/main",
        "",
        "worktree /repo/.claude/worktrees/agent-1",
        "HEAD bbb",
        "detached",
        "locked claude agent agent-1 (pid 1)",
        "",
      ].join("\n"),
    );
    expect(records).toEqual([
      { path: "/repo", head: "aaa", branch: "main", locked: false },
      { path: "/repo/.claude/worktrees/agent-1", head: "bbb", branch: null, locked: true },
    ]);
  });

  it("counts source changes as work, and build output and the injected AGENTS.md as not", () => {
    expect(
      workInStatus(
        [
          "?? receipt.json",
          "?? .next/",
          " M AGENTS.md",
          "?? next-env.d.ts",
          " M src/a.ts",
          "?? supabase/migrations/x.sql",
        ].join("\n"),
        INJECTED,
      ),
    ).toEqual([" M src/a.ts", "?? supabase/migrations/x.sql"]);
  });

  it("removes only a clean, idle tree whose head is on main or in a merged pull request", () => {
    expect(classify({ ...clean, onMain: true }).remove).toBe(true);
    expect(classify({ ...clean, mergedPr: "224" }).remove).toBe(true);
    expect(classify(clean)).toEqual({ remove: false, reason: "commits that are not on main" });
    expect(classify({ ...clean, onMain: true, primary: true }).remove).toBe(false);
    expect(classify({ ...clean, onMain: true, locked: true }).remove).toBe(false);
    expect(classify({ ...clean, onMain: true, recent: true }).remove).toBe(false);
    expect(classify({ ...clean, onMain: true, work: [" M src/a.ts"] }).remove).toBe(false);
  });
});

describe("the AGENTS.md exemption", () => {
  it("covers only a diff that adds the next dev block", () => {
    expect(isInjectedAgentsBlock(INJECTED)).toBe(true);
    expect(isInjectedAgentsBlock(`${INJECTED}\n-a removed rule`)).toBe(false);
    expect(isInjectedAgentsBlock("@@ -1,0 +1 @@\n+a new rule")).toBe(false);
    expect(workInStatus(" M AGENTS.md", "@@ -1,0 +1 @@\n+a new rule")).toEqual([" M AGENTS.md"]);
  });
});
