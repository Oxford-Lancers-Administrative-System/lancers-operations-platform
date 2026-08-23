import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  evaluateMissionGate,
  extractReceipt,
  journalConjuncts,
  loadRules,
  prohibitedPaths,
  receiptDefects,
  touchesVisualSurface,
} from "../scripts/mission/merge-gate.mjs";
import { reduce } from "../scripts/mission/lib/state.mjs";

const rules = loadRules();
const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);

const receipt = (overrides: object = {}) => ({
  mission_id: "M-SYNTHETIC-REHEARSAL",
  package_id: "WP-events-filter",
  linear_issue_id: "LAN-901",
  risk_class: "normal",
  review_mode: "full",
  full_review_sha: HEAD,
  reviewed_head_sha: HEAD,
  review_result: "clear",
  visual: "approved",
  open_owner_questions: 0,
  ...overrides,
});

const bodyWith = (value: object) =>
  `Delivers WP-events-filter.\n\n\`\`\`mission-merge-receipt\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;

const pullRequest = (overrides: object = {}) => ({
  state: "OPEN",
  baseRefName: "main",
  isCrossRepository: false,
  labels: [{ name: "mission-merge" }],
  mergeable: "MERGEABLE",
  headRefOid: HEAD,
  body: bodyWith(receipt()),
  ...overrides,
});

const greenChecks = (sha = HEAD) =>
  rules.requiredChecks.map((name: string) => ({
    name,
    status: "completed",
    conclusion: "success",
    head_sha: sha,
  }));

const appFiles = [{ status: "M", path: "src/app/events/page.tsx" }];

const gate = (overrides: object = {}) =>
  evaluateMissionGate({
    pullRequest: pullRequest(),
    checkRuns: greenChecks(),
    files: appFiles,
    rules,
    ...overrides,
  });

describe("the guarded mission merge gate", () => {
  it("merges a qualifying pull request: labelled, mergeable, clean surfaces, coherent receipt, green checks at head", () => {
    const verdict = gate();
    expect(verdict.reasons).toEqual([]);
    expect(verdict.merge).toBe(true);
    expect(verdict.receipt?.package_id).toBe("WP-events-filter");
  });

  it("refuses a closed PR, a non-main base, a fork, a missing label, and an unknown mergeable state", () => {
    expect(gate({ pullRequest: pullRequest({ state: "MERGED" }) }).merge).toBe(false);
    expect(gate({ pullRequest: pullRequest({ baseRefName: "develop" }) }).merge).toBe(false);
    expect(gate({ pullRequest: pullRequest({ isCrossRepository: true }) }).merge).toBe(false);
    expect(gate({ pullRequest: pullRequest({ labels: [] }) }).merge).toBe(false);
    const unknown = gate({ pullRequest: pullRequest({ mergeable: "UNKNOWN" }) });
    expect(unknown.merge).toBe(false);
    expect(unknown.reasons.join("\n")).toMatch(/mergeable=UNKNOWN/);
  });

  it("refuses an empty diff and every prohibited surface, judging renames on both names", () => {
    expect(gate({ files: [] }).reasons.join("\n")).toMatch(/diff is empty/i);
    for (const file of [
      "supabase/migrations/20260818000000_new_table.sql",
      ".github/workflows/mission-merge.yml",
      ".github/mission-merge-rules.json",
      ".claude/skills/run-mission/SKILL.md",
      "scripts/mission/merge-gate.mjs",
      "scripts/fast-lane/gate.mjs",
      "package.json",
      "Dockerfile",
      "docs/adr/0027-mission-harness.md",
      "docs/mission-harness.md",
      "AGENTS.md",
      "tests/agent-harness.test.ts",
      "tests/fast-lane-governance.test.ts",
      "tests/mission-gate.test.ts",
      "src/proxy.ts",
      "src/lib/supabase/admin.ts",
      "src/lib/db/url.ts",
      "src/app/login/page.tsx",
      ".env.example",
      "vitest.config.ts",
    ]) {
      const verdict = gate({ files: [{ status: "M", path: file }] });
      expect(verdict.merge).toBe(false);
      expect(verdict.reasons.join("\n")).toContain("prohibited surface");
    }
    const renamed = gate({
      files: [{ status: "R", path: "src/app/events/list.tsx", previousPath: "src/proxy.ts" }],
    });
    expect(renamed.merge).toBe(false);
  });

  it("allows ordinary application work through the prohibited-path scan", () => {
    expect(
      prohibitedPaths(
        [
          { status: "M", path: "src/app/events/page.tsx" },
          { status: "A", path: "src/lib/events/filters.ts" },
          { status: "A", path: "src/lib/events/filters.test.ts" },
          { status: "M", path: "tests/slice-walkthrough.test.ts" },
        ],
        rules,
      ),
    ).toEqual([]);
  });

  it("refuses a missing, ambiguous, or malformed receipt", () => {
    expect(
      gate({ pullRequest: pullRequest({ body: "no receipt here" }) }).reasons.join("\n"),
    ).toMatch(/No mission-merge receipt/);
    const doubled = bodyWith(receipt()) + bodyWith(receipt());
    expect(extractReceipt(doubled, rules)).toBeNull();
    expect(extractReceipt("```mission-merge-receipt\nnot json\n```", rules)).toBeNull();
    expect(extractReceipt(bodyWith(receipt()), rules)?.review_result).toBe("clear");
  });

  it("refuses a stale receipt SHA — the head moved after review", () => {
    const verdict = gate({ pullRequest: pullRequest({ headRefOid: OTHER }) });
    expect(verdict.merge).toBe(false);
    expect(verdict.reasons.join("\n")).toMatch(/head moved after review/);
  });

  it("refuses a blocked review, an uncheckpointed highest-risk claim, and open owner questions", () => {
    expect(receiptDefects(receipt({ review_result: "blocked" })).join("\n")).toMatch(/not "clear"/);
    // LAN-148 §F: highest risk is not refused for being highest risk. It is
    // refused for not citing the checkpoint at which Brian heard about it.
    expect(receiptDefects(receipt({ risk_class: "highest" })).join("\n")).toMatch(
      /may travel this lane only when it cites the answered owner question/,
    );
    expect(
      receiptDefects(
        receipt({
          risk_class: "highest",
          owner_decision: {
            question_id: "Q-authorization-rule",
            answered_by: "Brian",
            date: "2026-08-22",
          },
        }),
      ).join("\n"),
    ).not.toMatch(/risk_class/);
    expect(receiptDefects(receipt({ open_owner_questions: 1 })).join("\n")).toMatch(
      /open_owner_questions: 0/,
    );
  });

  it("trips the coherence wire: a nonvisual claim with a visual diff is refused on evidence", () => {
    const verdict = gate({
      pullRequest: pullRequest({ body: bodyWith(receipt({ visual: "nonvisual" })) }),
    });
    expect(verdict.merge).toBe(false);
    expect(verdict.reasons.join("\n")).toMatch(/diff touches a visual surface/);
    const trulyNonvisual = gate({
      pullRequest: pullRequest({ body: bodyWith(receipt({ visual: "nonvisual" })) }),
      files: [{ status: "M", path: "src/lib/events/filters.ts" }],
    });
    expect(trulyNonvisual.merge).toBe(true);
    expect(touchesVisualSurface([{ status: "M", path: "src/theme.ts" }], rules)).toBe(true);
  });

  it("re-derives every visual carry-forward link instead of trusting its file list", () => {
    const evidence = {
      approved_sha: OTHER,
      carry_forward_chain: [
        {
          from_sha: OTHER,
          to_sha: HEAD,
          verdict: "non-rendered",
          files: [{ status: "M", path: "src/lib/events/service.ts" }],
          fact: `carried-forward-from ${OTHER}`,
        },
      ],
    };
    const carried = pullRequest({
      body: bodyWith(receipt({ visual_evidence: evidence })),
    });

    const unproved = gate({ pullRequest: carried });
    expect(unproved.merge).toBe(false);
    expect(unproved.reasons.join("\n")).toMatch(/requires Git-derived evidence/);

    const forged = gate({
      pullRequest: carried,
      deriveVisualFiles: () => [{ status: "M", path: "src/app/events/page.tsx" }],
    });
    expect(forged.merge).toBe(false);
    expect(forged.reasons.join("\n")).toMatch(/Git-derived diff touches a rendered surface/);
    expect(forged.reasons.join("\n")).toMatch(/does not match its Git-derived diff/);

    const proved = gate({
      pullRequest: carried,
      deriveVisualFiles: () => [{ status: "M", path: "src/lib/events/service.ts" }],
    });
    expect(proved.reasons).toEqual([]);
    expect(proved.merge).toBe(true);
  });

  it("requires a cited, answered owner decision for checkpoint-approval surfaces — detected from the diff", () => {
    const authFiles = [{ status: "M", path: "src/lib/auth/capabilities.ts" }];
    const deliveryFiles = [{ status: "M", path: "src/lib/delivery/allowlist.ts" }];
    for (const files of [authFiles, deliveryFiles]) {
      const silent = gate({
        files,
        pullRequest: pullRequest({ body: bodyWith(receipt({ visual: "nonvisual" })) }),
      });
      expect(silent.merge).toBe(false);
      expect(silent.reasons.join("\n")).toMatch(/checkpoint-approval surface/);
    }
    const cited = gate({
      files: authFiles,
      pullRequest: pullRequest({
        body: bodyWith(
          receipt({
            visual: "nonvisual",
            owner_decision: { question_id: "Q-7", answered_by: "Brian", date: "2026-08-18" },
          }),
        ),
      }),
    });
    expect(cited.reasons).toEqual([]);
    expect(cited.merge).toBe(true);
    const malformed = gate({
      files: authFiles,
      pullRequest: pullRequest({
        body: bodyWith(receipt({ visual: "nonvisual", owner_decision: { question_id: "nope" } })),
      }),
    });
    expect(malformed.merge).toBe(false);
    // Ordinary application files require no owner decision.
    const ordinary = gate({});
    expect(ordinary.merge).toBe(true);
  });

  it("requires every check green at the exact head, treating duplicates conjunctively", () => {
    const missing = gate({ checkRuns: greenChecks().slice(0, 1) });
    expect(missing.merge).toBe(false);
    expect(missing.reasons.join("\n")).toMatch(/did not run is not a check that passed/);
    const staleCheck = gate({ checkRuns: greenChecks(OTHER) });
    expect(staleCheck.merge).toBe(false);
    const failedRerun = gate({
      checkRuns: [
        ...greenChecks(),
        {
          name: rules.requiredChecks[0],
          status: "completed",
          conclusion: "failure",
          head_sha: HEAD,
        },
      ],
    });
    expect(failedRerun.merge).toBe(false);
  });

  it("is fail-closed by construction: merge is only ever reasons.length === 0", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "scripts", "mission", "merge-gate.mjs"),
      "utf8",
    );
    expect(source).not.toMatch(/merge\s*=\s*true/);
    expect(source).toContain("merge: reasons.length === 0");
  });
});

describe("the journal-side conjuncts the Lead checks before publishing a receipt", () => {
  const packet = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "mission", "approved-packet.json"), "utf8"),
  );
  const plan = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "mission", "three-package-plan.json"), "utf8"),
  );

  const base = (extra: object[] = []) =>
    reduce([
      { type: "mission-init", at: "t", packet, lead_id: "lead-fixture", pid: 4242 },
      {
        type: "plan-recorded",
        at: "t",
        packages: plan.packages,
        decomposition: plan.decomposition,
      },
      { type: "plan-approved", at: "t", approved_by: "Brian", evidence: "checkpoint 1" },
      { type: "linear-preflight", at: "t", result: "reachable", detail: "fixture" },
      { type: "linear-sync-intent", at: "t", package_id: "WP-events-filter" },
      { type: "linear-sync-result", at: "t", package_id: "WP-events-filter", issue_id: "LAN-901" },
      {
        type: "worker-dispatched",
        at: "t",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        worktree: "w",
        branch: "b",
      },
      {
        type: "worker-receipt",
        at: "t",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        receipt: {
          branch: "b",
          worktree: "w",
          surfaces: [],
          acceptance_criteria: [],
          verification: "verify passed",
          ci_state: "green",
          visual_state: "pending",
          migration_implications: "none",
          limitations: "none",
          result: "completed",
        },
      },
      { type: "pr-opened", at: "t", package_id: "WP-events-filter", pr_number: 50, head_sha: HEAD },
      {
        type: "review-receipt",
        at: "t",
        package_id: "WP-events-filter",
        receipt: {
          review_mode: "full",
          full_review_sha: HEAD,
          reviewed_head_sha: HEAD,
          round: 1,
          result: "clear",
        },
      },
      {
        type: "visual-approval",
        at: "t",
        package_id: "WP-events-filter",
        approved_by: "Brian",
        evidence: "live review",
      },
      ...extra,
    ]);

  it("passes a reviewed, visually approved package and refuses every missing fact", () => {
    expect(journalConjuncts(base(), "WP-events-filter", HEAD)).toEqual([]);
    expect(journalConjuncts(base(), "WP-events-filter", OTHER).join("\n")).toMatch(/covers/);
    expect(journalConjuncts(base(), "WP-ghost", HEAD).join("\n")).toMatch(/No planned package/);
    const questioned = base([
      {
        type: "owner-question",
        at: "t",
        id: "Q-9",
        classification: "hourly",
        text: "x",
        source: "s",
        affected_packages: ["WP-events-filter"],
      },
    ]);
    expect(journalConjuncts(questioned, "WP-events-filter", HEAD).join("\n")).toMatch(/Q-9/);
    const stopped = base([
      { type: "mission-stopped", at: "t", reason: "usage-exhausted", detail: "simulated" },
    ]);
    expect(journalConjuncts(stopped, "WP-events-filter", HEAD).join("\n")).toMatch(/stopped/);
  });

  it("requires an answered owner question on the journal side for checkpoint-approval diffs", () => {
    const deliveryFiles = [{ status: "M", path: "src/lib/delivery/allowlist.ts" }];
    const opts = { files: deliveryFiles, rules };
    expect(journalConjuncts(base(), "WP-events-filter", HEAD, opts).join("\n")).toMatch(
      /checkpoint-approval surface/,
    );
    const answered = base([
      {
        type: "owner-question",
        at: "t",
        id: "Q-allowlist",
        classification: "hourly",
        text: "Synthetic: this package touches the recipient allowlist — proceed?",
        source: "checkpoint queue",
        affected_packages: ["WP-events-filter"],
      },
      {
        type: "owner-answer",
        at: "t",
        question_id: "Q-allowlist",
        answer: "Yes, proceed.",
        answered_by: "Brian",
        reusable: false,
      },
    ]);
    expect(journalConjuncts(answered, "WP-events-filter", HEAD, opts)).toEqual([]);
    // Ordinary files need no owner answer.
    expect(
      journalConjuncts(base(), "WP-events-filter", HEAD, {
        files: [{ status: "M", path: "src/lib/events/filters.ts" }],
        rules,
      }),
    ).toEqual([]);
  });

  it("gates highest risk on the checkpoint, never lets a migration owner through, and requires visual approval", () => {
    const state = base();
    state.packages["WP-events-filter"].risk_class = "highest";
    expect(journalConjuncts(state, "WP-events-filter", HEAD).join("\n")).toMatch(
      /is highest risk and no answered owner question names it/,
    );
    // With the checkpoint answered, the grade alone no longer decides the route.
    const checkpointed = base();
    checkpointed.packages["WP-events-filter"].risk_class = "highest";
    checkpointed.questions = {
      "Q-authorization-rule": {
        id: "Q-authorization-rule",
        status: "answered",
        affected_packages: ["WP-events-filter"],
      },
    };
    expect(journalConjuncts(checkpointed, "WP-events-filter", HEAD)).toEqual([]);
    const migration = base();
    migration.packages["WP-events-filter"].risk_class = "normal";
    migration.packages["WP-events-filter"].migration_owner = true;
    expect(journalConjuncts(migration, "WP-events-filter", HEAD).join("\n")).toMatch(
      /owner-merged, never autonomous/,
    );
    const unapproved = base();
    unapproved.packages["WP-events-filter"].visual_approved = false;
    expect(journalConjuncts(unapproved, "WP-events-filter", HEAD).join("\n")).toMatch(
      /visual work without Brian's recorded visual approval/,
    );
  });
});
