// @vitest-environment node
/**
 * The fast lane's governance surface (LAN-102, ADR 0017).
 *
 * `tests/fast-lane-classification.test.ts` proves the rule that decides what
 * may enter the lane. This proves the things around it that no other test would
 * notice going wrong: that the merging workflow reads the base branch and not
 * the pull request, that it never bypasses branch protection, that the required
 * checks it insists on are the ones CI actually produces, that the normal lane
 * is untouched for everything else, and that the guards which keep merge
 * capability away from agents are still there — because the whole design rests
 * on a workflow holding that authority instead of an agent.
 *
 * These read checked-in files only. No agent is launched, nothing talks to
 * GitHub, and the precedent is `tests/agent-harness.test.ts`, which exists for
 * the same reason: a rule that lives only in prose is a rule that drifts.
 *
 * Matrix rows 3, 4, 9, 10, 11 and 14.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { classifyPath, loadRules } from "../scripts/fast-lane/classify.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(path.join(repoRoot, relative), "utf8");
const flat = (text: string) => text.replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ");

const rules = loadRules();
const MERGE_WORKFLOW = ".github/workflows/fast-lane-merge.yml";
const mergeWorkflow = read(MERGE_WORKFLOW);
/**
 * The workflow with its comments removed. Several assertions below are about
 * what the workflow *does*, and a comment explaining why it never passes
 * `--admin` must not be mistaken for it passing `--admin`.
 */
