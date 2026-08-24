// @vitest-environment node
/**
 * The fast lane's merge gate (LAN-102, ADR 0017).
 *
 * Eligibility says whether the diff may travel through the lane. This says
 * whether this pull request, right now, may be merged — and the rule that
 * matters most is the boring one: a check that did not run is not a check that
 * passed. GitHub reports queued, in-progress, skipped, cancelled, neutral,
 * stale, timed-out and action-required outcomes, and every one of them is a
 * refusal here.
 *
 * Matrix rows 1, 7 and 12.
 */
import { describe, expect, it } from "vitest";

import { evaluateGate, linearIssues, normaliseCheck } from "../scripts/fast-lane/gate.mjs";
import { classify, loadRules } from "../scripts/fast-lane/classify.mjs";

const rules = loadRules();

const HEAD = "1111111111111111111111111111111111111111";

const eligibleVerdict = classify(
  { files: [{ status: "M", path: "docs/pilot-data-runbook.md" }] },
  rules,
);

type CheckRun = { name: string; status: string; conclusion: string | null; head_sha: string };

const green = (): CheckRun[] =>
  (rules.requiredChecks as string[]).map((name) => ({
    name,
    status: "completed",
    conclusion: "success" as string | null,
    head_sha: HEAD,
  }));

const openPullRequest = (overrides: Record<string, unknown> = {}) => ({
  number: 12,
  state: "OPEN",
  isDraft: true,
  isCrossRepository: false,
  baseRefName: "main",
  headRefOid: HEAD,
  mergeable: "MERGEABLE",
  labels: [{ name: "fast-lane" }],
  title: "Fast lane batch",
  body: "Closes LAN-100.",
  ...overrides,
});

const gate = (overrides: Record<string, unknown> = {}, checkRuns = green()) =>
  evaluateGate({
    verdict: eligibleVerdict,
    pullRequest: openPullRequest(overrides),
    checkRuns,
    rules,
  });

