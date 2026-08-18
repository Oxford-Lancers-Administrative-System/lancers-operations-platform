// @vitest-environment node
/**
 * The mission lane's governance surface (Mission Harness v1, ADR 0027).
 *
 * `tests/mission-gate.test.ts` proves the gate that decides whether a mission
 * pull request may merge. This proves the things around it that no other test
 * would notice going wrong: that the merging workflow reads the base branch
 * and never the pull request, that it never bypasses branch protection, that
 * the required checks are the ones CI actually produces, that agents still
 * hold no merge capability, and that neither automatic lane can reach the
 * mission lane's own machinery. The precedent and structure are
 * `tests/fast-lane-governance.test.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { classifyPath, loadRules as loadFastLaneRules } from "../scripts/fast-lane/classify.mjs";
import { loadRules as loadMissionRules, prohibitedPaths } from "../scripts/mission/merge-gate.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(path.join(repoRoot, relative), "utf8");

const missionRules = loadMissionRules();
const fastLaneRules = loadFastLaneRules();
const MERGE_WORKFLOW = ".github/workflows/mission-merge.yml";
const mergeWorkflow = read(MERGE_WORKFLOW);
/** The workflow with comments removed, so prose about `--admin` is not code. */
const mergeWorkflowCode = mergeWorkflow
  .split("\n")
  .map((line) => line.replace(/(^|\s)#.*$/, ""))
  .join("\n");
const ci = read(".github/workflows/ci.yml");
const deploy = read(".github/workflows/deploy.yml");

describe("the mission-merge workflow cannot be rewritten by what it merges", () => {
  it("only ever runs from the default branch", () => {
    const triggers = /\non:\n([\s\S]*?)\nconcurrency:/.exec(mergeWorkflow)?.[1] ?? "";
    expect(triggers).not.toHaveLength(0);
    expect(triggers).toMatch(/^ {2}workflow_run:/m);
    expect(triggers).toMatch(/^ {2}pull_request_target:/m);
    expect(triggers).toMatch(/^ {2}workflow_dispatch:/m);
    expect(
      triggers,
      "a plain `pull_request` trigger would run the pull request's copy",
    ).not.toMatch(/^ {2}pull_request:/m);
  });

  it("checks out the base branch and never the pull request's head", () => {
    expect(mergeWorkflow).toMatch(/uses: actions\/checkout@v\d+[\s\S]*?ref: main/);
    for (const forbidden of [
      "ref: ${{ github.event.pull_request.head.sha }}",
      "ref: ${{ github.event.pull_request.head.ref }}",
      "ref: ${{ github.event.workflow_run.head_sha }}",
      "ref: ${{ github.event.workflow_run.head_branch }}",
      "ref: refs/mission/head",
    ]) {
      expect(mergeWorkflow, `${forbidden} would execute the pull request's code`).not.toContain(
        forbidden,
      );
    }
    expect(mergeWorkflow.match(/uses: actions\/checkout@/g)).toHaveLength(1);
  });

  it("fetches the pull request's objects but never checks them out or executes them", () => {
    expect(mergeWorkflow).toContain('git fetch --no-tags origin "pull/$PR/head:refs/mission/head"');
    expect(mergeWorkflow).not.toMatch(/git checkout refs\/mission/);
    expect(mergeWorkflow).not.toMatch(/git switch/);
    expect(mergeWorkflow).toMatch(/node scripts\/mission\/gate-cli\.mjs/);
  });

  it("agrees with its rules about the base branch and gates on the recomputed verdict alone", () => {
    expect(missionRules.baseBranch).toBe("main");
    expect(mergeWorkflow).toContain("ref: main");
    const mergeStep = /- name: Merge\n([\s\S]*?)\n {6}- name: /.exec(mergeWorkflow)?.[1] ?? "";
    expect(mergeStep).not.toHaveLength(0);
    expect(mergeStep).toContain("if: steps.gate.outputs.merge == 'true'");
    expect(mergeStep).not.toMatch(/contains\(github\.event\.pull_request\.labels/);
  });
});

describe("the mission lane never bypasses or weakens the checks", () => {
  it("never merges with --admin, and fences the head commit", () => {
    expect(mergeWorkflowCode).toMatch(/gh pr merge/);
    expect(mergeWorkflowCode).not.toMatch(/--admin/);
    expect(mergeWorkflowCode).toContain("--match-head-commit");
  });

  it("restores the draft when a merge fails, because no agent can re-draft", () => {
    expect(mergeWorkflow).toContain('gh pr ready "$PR" --repo "$REPO" --undo');
    expect(mergeWorkflow).toMatch(/Restoring the draft state/);
  });

  it("never touches repository settings, rulesets or branch protection", () => {
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
      expect(mergeWorkflow, `${forbidden} is out of bounds for this workflow`).not.toContain(
        forbidden,
      );
    }
  });

  it("requires exactly the checks ci.yml produces, and watches the CI workflow", () => {
    const jobNames = [...ci.matchAll(/^ {4}name: (.+)$/gm)].map((match) => match[1].trim());
    expect(jobNames.length).toBeGreaterThanOrEqual(2);
    expect([...missionRules.requiredChecks].sort()).toEqual([...jobNames].sort());
    expect(ci).toMatch(/^name: CI$/m);
    expect(mergeWorkflow).toMatch(/workflows: \["CI"\]/);
  });

  it("leaves CI and the deploy pipeline out of its own business", () => {
    expect(ci).not.toMatch(/mission[- ]merge/i);
    expect(deploy).not.toMatch(/mission[- ]merge/i);
    expect(ci).toMatch(/^on:\n {2}pull_request:\n/m);
    expect(ci).not.toMatch(/types: \[ready_for_review\]/);
  });

  it("asks for no more permission than merging needs", () => {
    expect(mergeWorkflowCode).toMatch(/^ {4}permissions:$/m);
    expect(mergeWorkflowCode).toMatch(/^ {6}contents: write\s*$/m);
    expect(mergeWorkflowCode).toMatch(/^ {6}pull-requests: write\s*$/m);
    expect(mergeWorkflowCode, "the lane never needs a cloud-exchangeable token").not.toMatch(
      /^ {6}id-token: write\s*$/m,
    );
    expect(mergeWorkflowCode, "no blanket write").not.toMatch(/^ {6}permissions: write-all\s*$/m);
    expect(mergeWorkflowCode).toMatch(/^permissions:\n {2}contents: read\s*$/m);
  });

  it("discloses that a mission merge does not deploy, and points at the drift report", () => {
    expect(mergeWorkflow).toMatch(/does not trigger downstream workflows/);
    expect(mergeWorkflow).toMatch(/deploy\.yml/);
    expect(mergeWorkflow).toMatch(/gh workflow run deploy\.yml/);
    expect(mergeWorkflow).toMatch(/checkpoint reports this drift/);
  });
});

describe("no agent gains merge capability from the mission lane", () => {
  const settings = JSON.parse(read(".claude/settings.json")) as {
    permissions?: { deny?: string[]; allow?: string[] };
  };
  const deny = settings.permissions?.deny ?? [];

  it("still denies every direct route an agent could take to a merge", () => {
    // Deliberately duplicated from tests/agent-harness.test.ts and
    // tests/fast-lane-governance.test.ts: whichever lane a weakening tries to
    // travel through, a test fails beside it.
    for (const rule of [
      "Bash(gh pr merge *)",
      "Bash(gh pr ready *)",
      "Bash(gh api *)",
      "Bash(gh api graphql *)",
      "Bash(gh workflow run *)",
      "Bash(curl *api.github.com*)",
      "Edit(./.claude/**)",
    ]) {
      expect(deny, `${rule} is missing`).toContain(rule);
    }
  });

  it("keeps applying the label as the only ask an agent can make", () => {
    // `gh pr edit * --add-label *` is allowed; everything that would let an
    // agent act on its own label is denied above. The label asks; the
    // workflow answers.
    expect(settings.permissions?.allow ?? []).toContain("Bash(gh pr edit * --add-label *)");
    expect(missionRules.optInLabel).toBe("mission-merge");
  });
});

describe("neither automatic lane can reach the mission lane's machinery", () => {
  it("keeps the mission control plane protected from the fast lane", () => {
    for (const guarded of [
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
      expect(classifyPath(guarded, fastLaneRules).verdict, guarded).toBe("protected");
    }
  });

  it("keeps the mission lane's own machinery prohibited from the mission lane", () => {
    for (const guarded of [
      ".github/mission-merge-rules.json",
      ".github/workflows/mission-merge.yml",
      "scripts/mission/merge-gate.mjs",
      "tests/mission-gate.test.ts",
      "tests/agent-harness.test.ts",
      ".claude/settings.json",
      "docs/mission-harness.md",
      "docs/adr/0027-mission-harness.md",
    ]) {
      const reasons = prohibitedPaths([{ status: "M", path: guarded }], missionRules);
      expect(reasons.length, `${guarded} must be prohibited`).toBeGreaterThan(0);
    }
  });

  it("records the decision, indexes it, and states the policy where humans read it", () => {
    const flat = (text: string) => text.replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ");
    const adr = flat(read("docs/adr/0027-mission-harness.md"));
    for (const clause of [
      /re-derives every server-verifiable conjunct from evidence/i,
      /does not deploy/i,
      /cannot widen itself/i,
      /standard application work at low or normal risk only/i,
      /migrations, RLS\/auth\/security, secrets, deployment/i,
      /synthetic rehearsals only/i,
      /never --admin/i,
    ]) {
      expect(adr, `ADR 0027 must record ${clause}`).toMatch(clause);
    }
    expect(read("docs/adr/README.md")).toContain("[0027](0027-mission-harness.md)");
    const runbook = flat(read("docs/mission-harness.md"));
    for (const clause of [
      /\/run-mission M-<mission-id>/,
      /gh workflow run deploy\.yml/,
      /mission merge does not deploy/i,
      /Create the mission-merge label/i,
      /Always Brian's, never autonomous/i,
      /journal\.ndjson/,
      /usage-exhausted/,
    ]) {
      expect(runbook, `the runbook must cover ${clause}`).toMatch(clause);
    }
    const agreement = flat(read("AGENTS.md"));
    expect(agreement).toMatch(/Exactly two user-invoked workflows and two subagents are approved/i);
    expect(agreement).toMatch(
      /No agent merges, un-drafts a pull request, deploys, migrates hosted Supabase, or writes to production/i,
    );
    expect(agreement).toMatch(
      /mission merge performed with GITHUB_TOKEN deliberately does not deploy/i,
    );
  });

  it("prohibits every owner-gated surface class from the mission lane", () => {
    for (const surface of [
      "supabase/migrations/20260901000000_x.sql",
      "supabase/config.toml",
      "src/proxy.ts",
      "src/lib/supabase/server.ts",
      "src/lib/db/runtime-target.ts",
      "src/app/login/page.tsx",
      "src/app/auth/recovery/route.ts",
      "Dockerfile",
      "package-lock.json",
      ".env.example",
    ]) {
      const reasons = prohibitedPaths([{ status: "M", path: surface }], missionRules);
      expect(reasons.length, `${surface} must be prohibited`).toBeGreaterThan(0);
    }
  });
});
