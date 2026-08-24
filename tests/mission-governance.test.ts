// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { classifyPath, loadRules as loadFastLaneRules } from "../scripts/fast-lane/classify.mjs";
import {
  loadRules as loadMissionRules,
  prohibitedPaths,
  touchesOwnerApprovalSurface,
  touchesVisualSurface,
} from "../scripts/mission/merge-gate.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const workflow = read(".github/workflows/mission-merge.yml");
const code = workflow
  .split("\n")
  .map((line) => line.replace(/(^|\s)#.*$/, ""))
  .join("\n");
const ci = read(".github/workflows/ci.yml");
const deploy = read(".github/workflows/deploy.yml");
const missionRules = loadMissionRules();

describe("mission merge authority", () => {
  it("executes only the trusted base-branch gate, never pull-request code", () => {
    const triggers = /\non:\n([\s\S]*?)\nconcurrency:/.exec(workflow)?.[1] ?? "";
    expect(triggers).toMatch(/^ {2}workflow_run:/m);
    expect(triggers).toMatch(/^ {2}pull_request_target:/m);
    expect(triggers).toMatch(/^ {2}workflow_dispatch:/m);
    expect(triggers).not.toMatch(/^ {2}pull_request:/m);
    expect(workflow).toMatch(/uses: actions\/checkout@v\d+[\s\S]*?ref: main/);
    expect(workflow.match(/uses: actions\/checkout@/g)).toHaveLength(1);
    expect(workflow).toContain('git fetch --no-tags origin "pull/$PR/head:refs/mission/head"');
    expect(workflow).not.toMatch(/git (checkout refs\/mission|switch)/);
    expect(workflow).toMatch(/node scripts\/mission\/gate-cli\.mjs/);
  });

  it("makes the recomputed verdict the only merge condition", () => {
    const merge = /- name: Merge\n([\s\S]*?)\n {6}- name: /.exec(workflow)?.[1] ?? "";
    expect(merge).not.toHaveLength(0);
    expect(merge).toContain("if: steps.gate.outputs.merge == 'true'");
    expect(merge).not.toMatch(/contains\(github\.event\.pull_request\.labels|\|\|/);
  });

  it("fences the head and cannot bypass or rewrite repository protection", () => {
    expect(code).toMatch(/gh pr merge/);
    expect(code).toContain("--match-head-commit");
    expect(code).not.toMatch(/--admin/);
    expect(workflow).toContain('gh pr ready "$PR" --repo "$REPO" --undo');
    for (const forbidden of [
      "gh repo edit",
      "gh ruleset",
      "gh secret",
      "branches/main/protection",
      "/rulesets",
      "enforce_admins",
      "required_status_checks",
      "gh workflow enable",
      "gh workflow disable",
    ]) {
      expect(workflow, forbidden).not.toContain(forbidden);
    }
  });

  it("requires exactly the checks produced by ordinary pull-request CI", () => {
    const jobs = [...ci.matchAll(/^ {4}name: (.+)$/gm)].map((match) => match[1].trim());
    expect([...missionRules.requiredChecks].sort()).toEqual(jobs.sort());
    expect(ci).toMatch(/^name: CI$/m);
    expect(workflow).toMatch(/workflows: \["CI"\]/);
    expect(ci).toMatch(/^on:\n {2}pull_request:\n/m);
    expect(ci).not.toMatch(/mission[- ]merge|types: \[ready_for_review\]/i);
    expect(deploy).not.toMatch(/mission[- ]merge/i);
  });

  it("has only the permissions required to perform its guarded merge", () => {
    expect(code).toMatch(/^permissions:\n {2}contents: read\s*$/m);
    expect(code).toMatch(/^ {4}permissions:$/m);
    expect(code).toMatch(/^ {6}contents: write\s*$/m);
    expect(code).toMatch(/^ {6}pull-requests: write\s*$/m);
    expect(code).not.toMatch(/^ {6}id-token: write|permissions: write-all\s*$/m);
  });
});

describe("mission lane containment", () => {
  it("keeps its control plane protected from the fast lane", () => {
    const fastRules = loadFastLaneRules();
    for (const file of [
      "scripts/mission/merge-gate.mjs",
      "scripts/mission/gate-cli.mjs",
      "scripts/mission/cli.mjs",
      "scripts/mission/lib/state.mjs",
      "tests/mission-gate.test.ts",
      "tests/mission-governance.test.ts",
      "tests/mission-state.test.ts",
      ".github/mission-merge-rules.json",
      ".github/workflows/mission-merge.yml",
      "docs/mission-harness.md",
    ]) {
      expect(classifyPath(file, fastRules).verdict, file).toBe("protected");
    }
  });

  it("prohibits the mission lane from changing its own authority", () => {
    for (const file of [
      ".github/mission-merge-rules.json",
      ".github/workflows/mission-merge.yml",
      "scripts/mission/merge-gate.mjs",
      "tests/mission-gate.test.ts",
      ".claude/settings.json",
      "docs/mission-harness.md",
    ]) {
      expect(prohibitedPaths([{ status: "M", path: file }], missionRules), file).not.toEqual([]);
    }
  });

  it("derives owner-checkpoint and visual treatment from changed paths", () => {
    for (const file of ["src/lib/auth/guards.ts", "src/lib/delivery/whatsapp-cloud.ts"]) {
      const change = [{ status: "M", path: file }];
      expect(prohibitedPaths(change, missionRules), file).toEqual([]);
      expect(touchesOwnerApprovalSurface(change, missionRules), file).toBe(true);
    }
    for (const file of ["src/app/operate/events/presentation.ts", "src/app/events/page.tsx"]) {
      expect(touchesVisualSurface([{ status: "M", path: file }], missionRules), file).toBe(true);
    }
    const ordinary = [{ status: "M", path: "src/lib/events/filters.ts" }];
    expect(touchesOwnerApprovalSurface(ordinary, missionRules)).toBe(false);
    expect(touchesVisualSurface(ordinary, missionRules)).toBe(false);
  });
});