const mergeWorkflowCode = mergeWorkflow
  .split("\n")
  .map((line) => line.replace(/(^|\s)#.*$/, ""))
  .join("\n");
const ci = read(".github/workflows/ci.yml");
const deploy = read(".github/workflows/deploy.yml");
const AGENTS = read("AGENTS.md");
const prTemplate = read(".github/PULL_REQUEST_TEMPLATE.md");
const fastLaneDoc = read("docs/fast-lane.md");

// ---------------------------------------------------------------------------
// Row 1 / 3 — the workflow judges with the base branch's rules, not the PR's
// ---------------------------------------------------------------------------

describe("the merging workflow cannot be rewritten by what it merges", () => {
  it("only ever runs from the default branch", () => {
    // `workflow_run`, `pull_request_target` and `workflow_dispatch` all execute
    // the default branch's copy of a workflow. A plain `pull_request` trigger
    // would execute the pull request's copy, which would let a pull request
    // rewrite the thing deciding whether to merge it.
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
      "ref: refs/fast-lane/head",
    ]) {
      expect(mergeWorkflow, `${forbidden} would execute the pull request's code`).not.toContain(
        forbidden,
      );
    }
    // Only a single checkout, so a second one cannot quietly bring the head in.
    expect(mergeWorkflow.match(/uses: actions\/checkout@/g)).toHaveLength(1);
  });

  it("agrees with the rules about which branch is the base", () => {
    expect(rules.baseBranch).toBe("main");
    expect(mergeWorkflow).toContain("ref: main");
  });

  it("runs the classifier that was checked out, from the repository root", () => {
    expect(mergeWorkflow).toMatch(/node scripts\/fast-lane\/cli\.mjs/);
    // Not from the fetched pull-request tree.
    expect(mergeWorkflow).not.toMatch(/git checkout refs\/fast-lane/);
    expect(mergeWorkflow).not.toMatch(/git switch/);
  });

  it("gates the merge on the recomputed verdict alone", () => {
    const mergeStep = /- name: Merge\n([\s\S]*?)\n      - name: /.exec(mergeWorkflow)?.[1] ?? "";
    expect(mergeStep).not.toHaveLength(0);
    expect(mergeStep).toContain("if: steps.gate.outputs.merge == 'true'");
    // No alternative route to the same step.
    expect(mergeStep).not.toMatch(/\|\|/);
    expect(mergeStep).not.toMatch(/contains\(github\.event\.pull_request\.labels/);
  });
});

// ---------------------------------------------------------------------------
// Row 10 — branch protection and the required checks are not weakened
// ---------------------------------------------------------------------------

describe("row 10 — the lane never bypasses or weakens the checks", () => {
  it("never merges with --admin, which would bypass branch protection", () => {
    expect(mergeWorkflowCode).toMatch(/gh pr merge/);
    expect(mergeWorkflowCode).not.toMatch(/--admin/);
    expect(mergeWorkflowCode).toContain("--match-head-commit");
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

  it("requires exactly the checks ci.yml produces", () => {
    // Four spaces of indent is a job's `name:`; steps are deeper, and the
    // workflow's own name is at column zero.
    const jobNames = [...ci.matchAll(/^ {4}name: (.+)$/gm)].map((match) => match[1].trim());
    expect(jobNames.length).toBeGreaterThanOrEqual(2);
    expect([...rules.requiredChecks].sort()).toEqual([...jobNames].sort());
  });

  it("watches the workflow that actually produces those checks", () => {
    expect(ci).toMatch(/^name: CI$/m);
    expect(mergeWorkflow).toMatch(/workflows: \["CI"\]/);
  });

  it("leaves CI and the deploy pipeline out of its own business", () => {
    // Neither existing workflow may learn about the fast lane; a check that
    // knows it is being fast-laned is a check that can be told to relax.
    expect(ci).not.toMatch(/fast[- ]lane/i);
    expect(deploy).not.toMatch(/fast[- ]lane/i);
    // And CI still runs on every pull request, drafts included.
    expect(ci).toMatch(/^on:\n {2}pull_request:\n/m);
    expect(ci).not.toMatch(/types: \[ready_for_review\]/);
  });

  it("asks for no more permission than merging needs", () => {
    // Six spaces of indent is the job's own `permissions:` block.
    expect(mergeWorkflowCode).toMatch(/^ {4}permissions:$/m);
    expect(mergeWorkflowCode).toMatch(/^ {6}contents: write\s*$/m);
    expect(mergeWorkflowCode).toMatch(/^ {6}pull-requests: write\s*$/m);
    expect(mergeWorkflowCode, "the lane never needs a cloud-exchangeable token").not.toMatch(
      /^ {6}id-token: write\s*$/m,
    );
    expect(mergeWorkflowCode, "no blanket write").not.toMatch(/^ {6}permissions: write-all\s*$/m);
    // The workflow-level default stays read-only.
    expect(mergeWorkflowCode).toMatch(/^permissions:\n {2}contents: read\s*$/m);
  });
});

// ---------------------------------------------------------------------------
// Row 9 — agents still cannot merge, and the guards that say so are intact
// ---------------------------------------------------------------------------

describe("row 9 — no agent gains merge capability from any of this", () => {
  const settings = JSON.parse(read(".claude/settings.json")) as {
    permissions?: { deny?: string[]; allow?: string[]; disableBypassPermissionsMode?: string };
  };
  const deny = settings.permissions?.deny ?? [];
  const harness = read("tests/agent-harness.test.ts");

  it("still denies every direct route an agent could take to a merge", () => {
    // Deliberately duplicated from tests/agent-harness.test.ts. If a future
    // change weakens these to make the fast lane easier, it fails here too —
    // next to the lane that would have been the excuse.
    for (const rule of [
      "Bash(gh pr merge *)",
      "Bash(gh pr ready *)",
      "Bash(gh api *)",
      "Bash(gh api graphql *)",
      "Bash(curl *api.github.com*)",
      "Edit(./.claude/**)",
    ]) {
      expect(deny, `${rule} is missing`).toContain(rule);
    }
    expect(settings.permissions?.allow ?? []).toEqual([
      "Bash(npx vitest *)",
      "Bash(gh pr edit * --add-label *)",
      "Bash(gh pr comment *)",
      "Bash(gh run rerun *)",
      "Bash(gh run view *)",
      "Bash(gh run list *)",
      "Bash(gh pr checks *)",
      "Bash(gh pr diff *)",
      "Bash(gh pr view *)",
    ]);
    expect(settings.permissions?.disableBypassPermissionsMode).toBe("disable");
  });

  it("still asserts, in the harness suite, that agents cannot merge or un-draft", () => {
    expect(harness).toContain("blocks merging and un-drafting a pull request");
    expect(harness).toContain('expect(deny).toContain("Bash(gh pr merge *)")');
    expect(harness).toContain('expect(deny).toContain("Bash(gh pr ready *)")');
  });

  it("keeps both guards out of reach of the lane itself", () => {
    for (const guarded of [".claude/settings.json", "tests/agent-harness.test.ts"]) {
      expect(classifyPath(guarded, rules).verdict).toBe("protected");
    }
  });

  it("puts merge authority in the workflow, and says so where an agent will read it", () => {
    expect(flat(AGENTS)).toMatch(
      /No agent merges, un-drafts a pull request, deploys, migrates hosted Supabase, or writes to production/i,
    );
    expect(flat(AGENTS)).toMatch(/a GitHub Action|the merge workflow/i);
    expect(flat(fastLaneDoc)).toMatch(/No agent (ever )?holds merge capability/i);
  });
});

// ---------------------------------------------------------------------------
// Row 11 — the normal lane is unchanged for everything else
// ---------------------------------------------------------------------------

describe("row 11 — everything ineligible keeps the workflow it already had", () => {
  it("still requires npm run verify for a repository change", () => {
    expect(flat(AGENTS)).toMatch(/npm run verify passes locally/i);
    expect(AGENTS).toMatch(/^npm run verify$/m);
  });

  it("still says pull requests are drafts and Brian merges them", () => {
    expect(flat(AGENTS)).toMatch(/Brian merges/i);
    expect(flat(AGENTS)).toMatch(/one draft pull request|pull request is a draft|draft-only/i);
  });

  it("scopes the narrowed verification to the eligible classes and no further", () => {
    const section = fastLaneSection();
    expect(flat(section)).toMatch(/normal lane/i);
    // The reconciliation must name what stays true, not merely what changes.
    expect(flat(section)).toMatch(
      /Everything else keeps the workflow it already has|remains draft-only|stays draft-only/i,
    );
    expect(flat(section)).toMatch(/tiny|small/i);
    expect(flat(section)).toMatch(/does not auto-merge|do not auto-merge|never auto-merge/i);
  });

  it("does not turn the general rule into a suggestion", () => {
    // Flattened: `npm run verify` in backticks is the same sentence as npm run
    // verify without them, and a guard that only catches one of the two spellings
    // fails on the one somebody would actually write.
    const section = flat(fastLaneSection());
    for (const softener of [
      /npm run verify is (now )?optional/i,
      /npm run verify (is )?(now )?no longer required/i,
      /npm run verify need not/i,
      /without running npm run verify/i,
      /verify is optional/i,
      /(pull requests|batches|they) need not be drafts/i,
      /(an )?agents? may merge/i,
      /at the (agent|implementer)'s discretion/i,
      /the agent decides (what|which|how much)/i,
    ]) {
      expect(section, `the fast-lane section must not say: ${softener}`).not.toMatch(softener);
    }
  });

  it("keeps a one-line application fix in the normal lane", () => {
    expect(classifyPath("src/app/page.tsx", rules).eligible).toBe(false);
    expect(flat(AGENTS)).toMatch(/regardless of (how small|line count|size)/i);
  });
});

/** The `## The fast lane` section of AGENTS.md, up to the next top-level heading. */
function fastLaneSection(): string {
  const start = AGENTS.indexOf("## The fast lane");
  expect(start, "AGENTS.md has no `## The fast lane` section").toBeGreaterThan(-1);
  const next = AGENTS.indexOf("\n## ", start + 1);
  return AGENTS.slice(start, next === -1 ? undefined : next);
}

// ---------------------------------------------------------------------------
// Rows 3 and 13 — the policy is written where agents and humans will find it
// ---------------------------------------------------------------------------

describe("the policy is stated in the working agreement, not only in JSON", () => {
  const section = () => fastLaneSection();

  it("states the eligible classes", () => {
    for (const phrase of [/documentation/i, /test/i, /agent-instruction/i]) {
      expect(flat(section())).toMatch(phrase);
    }
  });

  it("states the exclusions, including the ones that are not about paths", () => {
    for (const phrase of [
      /application/i,
      /schema|migration/i,
      /dependency/i,
      /deployment|workflow/i,
      /weakens? (valid )?coverage|removes? .{0,20}coverage/i,
      /mixed|split/i,
    ]) {
      expect(flat(section()), `the exclusions must cover ${phrase}`).toMatch(phrase);
    }
  });

  it("states the four protected governance rules", () => {
    for (const phrase of [
      /eligibility/i,
      /required verification/i,
      /merge authority|automatic-merge authority/i,
      /protection of these/i,
    ]) {
      expect(flat(section())).toMatch(phrase);
    }
  });

  it("states that an unclassifiable change fails closed into the normal lane", () => {
    expect(flat(section())).toMatch(/fails? closed/i);
    expect(flat(section())).toMatch(/absence of a rule is never permission|never defaults? to/i);
  });

  it("states that eligibility is recomputed from the diff, not from the label", () => {
    expect(flat(section())).toMatch(/re-?derive|recomput/i);
    expect(flat(section())).toMatch(/label/i);
    expect(flat(section())).toMatch(/never .{0,40}evidence|not evidence/i);
  });

  it("names the rules file, so the prose and the enforcement point at each other", () => {
    expect(section()).toContain(".github/fast-lane-rules.json");
    expect(section()).toContain("docs/fast-lane.md");
  });

  it("discloses that a fast-lane merge does not deploy", () => {
    expect(flat(fastLaneDoc)).toMatch(/does not trigger downstream workflows/i);
    expect(flat(fastLaneDoc)).toMatch(/deploy\.yml/);
    expect(flat(section())).toMatch(/deploy/i);
  });
});

// ---------------------------------------------------------------------------
// Row 14 — the audit trail
// ---------------------------------------------------------------------------

describe("row 14 — a merged batch leaves a record of why it was eligible", () => {
  it("gives the pull-request template a fast-lane block with every field", () => {
    const start = prTemplate.indexOf("## Fast lane");
    expect(start, "the template has no `## Fast lane` block").toBeGreaterThan(-1);
    const block = prTemplate.slice(start, prTemplate.indexOf("\n## ", start + 1));

    for (const field of [
      /classification/i,
      /included Linear issues/i,
      /verification/i,
      /CI result|required checks/i,
      /merge result|merged by/i,
      /exclusion|separated|split/i,
    ]) {
      expect(flat(block), `the fast-lane block must record ${field}`).toMatch(field);
    }
  });

  it("keeps the existing template sections that the fast lane does not replace", () => {
    for (const heading of [
      "## What changed, and why",
      "## How it was verified",
      "## Production handoff",
      "## Pilot data",
      "## Recovery",
      "## Limitations and residual risk",
      "## Checklist",
    ]) {
      expect(prTemplate, `${heading} is missing`).toContain(heading);
    }
    expect(prTemplate).toContain(
      "This pull request is a **draft** unless Brian said otherwise. No agent merges, un-drafts, deploys or applies a migration.",
    );
  });

  it("makes the workflow write the same record where the merge happened", () => {
    expect(mergeWorkflow).toMatch(/Classification/);
    expect(mergeWorkflow).toMatch(/Linear issues delivered/);
    expect(mergeWorkflow).toMatch(/GITHUB_STEP_SUMMARY|upload-artifact/);
    expect(mergeWorkflow).toMatch(/gh pr comment/);
  });

  it("explains a refusal on the pull request rather than in a log nobody opens", () => {
    expect(mergeWorkflow).toMatch(/Report a refusal/);
    expect(mergeWorkflow).toMatch(/stays in the normal lane/i);
  });
});

// ---------------------------------------------------------------------------
// The decision record
// ---------------------------------------------------------------------------

describe("the decision is recorded and indexed", () => {
  const adr = read("docs/adr/0017-batched-fast-lane.md");
  const index = read("docs/adr/README.md");

  it("records the constraint this places on future work", () => {
    for (const clause of [
      /re-?derive[sd]? eligibility from the diff/i,
      /never .{0,60}label/i,
      /fail(s)? closed/i,
      /cannot widen itself|cannot modify (them|it)sel(ves|f)/i,
      /no agent .{0,40}merge/i,
    ]) {
      expect(flat(adr), `ADR 0017 must record ${clause}`).toMatch(clause);
    }
  });

  it("is indexed", () => {
    expect(index).toContain("[0017](0017-batched-fast-lane.md)");
  });

  it("names the owner actions rather than assuming them", () => {
    for (const phrase of [
      /workflow permissions/i,
      /branch protection/i,
      /linear/i,
      /squash/i,
      /label/i,
    ]) {
      expect(flat(fastLaneDoc), `docs/fast-lane.md must cover ${phrase}`).toMatch(phrase);
    }
  });
});
