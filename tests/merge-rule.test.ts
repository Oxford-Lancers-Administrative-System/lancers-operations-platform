import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  evaluateMergeRule,
  loadRules,
  prohibitedPaths,
  touchesVisualSurface,
} from "../scripts/merge/gate.mjs";
import {
  evaluateDraftLift,
  journalConjuncts,
  touchesCheckpointSurface,
} from "../scripts/mission/merge-gate.mjs";
import { reduce } from "../scripts/mission/lib/state.mjs";

const rules = loadRules();
const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);
const uxConformance = {
  mockup_states: ["events filter — desktop", "events filter — measured 375px"],
  comparison_method: "Rendered both live states and compared structure and copy.",
  result: "clear",
};

const pullRequest = (overrides: object = {}) => ({
  state: "OPEN",
  baseRefName: "main",
  isCrossRepository: false,
  isDraft: false,
  headRefOid: HEAD,
  title: "Delivers WP-events-filter (LAN-901)",
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
  evaluateMergeRule({ pullRequest: pullRequest(), files: appFiles, rules, ...overrides });

// ---------------------------------------------------------------------------
// The one universal rule (LAN-209).
// ---------------------------------------------------------------------------

describe("the merge rule", () => {
  it("enables auto-merge for an out-of-draft pull request whose diff is clean", () => {
    const verdict = gate();
    expect(verdict.reasons).toEqual([]);
    expect(verdict.autoMerge).toBe(true);
  });

  // Draft state is the readiness gate, and it is the ONLY thing standing
  // between a pull request and its merge. LAN-202 merged itself because the
  // gate read `isDraft` and ignored it while both workflows called
  // `gh pr ready` immediately before merging.
  it("enables nothing on a draft, whatever else is true of it", () => {
    const verdict = gate({ pullRequest: pullRequest({ isDraft: true }) });
    expect(verdict.autoMerge).toBe(false);
    expect(verdict.reasons.join("\n")).toMatch(/draft state is the readiness gate/i);
  });

  it("refuses a closed pull request, a non-main base, a fork, and an unknown head", () => {
    expect(gate({ pullRequest: pullRequest({ state: "MERGED" }) }).autoMerge).toBe(false);
    expect(gate({ pullRequest: pullRequest({ baseRefName: "develop" }) }).autoMerge).toBe(false);
    expect(gate({ pullRequest: pullRequest({ isCrossRepository: true }) }).autoMerge).toBe(false);
    expect(gate({ pullRequest: pullRequest({ headRefOid: null }) }).autoMerge).toBe(false);
    expect(evaluateMergeRule({ pullRequest: null, files: appFiles, rules }).autoMerge).toBe(false);
  });

  it("refuses an empty diff and every prohibited surface, judging renames on both names", () => {
    expect(gate({ files: [] }).reasons.join("\n")).toMatch(/diff is empty/i);
    for (const file of [
      "supabase/migrations/20260818000000_new_table.sql",
      ".github/workflows/merge.yml",
      ".github/merge-rules.json",
      ".claude/skills/run-mission/SKILL.md",
      ".claude/settings.json",
      "scripts/mission/merge-gate.mjs",
      "scripts/merge/gate.mjs",
      "scripts/production/github-merge-protection.sh",
      "package.json",
      "Dockerfile",
      "docs/mission-harness.md",
      "AGENTS.md",
      "CLAUDE.md",
      "tests/agent-harness.test.ts",
      "tests/merge-rule.test.ts",
      "tests/mission-state.test.ts",
      "src/proxy.ts",
      "src/lib/supabase/admin.ts",
      "src/lib/db/url.ts",
      "src/app/login/page.tsx",
      "missions/packets/M-RECRUITMENT/packet.json",
    ]) {
      const verdict = gate({ files: [{ status: "M", path: file }] });
      expect(verdict.autoMerge, file).toBe(false);
      expect(verdict.reasons.join("\n")).toContain("prohibited surface");
    }
    const renamed = gate({
      files: [{ status: "R", path: "src/app/events/list.tsx", previousPath: "src/proxy.ts" }],
    });
    expect(renamed.autoMerge).toBe(false);
  });

  // The relocation LAN-209 performed is a relocation, not a widening: the
  // gate's own code and its own proofs stay unmergeable by the gate.
  it("keeps the merge machinery unable to merge changes to itself", () => {
    for (const file of [
      "scripts/merge/paths.mjs",
      "scripts/merge/checks.mjs",
      "scripts/merge/gate-cli.mjs",
      "tests/merge-governance.test.ts",
    ]) {
      expect(prohibitedPaths([{ status: "M", path: file }], rules), file).not.toEqual([]);
    }
  });

  it("allows ordinary application work through the prohibited-path scan", () => {
    expect(
      prohibitedPaths(
        [
          { status: "M", path: "src/app/events/page.tsx" },
          { status: "A", path: "src/lib/events/filters.ts" },
          { status: "A", path: "src/lib/events/filters.test.ts" },
          { status: "M", path: "src/lib/auth/capabilities.ts" },
          { status: "M", path: "src/lib/delivery/allowlist.ts" },
          { status: "M", path: "tests/slice-walkthrough.test.ts" },
          { status: "M", path: "vitest.config.ts" },
          { status: "M", path: "scripts/seed-local.mjs" },
          { status: "M", path: "src/lib/db/errors.ts" },
          // Known consequence, accepted at LAN-209: the fast lane's protected
          // list is gone, and `docs/adr/**` was only ever on that list.
          { status: "M", path: "docs/adr/0028-role-catalogue.md" },
          { status: "M", path: "scripts/pilot/lan-80/setup.sql" },
          { status: "M", path: ".env.example" },
          { status: "M", path: ".gitignore" },
          { status: "M", path: "next.config.ts" },
          { status: "M", path: "missions/intake/M-RECRUITMENT/01-overview.md" },
        ],
        rules,
      ),
    ).toEqual([]);
  });

  it("still classifies the visual surfaces the owner judges", () => {
    for (const file of [
      "src/app/operate/events/presentation.ts",
      "src/app/events/page.tsx",
      "src/theme.ts",
    ]) {
      expect(touchesVisualSurface([{ status: "M", path: file }], rules), file).toBe(true);
    }
    expect(touchesVisualSurface([{ status: "M", path: "src/lib/events/filters.ts" }], rules)).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// What the Mission Lead must be able to say before it lifts a draft.
// ---------------------------------------------------------------------------

describe("the conditions for lifting a draft", () => {
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
          ci_state: "green",
          ux_conformance: uxConformance,
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

  it("does not let mission-level security coverage replace visual package conformance", () => {
    const state = base();
    state.packages["WP-events-filter"].review = null;
    state.packages["WP-events-filter"].visual_approved = false;
    state.integratedReviews.push({
      mode: "security-tier",
      result: "clear",
      head_sha: OTHER,
      package_heads: { "WP-events-filter": HEAD },
      sensitive_paths: [],
      report: "reviews/security-tier.json",
    });
    state.missionVisualApprovals = [
      {
        head_sha: OTHER,
        package_heads: { "WP-events-filter": HEAD },
        by: "Brian",
        evidence: "mission review",
      },
    ];
    expect(journalConjuncts(state, "WP-events-filter", HEAD).join("\n")).toMatch(
      /no clear package review or mission-level security-tier review/i,
    );
  });

  it("gates highest risk on the checkpoint, keeps a migration owner drafted, and requires visual approval", () => {
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
      /stays a draft; Brian merges it/,
    );
    const unapproved = base();
    unapproved.packages["WP-events-filter"].visual_approved = false;
    expect(journalConjuncts(unapproved, "WP-events-filter", HEAD).join("\n")).toMatch(
      /visual work without Brian's recorded visual approval/,
    );
  });

  // LAN-209 deleted the receipt that used to CITE an answered owner question for
  // auth and delivery work. It did not delete the requirement — the issue keeps
  // journalConjuncts on the same conditions, and ADR 0033 §4 is what records
  // them. This is the conjunct a declared risk grade cannot stand in for: the
  // grade is a plan attribute, and nothing forces it to follow the paths a
  // package turns out to touch.
  it("requires an answered owner question for a checkpoint surface, whatever the risk grade", () => {
    const opts = (path: string) => ({ files: [{ status: "M", path }], rules });
    const CHECKPOINT = [
      "src/lib/auth/capabilities.ts",
      "src/lib/delivery/allowlist.ts",
      "src/lib/db/pool.ts",
      "src/lib/services/player-answer-tokens.ts",
      "src/app/api/webhooks/whatsapp/route.ts",
    ];
    for (const file of CHECKPOINT) {
      expect(touchesCheckpointSurface([{ status: "M", path: file }], rules), file).toBe(true);
      // Normal risk, cleanly reviewed, visually approved — and still refused.
      expect(
        journalConjuncts(base(), "WP-events-filter", HEAD, opts(file)).join("\n"),
        file,
      ).toMatch(/touches a checkpoint surface .* and no answered owner question names it/);
    }

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
    for (const file of CHECKPOINT) {
      expect(journalConjuncts(answered, "WP-events-filter", HEAD, opts(file)), file).toEqual([]);
    }

    // Ordinary application files need no owner answer, and a caller that
    // supplies no diff is not silently treated as a clean one.
    for (const file of ["src/lib/events/filters.ts", "src/app/events/page.tsx"]) {
      expect(touchesCheckpointSurface([{ status: "M", path: file }], rules), file).toBe(false);
      expect(journalConjuncts(base(), "WP-events-filter", HEAD, opts(file)), file).toEqual([]);
    }
  });

  it("carries the checkpoint conjunct through evaluateDraftLift", () => {
    const refused = evaluateDraftLift({
      state: base(),
      packageId: "WP-events-filter",
      pullRequest: pullRequest({ isDraft: true }),
      checkRuns: greenChecks(),
      files: [{ status: "M", path: "src/lib/auth/capabilities.ts" }],
      rules,
    });
    expect(refused.lift).toBe(false);
    expect(refused.journal_reasons.join("\n")).toMatch(/checkpoint surface/);
  });

  it("joins the journal, the prohibited scan and the checks into one verdict", () => {
    const state = base();
    const lift = (overrides: object = {}) =>
      evaluateDraftLift({
        state,
        packageId: "WP-events-filter",
        pullRequest: pullRequest({ isDraft: true }),
        checkRuns: greenChecks(),
        files: appFiles,
        rules,
        ...overrides,
      });

    expect(lift()).toMatchObject({ lift: true, journal_reasons: [], evidence_reasons: [] });

    // A prohibited path is not a thing the Lead may un-draft its way past: the
    // draft is what keeps it Brian's, and the workflow would refuse it anyway.
    const prohibited = lift({ files: [{ status: "M", path: "supabase/migrations/x.sql" }] });
    expect(prohibited.lift).toBe(false);
    expect(prohibited.evidence_reasons.join("\n")).toContain("prohibited surface");

    // Un-drafting is what makes GitHub merge it, so the checks are green at
    // exactly this head before the Lead takes that act. Duplicates conjoin.
    expect(lift({ checkRuns: greenChecks().slice(0, 1) }).evidence_reasons.join("\n")).toMatch(
      /did not run is not a check that passed/,
    );
    expect(lift({ checkRuns: greenChecks(OTHER) }).lift).toBe(false);
    expect(
      lift({
        checkRuns: [
          ...greenChecks(),
          {
            name: rules.requiredChecks[0],
            status: "completed",
            conclusion: "failure",
            head_sha: HEAD,
          },
        ],
      }).lift,
    ).toBe(false);

    // A stale review is a journal fact, not an evidence one.
    const moved = lift({ pullRequest: pullRequest({ isDraft: true, headRefOid: OTHER }) });
    expect(moved.lift).toBe(false);
    expect(moved.journal_reasons.join("\n")).toMatch(/covers/);
  });
});
