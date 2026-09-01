// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadRules, prohibitedPaths } from "../scripts/merge/gate.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const workflow = read(".github/workflows/merge.yml");
const code = workflow
  .split("\n")
  .map((line) => line.replace(/(^|\s)#.*$/, ""))
  .join("\n");
const ci = read(".github/workflows/ci.yml");
const deploy = read(".github/workflows/deploy.yml");
const rules = loadRules();

const WORKFLOWS = ["ci.yml", "deploy.yml", "merge.yml"];

describe("merge authority", () => {
  // LAN-209. The whole failure this replaces was two near-identical workflows
  // reconstructing a signal GitHub gives for free, and defeating it on the way.
  it("has exactly one merge workflow, and neither deleted lane survives", () => {
    expect(readdirSync(path.join(root, ".github", "workflows")).sort()).toEqual(WORKFLOWS.sort());
  });

  it("never lifts a draft and never merges: it enables GitHub's own auto-merge", () => {
    expect(code).not.toMatch(/gh pr ready/);
    expect(code).toMatch(/gh pr merge "\$PR" --repo "\$REPO" --auto --squash/);
    expect(code.match(/gh pr merge/g)).toHaveLength(1);
    expect(code).not.toMatch(/--admin/);
    expect(code).not.toMatch(/--match-head-commit/);
  });

  it("stops on a draft before it does anything else", () => {
    const read_step = /- name: Read the pull request and its diff\n([\s\S]*?)\n {6}- name: /.exec(
      workflow,
    )?.[1];
    expect(read_step).toBeTruthy();
    expect(read_step).toContain('if [ "$(jq -r .isDraft pr.json)" = "true" ]; then');
    const enable = /- name: Enable auto-merge\n([\s\S]*?)\n {6}- name: /.exec(workflow)?.[1] ?? "";
    expect(enable).toContain("if: steps.gate.outputs.auto_merge == 'true'");
  });

  it("executes only the trusted base-branch gate, never pull-request code", () => {
    const triggers = /\non:\n([\s\S]*?)\nconcurrency:/.exec(workflow)?.[1] ?? "";
    expect(triggers).toMatch(/^ {2}pull_request_target:/m);
    expect(triggers).toMatch(/^ {4}types: \[ready_for_review\]/m);
    expect(triggers).toMatch(/^ {2}workflow_run:/m);
    expect(triggers).toMatch(/^ {2}workflow_dispatch:/m);
    expect(triggers).not.toMatch(/^ {2}pull_request:/m);
    expect(workflow).toMatch(/uses: actions\/checkout@v\d+[\s\S]*?ref: main/);
    expect(workflow.match(/uses: actions\/checkout@/g)).toHaveLength(1);
    expect(workflow).toContain('git fetch --no-tags origin "pull/$PR/head:refs/merge/head"');
    expect(workflow).not.toMatch(/git (checkout refs\/merge|switch)/);
    expect(workflow).toMatch(/node scripts\/merge\/gate-cli\.mjs/);
  });

  it("makes the recomputed verdict the only condition, with no label anywhere", () => {
    expect(code).not.toMatch(/contains\(github\.event\.pull_request\.labels/);
    for (const label of ["fast-lane", "mission-merge"]) {
      expect(workflow, label).not.toContain(label);
    }
  });

  // Acceptance criterion 3 is "receives ONE comment saying so", and two triggers
  // can reach the same pull request while a prohibited path never resolves
  // itself. The dedup is the only part of that criterion expressible statically.
  it("says the prohibited-path refusal exactly once", () => {
    const step = /- name: Say once that Brian merges this\n([\s\S]*?)\n {6}- name: /.exec(
      workflow,
    )?.[1];
    expect(step).toBeTruthy();
    expect(step).toContain("MARKER:");
    expect(step).toContain("<!-- merge-rule:prohibited -->");
    // It reads the existing comments, compares against the marker, and leaves
    // without posting when it has already spoken.
    expect(step).toMatch(/gh pr view "\$PR" --repo "\$REPO" --json comments/);
    expect(step).toMatch(/if \[ "\$SAID" != "0" \]; then[\s\S]*?exit 0/);
    // The marker is written into the body it posts, or the next run cannot find it.
    expect(step).toMatch(/echo "\$MARKER"/);
    expect(step).toContain("if: steps.gate.outputs.prohibited == 'true'");
    expect(step).toMatch(/gh pr comment "\$PR"/);
    expect(step, "the refusal comment must never merge or un-draft").not.toMatch(
      /gh pr (merge|ready)/,
    );
  });

  it("cannot rewrite the repository protection it depends on", () => {
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
    expect(ci).not.toMatch(/types: \[ready_for_review\]/);
    expect(deploy).toMatch(/^on:\n {2}workflow_dispatch:/m);
  });

  it("has only the permissions it needs, and no write it does not use", () => {
    expect(code).toMatch(/^permissions:\n {2}contents: read\s*$/m);
    expect(code).toMatch(/^ {4}permissions:$/m);
    expect(code).toMatch(/^ {6}contents: write\s*$/m);
    expect(code).toMatch(/^ {6}pull-requests: write\s*$/m);
    expect(code).not.toMatch(/^ {6}id-token: write|permissions: write-all\s*$/m);
  });
});

describe("containment", () => {
  it("prohibits the merge rule from changing its own authority", () => {
    for (const file of [
      ".github/merge-rules.json",
      ".github/workflows/merge.yml",
      ".github/workflows/ci.yml",
      "scripts/merge/gate.mjs",
      "scripts/merge/paths.mjs",
      "scripts/merge/checks.mjs",
      "scripts/merge/gate-cli.mjs",
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
      expect(prohibitedPaths([{ status: "M", path: file }], rules), file).not.toEqual([]);
    }
  });

  it("carries no eligibility classifier, no receipt and no lane vocabulary", () => {
    expect(Object.keys(rules).sort()).toEqual(
      [
        "version",
        "_purpose",
        "baseBranch",
        "requiredChecks",
        "_requiredChecksNote",
        "prohibited",
        "_prohibitedNote",
        "visualSurfaces",
        "_visualSurfacesNote",
        "reviewContract",
      ].sort(),
    );
  });
});