describe("the happy path exists", () => {
  it("merges an eligible, labelled, open pull request with every required check green", () => {
    const result = gate();
    expect(result.reasons).toEqual([]);
    expect(result.merge).toBe(true);
    expect(result.issues).toEqual(["LAN-100"]);
  });

  it("merges a draft, because agents open drafts and never un-draft them", () => {
    // The workflow marks it ready, after this gate has said yes. That is the
    // whole reason no agent needs merge or un-draft capability.
    expect(gate({ isDraft: true }).merge).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Row 7 — every required check, in every non-success state
// ---------------------------------------------------------------------------

describe("row 7 — merge only after all required checks pass", () => {
  it("requires the checks that ci.yml actually produces", () => {
    expect(rules.requiredChecks.length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ["queued", { status: "queued", conclusion: null }],
    ["in progress", { status: "in_progress", conclusion: null }],
    ["completed with failure", { status: "completed", conclusion: "failure" }],
    ["completed with neutral", { status: "completed", conclusion: "neutral" }],
    ["completed with cancelled", { status: "completed", conclusion: "cancelled" }],
    ["completed with skipped", { status: "completed", conclusion: "skipped" }],
    ["completed with timed_out", { status: "completed", conclusion: "timed_out" }],
    ["completed with action_required", { status: "completed", conclusion: "action_required" }],
    ["completed with stale", { status: "completed", conclusion: "stale" }],
    ["completed with no conclusion at all", { status: "completed", conclusion: null }],
  ])("refuses when a required check is %s", (_label, state) => {
    for (const required of rules.requiredChecks as string[]) {
      const checks = green().map((check) =>
        check.name === required ? { ...check, ...state } : check,
      );
      const result = gate({}, checks);
      expect(result.merge, `${required} ${_label} must block`).toBe(false);
      expect(result.reasons.join(" ")).toContain(required);
    }
  });

  it("refuses when a required check never reported", () => {
    for (const required of rules.requiredChecks as string[]) {
      const checks = green().filter((check) => check.name !== required);
      const result = gate({}, checks);
      expect(result.merge).toBe(false);
      expect(result.reasons.join(" ")).toMatch(/did not run is not a check that passed/i);
    }
  });

  it("refuses when no check reported at all", () => {
    expect(gate({}, []).merge).toBe(false);
  });

  it("refuses a green check that belongs to an older commit", () => {
    const stale = green().map((check) => ({ ...check, head_sha: "0".repeat(40) }));
    const result = gate({}, stale);
    expect(result.merge).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/other than the head/i);
  });

  it("requires every occurrence of a duplicated check to have passed", () => {
    // A re-run that succeeded does not paper over a run that did not.
    const both = [...green(), { ...green()[0], conclusion: "failure" }];
    expect(gate({}, both).merge).toBe(false);
  });

  it("ignores checks that are not required, however they concluded", () => {
    const withNoise = [
      ...green(),
      { name: "some-optional-linter", status: "completed", conclusion: "failure", head_sha: HEAD },
    ];
    expect(gate({}, withNoise).merge).toBe(true);
  });

  it("normalises legacy commit statuses as well as check runs", () => {
    expect(normaliseCheck({ context: "ci/legacy", state: "SUCCESS", sha: HEAD })).toEqual({
      name: "ci/legacy",
      status: "completed",
      conclusion: "success",
      headSha: HEAD,
    });
  });
});

// ---------------------------------------------------------------------------
// Row 1 — the label is a conjunct, never a substitute for the diff
// ---------------------------------------------------------------------------

describe("row 1 — the label expresses intent and proves nothing", () => {
  const ineligibleVerdict = classify({ files: [{ status: "M", path: "src/app/page.tsx" }] }, rules);

  it("refuses a labelled pull request whose diff is ineligible", () => {
    const result = evaluateGate({
      verdict: ineligibleVerdict,
      pullRequest: openPullRequest({ labels: [{ name: "fast-lane" }] }),
      checkRuns: green(),
      rules,
    });
    expect(result.merge).toBe(false);
    expect(result.reasons.join(" ")).toContain("src/app/page.tsx");
  });

  it("refuses an eligible pull request that never asked for the lane", () => {
    expect(gate({ labels: [] }).merge).toBe(false);
    expect(gate({ labels: [{ name: "docs" }] }).merge).toBe(false);
  });

  it("refuses when the verdict is missing entirely", () => {
    const result = evaluateGate({
      verdict: undefined,
      pullRequest: openPullRequest(),
      checkRuns: green(),
      rules,
    });
    expect(result.merge).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Everything else that must be true of the pull request itself
// ---------------------------------------------------------------------------

describe("the pull request must be mergeable in its own right", () => {
  it.each([
    ["closed", { state: "CLOSED" }],
    ["merged", { state: "MERGED" }],
    ["targeting another branch", { baseRefName: "some-feature" }],
    ["from a fork", { isCrossRepository: true }],
    ["conflicting", { mergeable: "CONFLICTING" }],
    ["of unknown mergeability", { mergeable: "UNKNOWN" }],
    ["without a head commit", { headRefOid: null }],
  ])("refuses a pull request that is %s", (_label, overrides) => {
    expect(gate(overrides).merge).toBe(false);
  });

  it("refuses when no pull request was resolved at all", () => {
    const result = evaluateGate({
      verdict: eligibleVerdict,
      pullRequest: null,
      checkRuns: green(),
      rules,
    });
    expect(result.merge).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Row 12 — a batch names the issues it delivers
// ---------------------------------------------------------------------------

describe("row 12 — a batch pull request names every issue it delivers", () => {
  it("collects an issue only where the text instructs it to close", () => {
    expect(linearIssues("Batch\n\nCloses LAN-100. Fixes LAN-99. Resolves LAN-98.")).toEqual([
      "LAN-100",
      "LAN-98",
      "LAN-99",
    ]);
    // One keyword may govern a comma-separated run, which is how a four-issue
    // batch is actually written.
    expect(linearIssues("Closes LAN-97, LAN-98 and LAN-99")).toEqual([
      "LAN-97",
      "LAN-98",
      "LAN-99",
    ]);
  });

  it("does not treat a passing mention as a delivery", () => {
    // Found on the real LAN-100 batch: its body explains that LAN-99 is the fix
    // half and is NOT in the pull request, and names LAN-102 as the lane that
    // will carry it. Scraping bare identifiers reported all three as delivered,
    // which would have put a false claim in the merge comment.
    const body = [
      "Closes LAN-100.",
      "LAN-99 is the fix half and is not in this pull request.",
      "It cannot be processed until LAN-102 merges.",
      "See also LAN-93.",
    ].join("\n");
    expect(linearIssues(body)).toEqual(["LAN-100"]);
  });

  it("refuses a batch that only mentions issues without instructing a close", () => {
    const result = gate({ title: "Batch", body: "Related to LAN-97 and LAN-98." });
    expect(result.merge).toBe(false);
    expect(result.issues).toEqual([]);
    expect(result.reasons.join(" ")).toMatch(/names no Linear issue/i);
  });

  it("refuses a batch that names no issue, because it would close none", () => {
    const result = gate({ title: "docs tidy-up", body: "no ticket" });
    expect(result.merge).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/names no Linear issue/i);
  });

  it("reports all four issues of a full batch for the audit trail", () => {
    const result = gate({
      body: "Closes LAN-97, LAN-98, LAN-99 and LAN-100.",
    });
    expect(result.issues).toEqual(["LAN-100", "LAN-97", "LAN-98", "LAN-99"]);
    expect(result.merge).toBe(true);
  });

  it("does not let naming issues rescue an ineligible diff", () => {
    const result = evaluateGate({
      verdict: classify({ files: [{ status: "M", path: "package.json" }] }, rules),
      pullRequest: openPullRequest({ body: "Closes LAN-97, LAN-98, LAN-99, LAN-100." }),
      checkRuns: green(),
      rules,
    });
    expect(result.merge).toBe(false);
  });
});
