// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { classifyPath, loadRules } from "../scripts/fast-lane/classify.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const rules = loadRules();
const workflow = read(".github/workflows/fast-lane-merge.yml");
const code = workflow
  .split("\n")
  .map((line) => line.replace(/(^|\s)#.*$/, ""))
  .join("\n");
const ci = read(".github/workflows/ci.yml");
const deploy = read(".github/workflows/deploy.yml");

describe("fast-lane merge authority", () => {
  it("executes only the trusted base-branch classifier, never pull-request code", () => {
    const triggers = /\non:\n([\s\S]*?)\nconcurrency:/.exec(workflow)?.[1] ?? "";
    expect(triggers).toMatch(/^ {2}workflow_run:/m);
    expect(triggers).toMatch(/^ {2}pull_request_target:/m);
    expect(triggers).toMatch(/^ {2}workflow_dispatch:/m);
    expect(triggers).not.toMatch(/^ {2}pull_request:/m);
    expect(workflow).toMatch(/uses: actions\/checkout@v\d+[\s\S]*?ref: main/);
    expect(workflow.match(/uses: actions\/checkout@/g)).toHaveLength(1);
    expect(workflow).toMatch(/node scripts\/fast-lane\/cli\.mjs/);
    expect(workflow).not.toMatch(/git (checkout refs\/fast-lane|switch)/);
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
    expect([...rules.requiredChecks].sort()).toEqual(jobs.sort());
    expect(ci).toMatch(/^name: CI$/m);
    expect(workflow).toMatch(/workflows: \["CI"\]/);
    expect(ci).toMatch(/^on:\n {2}pull_request:\n/m);
    expect(ci).not.toMatch(/fast[- ]lane|types: \[ready_for_review\]/i);
    expect(deploy).not.toMatch(/fast[- ]lane/i);
  });

  it("has only the permissions required to perform its guarded merge", () => {
    expect(code).toMatch(/^permissions:\n {2}contents: read\s*$/m);
    expect(code).toMatch(/^ {4}permissions:$/m);
    expect(code).toMatch(/^ {6}contents: write\s*$/m);
    expect(code).toMatch(/^ {6}pull-requests: write\s*$/m);
    expect(code).not.toMatch(/^ {6}id-token: write|permissions: write-all\s*$/m);
  });
});

describe("fast-lane containment and audit", () => {
  it("keeps the authority guard and classifier protected from the lane", () => {
    for (const file of [
      ".claude/settings.json",
      "tests/agent-harness.test.ts",
      ".github/fast-lane-rules.json",
      ".github/workflows/fast-lane-merge.yml",
      "scripts/fast-lane/classify.mjs",
      "scripts/fast-lane/cli.mjs",
      "tests/fast-lane-classification.test.ts",
      "tests/fast-lane-gate.test.ts",
      "tests/fast-lane-governance.test.ts",
    ]) {
      expect(classifyPath(file, rules).verdict, file).toBe("protected");
    }
  });

  it("records its classification and delivered issues with the merge", () => {
    const template = read(".github/PULL_REQUEST_TEMPLATE.md");
    const start = template.indexOf("## Fast lane");
    const block = template.slice(start, template.indexOf("\n## ", start + 1));
    expect(start).toBeGreaterThan(-1);
    for (const field of [
      /classification/i,
      /included Linear issues/i,
      /verification/i,
      /CI result|required checks/i,
      /merge result|merged by/i,
      /exclusion|separated|split/i,
    ]) {
      expect(block, String(field)).toMatch(field);
    }
    expect(workflow).toMatch(/Classification/);
    expect(workflow).toMatch(/Linear issues delivered/);
    expect(workflow).toMatch(/GITHUB_STEP_SUMMARY|upload-artifact/);
    expect(workflow).toMatch(/gh pr comment/);
  });

  it("reports refusals on the pull request", () => {
    expect(workflow).toMatch(/Report a refusal/);
    expect(workflow).toMatch(/stays in the normal lane/i);
  });
});
