// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadRules, reviewRequiredPaths } from "../scripts/merge/gate.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const ci = read(".github/workflows/ci.yml");
const deploy = read(".github/workflows/deploy.yml");
const rules = loadRules();

describe("delivery without pull requests (LAN-523, ADR 0041)", () => {
  it("has only the CI and deploy workflows: nothing merges, un-drafts or arms auto-merge", () => {
    expect(readdirSync(path.join(root, ".github", "workflows")).sort()).toEqual([
      "ci.yml",
      "deploy.yml",
    ]);
    expect(existsSync(path.join(root, ".github", "PULL_REQUEST_TEMPLATE.md"))).toBe(false);
    for (const workflow of [ci, deploy]) {
      expect(workflow).not.toMatch(/gh pr (merge|ready)/);
      expect(workflow).not.toMatch(/pull_request/);
    }
  });

  it("runs CI once, on a push to main, and never cancels a commit's run", () => {
    expect(ci).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n/m);
    expect(ci).toMatch(/cancel-in-progress: false/);
    expect(ci).toMatch(/^name: CI$/m);
  });

  it("requires exactly the checks CI produces, and deploy reads that list", () => {
    const jobs = [...ci.matchAll(/^ {4}name: (.+)$/gm)].map((match) => match[1].trim());
    expect([...rules.requiredChecks].sort()).toEqual(jobs.sort());
    expect(deploy).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(deploy).toContain(".github/merge-rules.json");
    expect(deploy).toMatch(/refs\/heads\/main/);
  });

  it("carries only the lists that decide review and ownership, and no lane vocabulary", () => {
    expect(Object.keys(rules).sort()).toEqual(
      [
        "version",
        "_purpose",
        "baseBranch",
        "requiredChecks",
        "_requiredChecksNote",
        "reviewRequired",
        "_reviewRequiredNote",
        "ownerOnly",
        "_ownerOnlyNote",
        "visualSurfaces",
        "_visualSurfacesNote",
        "reviewContract",
      ].sort(),
    );
  });
});

describe("containment", () => {
  it("requires review of any change to the delivery rules and their proofs", () => {
    for (const file of [
      ".github/merge-rules.json",
      ".github/workflows/ci.yml",
      ".github/workflows/deploy.yml",
      "scripts/merge/gate.mjs",
      "scripts/merge/paths.mjs",
      "scripts/mission/merge-gate.mjs",
      "scripts/mission/cli.mjs",
      "scripts/mission/lib/state.mjs",
      "tests/merge-rule.test.ts",
      "tests/merge-governance.test.ts",
      "tests/mission-state.test.ts",
      "tests/agent-harness.test.ts",
      ".claude/settings.json",
      "AGENTS.md",
      "CLAUDE.md",
      "docs/mission-harness.md",
    ]) {
      expect(reviewRequiredPaths([{ status: "M", path: file }], rules), file).not.toEqual([]);
    }
  });
});
