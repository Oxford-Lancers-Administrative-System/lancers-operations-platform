/**
 * The thirteen synthetic readiness rehearsals for Mission Harness v1.
 *
 * The approved task defines readiness as exactly these criteria, proved
 * deterministically with no real Linear issue, no real pull request, and no
 * external mutation of any kind. Each describe block is one numbered
 * criterion from the task, in its order, so the readiness verdict can point
 * here row by row. Rehearsals compose the same modules the unit suites
 * prove; where a criterion needs a genuinely fresh process, spawnSync runs
 * the real CLI.
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  appendEvent,
  missionPaths,
  nextActions,
  readJournal,
  replayState,
} from "../scripts/mission/lib/state.mjs";
import { validatePacket } from "../scripts/mission/lib/packet.mjs";
import { promoteRule, readRules } from "../scripts/mission/lib/owner-rules.mjs";
import {
  evaluateMissionGate,
  journalConjuncts,
  loadRules,
} from "../scripts/mission/merge-gate.mjs";

const CLI = path.join(__dirname, "..", "scripts", "mission", "cli.mjs");
const packet = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "mission", "approved-packet.json"), "utf8"),
);
const plan = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "mission", "three-package-plan.json"), "utf8"),
);
const MISSION = packet.mission_id as string;
const HEAD = "a".repeat(40);
const rules = loadRules();

const temporary: string[] = [];
afterEach(() => {
  for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function mission() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-rehearsal-"));
  temporary.push(root);
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo, { recursive: true });
  const env = {
    ...process.env,
    LANCERS_MISSION_ROOT: path.join(root, "state"),
    LANCERS_MISSION_LEAD_ID: "lead-rehearsal-1",
  };
  let tick = 1_700_000_000_000;
  const append = (event: object) => appendEvent(repo, MISSION, event, { env, now: (tick += 1000) });
  return { repo, env, append };
}

/**
 * The deterministic Linear fixture driver: an in-memory recorder standing in
 * for the real integration. Creating twice for one package is impossible by
 * construction upstream (the journal refuses), and the recorder proves no
 * call was ever attempted twice.
 */
function fixtureLinearDriver() {
  const calls: Array<{ op: string; package_id: string }> = [];
  let issue = 900;
  return {
    calls,
    createIssue(packageId: string) {
      calls.push({ op: "create", package_id: packageId });
      issue += 1;
      return `LAN-${issue}`;
    },
    readTeams() {
      calls.push({ op: "read-teams", package_id: "" });
      return { reachable: true, detail: "fixture driver answered a read-only teams query" };
    },
  };
}

async function planned(m: ReturnType<typeof mission>) {
  await m.append({ type: "mission-init", packet, lead_id: "lead-fixture", pid: 4242 });
  await m.append({
    type: "plan-recorded",
    packages: plan.packages,
    decomposition: plan.decomposition,
  });
  await m.append({
    type: "plan-approved",
    approved_by: "Brian",
    evidence: "decomposition and owner cost presented at checkpoint 1",
  });
}

async function synced(m: ReturnType<typeof mission>) {
  await planned(m);
  const driver = fixtureLinearDriver();
  const preflight = driver.readTeams();
  await m.append({ type: "linear-preflight", result: "reachable", detail: preflight.detail });
  for (const pkg of plan.packages) {
    await m.append({ type: "linear-sync-intent", package_id: pkg.id });
    const issueId = driver.createIssue(pkg.id);
    await m.append({ type: "linear-sync-result", package_id: pkg.id, issue_id: issueId });
  }
  return driver;
}

const workerReceipt = (result = "completed") => ({
  branch: "feat/wp-events-filter",
  worktree: ".claude/worktrees/wp-events-filter",
  surfaces: ["src/app/events/page.tsx"],
  acceptance_criteria: ["REQ-events-filter → filter renders and filters"],
  verification: "npm run verify observed to pass in the worker worktree",
  ci_state: `green at ${HEAD}`,
  visual_state: "preflight-complete-awaiting-brian",
  migration_implications: "none",
  limitations: "none",
  result,
});

async function implemented(m: ReturnType<typeof mission>, packageId = "WP-events-filter") {
  await m.append({
    type: "worker-dispatched",
    package_id: packageId,
    worker_id: "worker-1",
    worktree: `.claude/worktrees/${packageId}`,
    branch: `feat/${packageId}`,
  });
  await m.append({
    type: "worker-receipt",
    package_id: packageId,
    worker_id: "worker-1",
    receipt: workerReceipt(),
  });
  await m.append({ type: "pr-opened", package_id: packageId, pr_number: 60, head_sha: HEAD });
}

describe("Rehearsal 1 — a valid approved packet initializes; invalid or unapproved fail closed", () => {
  it("initializes the synthetic mission and refuses the failure shapes", async () => {
    const m = mission();
    const state = await m.append({
      type: "mission-init",
      packet,
      lead_id: "lead-fixture",
      pid: 4242,
    });
    expect(state.initialized).toBe(true);
    for (const broken of [
      { ...packet, approval: undefined },
      { ...packet, approval: { approved_by: "Brian" } },
      { ...packet, sources: [] },
      { ...packet, requirements: [] },
      { ...packet, status: undefined },
      { ...packet, baseline: { branch: "main", commit: null } },
      {
        ...packet,
        merge_envelope: { auto_merge_classes: ["schema-migration"], owner_gated: [] },
      },
    ]) {
      expect(validatePacket(broken).length).toBeGreaterThan(0);
      const fresh = mission();
      await expect(
        fresh.append({ type: "mission-init", packet: broken, lead_id: "lead-fixture", pid: 4242 }),
      ).rejects.toThrow(/Invalid packet/);
      expect(readJournal(missionPaths(fresh.repo, MISSION, fresh.env).journal)).toEqual([]);
    }
    // A not_ready packet is a valid document and still cannot execute.
    const notReady = mission();
    await expect(
      notReady.append({
        type: "mission-init",
        packet: { ...packet, status: "not_ready" },
        lead_id: "lead-fixture",
        pid: 4242,
      }),
    ).rejects.toThrow(/cannot initialize execution/);
  });
});

describe("Rehearsal 2 — the Lead derives a multi-package DAG with dependencies, collision domains, and stable IDs", () => {
  it("records the plan and derives the executable frontier without Brian constructing it", async () => {
    const m = mission();
    await planned(m);
    const state = replayState(m.repo, MISSION, m.env);
    expect(Object.keys(state.packages)).toHaveLength(3);
    for (const pkg of Object.values(state.packages) as Array<Record<string, unknown>>) {
      expect(pkg.id).toMatch(/^WP-/);
      expect(pkg.collision_domain).toBeTruthy();
    }
    expect(state.packages["WP-report-footer"].depends_on).toEqual(["WP-attendance-export"]);
    // The frontier is derived from state, not from an owner instruction.
    const actions = nextActions(state);
    expect(actions.map((action) => action.action)).toContain("linear-preflight");
  });
});

describe("Rehearsal 3 — Linear behavior through deterministic fixtures, with a non-mutating preflight", () => {
  it("synchronizes every package exactly once through the fixture driver", async () => {
    const m = mission();
    const driver = await synced(m);
    expect(driver.calls.filter((call) => call.op === "read-teams")).toHaveLength(1);
    expect(driver.calls.filter((call) => call.op === "create")).toHaveLength(3);
    const state = replayState(m.repo, MISSION, m.env);
    expect(
      Object.values(state.packages).map((pkg: Record<string, unknown>) => pkg.linear_issue_id),
    ).toEqual(["LAN-901", "LAN-902", "LAN-903"]);
    // A retry after the fact cannot create a duplicate: the journal refuses
    // before any driver call would happen.
    await expect(
      m.append({ type: "linear-sync-intent", package_id: "WP-events-filter" }),
    ).rejects.toThrow(/already synchronized/);
    expect(driver.calls.filter((call) => call.op === "create")).toHaveLength(3);
  });
});

describe("Rehearsal 4 — worker dispatch is refused until Linear synchronization succeeds", () => {
  it("refuses before preflight and before sync, then permits", async () => {
    const m = mission();
    await planned(m);
    const dispatch = () =>
      m.append({
        type: "worker-dispatched",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        worktree: ".claude/worktrees/wp-events-filter",
        branch: "feat/wp-events-filter",
      });
    await expect(dispatch()).rejects.toThrow(
      /No Linear connectivity preflight|no created or reconciled Linear issue/,
    );
    await m.append({ type: "linear-preflight", result: "reachable", detail: "fixture" });
    await expect(dispatch()).rejects.toThrow(/no created or reconciled Linear issue/);
    await m.append({ type: "linear-sync-intent", package_id: "WP-events-filter" });
    await m.append({
      type: "linear-sync-result",
      package_id: "WP-events-filter",
      issue_id: "LAN-901",
    });
    const state = await dispatch();
    expect(state.packages["WP-events-filter"].status).toBe("active");
  });
});

describe("Rehearsal 5 — concurrency is two; a second safe package runs and a colliding package is serialized", () => {
  it("runs the safe pair, refuses the third, and serializes the collision", async () => {
    const m = mission();
    await synced(m);
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/a",
      branch: "feat/a",
    });
    const second = await m.append({
      type: "worker-dispatched",
      package_id: "WP-attendance-export",
      worker_id: "worker-2",
      worktree: ".claude/worktrees/b",
      branch: "feat/b",
    });
    expect(second.activeWorkers).toHaveLength(2);
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-report-footer",
        worker_id: "worker-3",
        worktree: ".claude/worktrees/c",
        branch: "feat/c",
      }),
    ).rejects.toThrow(/Maximum implementation concurrency is 2/);

    // A sibling in the same collision domain is serialized even with a slot
    // free: replan adds it, one worker finishes, and the collision still
    // refuses while the domain is occupied.
    const withSibling = [
      ...plan.packages,
      { ...plan.packages[0], id: "WP-events-sibling", title: "Synthetic sibling" },
    ];
    await m.append({
      type: "plan-recorded",
      packages: withSibling,
      decomposition: { ...plan.decomposition, critical_path: ["WP-attendance-export"] },
    });
    // The revision withdrew the approval it no longer describes (LAN-148 §A).
    await m.append({
      type: "plan-approved",
      approved_by: "Brian",
      evidence: "revised decomposition presented at checkpoint 2",
    });
    await m.append({ type: "linear-sync-intent", package_id: "WP-events-sibling" });
    await m.append({
      type: "linear-sync-result",
      package_id: "WP-events-sibling",
      issue_id: "LAN-904",
    });
    await m.append({
      type: "worker-receipt",
      package_id: "WP-attendance-export",
      worker_id: "worker-2",
      receipt: workerReceipt(),
    });
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-events-sibling",
        worker_id: "worker-2",
        worktree: ".claude/worktrees/d",
        branch: "feat/d",
      }),
    ).rejects.toThrow(/collides with WP-events-filter on domain "events"/);
  });
});

describe("Rehearsal 6 — worker and reviewer receipts persist identities, branches, worktrees, SHAs, and transitions", () => {
  it("round-trips every receipt fact through the durable journal", async () => {
    const m = mission();
    await synced(m);
    await implemented(m);
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: {
        review_mode: "full",
        full_review_sha: HEAD,
        reviewed_head_sha: HEAD,
        round: 1,
        result: "clear",
        blocking_finding_ids: [],
      },
    });
    const state = replayState(m.repo, MISSION, m.env);
    const pkg = state.packages["WP-events-filter"];
    expect(pkg.worker_id).toBe("worker-1");
    expect(pkg.branch).toBe("feat/WP-events-filter");
    expect(pkg.worktree).toBe(".claude/worktrees/WP-events-filter");
    expect(pkg.pr_number).toBe(60);
    expect(pkg.head_sha).toBe(HEAD);
    expect(pkg.receipts[0]).toMatchObject({
      worker_id: "worker-1",
      verification: "npm run verify observed to pass in the worker worktree",
      result: "completed",
    });
    expect(pkg.review).toMatchObject({ reviewed_head_sha: HEAD, result: "clear", round: 1 });
    expect(pkg.status).toBe("reviewed");
  });
});

describe("Rehearsal 7 — a blocking review routes correction to the original worker with lineage", () => {
  it("refuses a replacement implementer and resumes worker-1 with the finding ids", async () => {
    const m = mission();
    await synced(m);
    await implemented(m);
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: {
        review_mode: "full",
        full_review_sha: HEAD,
        reviewed_head_sha: HEAD,
        round: 1,
        result: "blocked",
        blocking_finding_ids: ["R-001"],
      },
    });
    // The durable frontier itself routes to a correction of the original
    // worker — a fresh Lead is never steered into re-reviewing the same SHA.
    const blocked = replayState(m.repo, MISSION, m.env);
    expect(blocked.packages["WP-events-filter"].status).toBe("blocked");
    const frontier = nextActions(blocked).filter(
      (action) => action.package_id === "WP-events-filter",
    );
    expect(frontier.map((action) => action.action)).toContain("correction");
    expect(frontier.map((action) => action.action)).not.toContain("review");
    await expect(
      m.append({
        type: "correction-dispatched",
        package_id: "WP-events-filter",
        worker_id: "worker-replacement",
        finding_ids: ["R-001"],
      }),
    ).rejects.toThrow(/resumes the original implementation worker \(worker-1\)/);
    const resumed = await m.append({
      type: "correction-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      finding_ids: ["R-001"],
    });
    expect(resumed.activeWorkers[0]).toMatchObject({
      worker_id: "worker-1",
      kind: "correction",
      finding_ids: ["R-001"],
    });
  });
});

describe("Rehearsal 8 — the owner queue separates immediate from hourly, persists answers, and gates rule promotion", () => {
  it("classifies, persists, and refuses promotion without explicit approval", async () => {
    const m = mission();
    await synced(m);
    await m.append({
      type: "owner-question",
      id: "Q-pagination",
      classification: "hourly",
      text: "Synthetic: default page size for admin lists?",
      source: "brief is silent",
      affected_packages: ["WP-events-filter"],
    });
    await m.append({
      type: "owner-question",
      id: "Q-access",
      classification: "immediate",
      text: "Synthetic: a credential is missing",
      source: "environment",
      affected_packages: [],
    });
    const open = replayState(m.repo, MISSION, m.env);
    expect(open.questions["Q-pagination"].classification).toBe("hourly");
    expect(open.questions["Q-access"].classification).toBe("immediate");
    expect(nextActions(open).map((action) => action.action)).toContain("escalate");

    await m.append({
      type: "owner-answer",
      question_id: "Q-pagination",
      answer: "25 rows; make it a standing rule.",
      answered_by: "Brian",
      reusable: true,
    });
    const answered = replayState(m.repo, MISSION, m.env);
    expect(answered.questions["Q-pagination"].answer?.reusable).toBe(true);

    const rule = {
      id: "RULE-UI-007",
      scope: "Ordinary administrative list pages",
      rule: "Default to 25-row pagination",
      exceptions: [],
      source: "Brian",
      date: "2026-08-18",
      status: "approved",
      approval_evidence: "Checkpoint answer to Q-pagination: 'make it a standing rule'",
      source_mission: MISSION,
    };
    await expect(promoteRule(m.repo, { ...rule, approval_evidence: "" }, m.env)).rejects.toThrow(
      /explicitly approved reuse/,
    );
    await promoteRule(m.repo, rule, m.env);
    expect(readRules(m.repo, m.env).rules.map((entry: { id: string }) => entry.id)).toEqual([
      "RULE-UI-007",
    ]);
    // The second analogous case applies the rule without asking again.
    await m.append({
      type: "rule-applied",
      rule_id: "RULE-UI-007",
      context: "WP-report-footer list pagination — answered by RULE-UI-007, Brian not asked",
    });
    expect(replayState(m.repo, MISSION, m.env).rulesApplied).toHaveLength(1);
  });
});

describe("Rehearsal 9 — guarded merge permits the qualifying case and refuses every mandated failure", () => {
  const receipt = (overrides: object = {}) => ({
    mission_id: MISSION,
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
    `\`\`\`mission-merge-receipt\n${JSON.stringify(value)}\n\`\`\``;
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
  const files = [{ status: "M", path: "src/app/events/page.tsx" }];

  it("permits the qualifying synthetic case end to end, journal and evidence", async () => {
    const m = mission();
    await synced(m);
    await implemented(m);
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: {
        review_mode: "full",
        full_review_sha: HEAD,
        reviewed_head_sha: HEAD,
        round: 1,
        result: "clear",
      },
    });
    await m.append({
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: HEAD,
      result: "clear",
      jobs_completed:
        "Signed in, drafted a practice, confirmed its audience and took the register.",
    });
    await m.append({
      type: "visual-approval",
      package_id: "WP-events-filter",
      approved_by: "Brian",
      evidence: "live review at checkpoint 1",
    });
    const state = replayState(m.repo, MISSION, m.env);
    expect(journalConjuncts(state, "WP-events-filter", HEAD)).toEqual([]);
    const verdict = evaluateMissionGate({
      pullRequest: pullRequest(),
      checkRuns: greenChecks(),
      files,
      rules,
    });
    expect(verdict.reasons).toEqual([]);
    expect(verdict.merge).toBe(true);
    const merged = await m.append({
      type: "merge-recorded",
      package_id: "WP-events-filter",
      pr_number: 60,
      sha: HEAD,
      route: "guarded-auto",
    });
    expect(merged.packages["WP-events-filter"].status).toBe("merged");
  });

  it("refuses stale SHA, failed CI, unresolved review, missing visual approval, prohibited risk, and open owner decisions", async () => {
    const stale = evaluateMissionGate({
      pullRequest: pullRequest({ headRefOid: "b".repeat(40) }),
      checkRuns: greenChecks("b".repeat(40)),
      files,
      rules,
    });
    expect(stale.merge).toBe(false);
    expect(stale.reasons.join("\n")).toMatch(/head moved after review/);

    const failedCi = evaluateMissionGate({
      pullRequest: pullRequest(),
      checkRuns: [
        {
          name: rules.requiredChecks[0],
          status: "completed",
          conclusion: "failure",
          head_sha: HEAD,
        },
        greenChecks()[1],
      ],
      files,
      rules,
    });
    expect(failedCi.merge).toBe(false);

    const unresolvedReview = evaluateMissionGate({
      pullRequest: pullRequest({ body: bodyWith(receipt({ review_result: "blocked" })) }),
      checkRuns: greenChecks(),
      files,
      rules,
    });
    expect(unresolvedReview.merge).toBe(false);

    const missingVisual = evaluateMissionGate({
      pullRequest: pullRequest({ body: bodyWith(receipt({ visual: "nonvisual" })) }),
      checkRuns: greenChecks(),
      files,
      rules,
    });
    expect(missingVisual.merge).toBe(false);
    expect(missingVisual.reasons.join("\n")).toMatch(/visual surface/);

    const prohibitedRisk = evaluateMissionGate({
      pullRequest: pullRequest({ body: bodyWith(receipt({ risk_class: "highest" })) }),
      checkRuns: greenChecks(),
      files,
      rules,
    });
    expect(prohibitedRisk.merge).toBe(false);
    expect(prohibitedRisk.reasons.join("\n")).toMatch(
      /may travel this lane only when it cites the answered owner question/,
    );

    const migrationDiff = evaluateMissionGate({
      pullRequest: pullRequest(),
      checkRuns: greenChecks(),
      files: [{ status: "A", path: "supabase/migrations/20260901000000_x.sql" }],
      rules,
    });
    expect(migrationDiff.merge).toBe(false);

    const checkpointSurface = evaluateMissionGate({
      pullRequest: pullRequest({ body: bodyWith(receipt({ visual: "nonvisual" })) }),
      checkRuns: greenChecks(),
      files: [{ status: "M", path: "src/lib/delivery/allowlist.ts" }],
      rules,
    });
    expect(checkpointSurface.merge).toBe(false);
    expect(checkpointSurface.reasons.join("\n")).toMatch(/checkpoint-approval surface/);

    const openQuestion = evaluateMissionGate({
      pullRequest: pullRequest({ body: bodyWith(receipt({ open_owner_questions: 1 })) }),
      checkRuns: greenChecks(),
      files,
      rules,
    });
    expect(openQuestion.merge).toBe(false);

    // And the journal side refuses the same class of facts independently.
    const m = mission();
    await synced(m);
    await implemented(m);
    const state = replayState(m.repo, MISSION, m.env);
    expect(journalConjuncts(state, "WP-events-filter", HEAD).join("\n")).toMatch(
      /no clear review receipt/,
    );
  });
});

describe("Rehearsal 10 — killing the Mission Lead and starting fresh reconstructs the exact executable state", () => {
  it("reconstructs identical state and frontier in a genuinely fresh process", async () => {
    const m = mission();
    await synced(m);
    await implemented(m);
    await m.append({
      type: "owner-question",
      id: "Q-1",
      classification: "hourly",
      text: "Synthetic",
      source: "s",
      affected_packages: [],
    });
    const before = replayState(m.repo, MISSION, m.env);
    const beforeActions = nextActions(before);

    // The prior Lead is gone; nothing survives but the journal. A fresh
    // process — the real CLI — reconstructs the same state and frontier.
    const fresh = spawnSync(process.execPath, [CLI, "status", MISSION, "--json"], {
      cwd: m.repo,
      env: m.env,
      encoding: "utf8",
    });
    expect(fresh.status).toBe(0);
    const parsed = JSON.parse(fresh.stdout);
    expect(parsed.state.packages).toEqual(before.packages);
    expect(parsed.state.questions).toEqual(before.questions);
    expect(parsed.state.checkpoints).toEqual(before.checkpoints);
    expect(parsed.next_actions).toEqual(beforeActions);
  });
});

describe("Rehearsal 11 — simulated subscription exhaustion checkpoints durably and resumes fresh", () => {
  it("stops through the real CLI and resumes in another fresh process", async () => {
    const m = mission();
    await synced(m);
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [CLI, ...args], { cwd: m.repo, env: m.env, encoding: "utf8" });
    const stop = run(
      "stop",
      MISSION,
      "--reason",
      "usage-exhausted",
      "--detail",
      "simulated exhaustion",
    );
    expect(stop.status).toBe(0);
    const stopped = replayState(m.repo, MISSION, m.env);
    expect(stopped.stopped?.reason).toBe("usage-exhausted");
    expect(stopped.checkpoints).toBe(1);
    await expect(
      m.append({ type: "linear-sync-intent", package_id: "WP-events-filter" }),
    ).rejects.toThrow(/mission is stopped/);

    const resume = run("resume", MISSION);
    expect(resume.status).toBe(0);
    const resumed = JSON.parse(resume.stdout);
    expect(resumed.state.stopped).toBeNull();
    expect(resumed.next_actions.length).toBeGreaterThan(0);
  });
});

describe("Rehearsal 12 — drift and new scope stop only affected work and require a revised approved packet", () => {
  it("pauses the affected package, lets the rest continue, and resumes on revision", async () => {
    const m = mission();
    await synced(m);
    await m.append({
      type: "scope-drift",
      detail: "SRC-notion-brief moved to 2026-08-19.1 and changed REQ-events-filter",
      affected_packages: ["WP-events-filter"],
    });
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        worktree: ".claude/worktrees/a",
        branch: "feat/a",
      }),
    ).rejects.toThrow(/stopped by source drift/);
    const unaffected = await m.append({
      type: "worker-dispatched",
      package_id: "WP-attendance-export",
      worker_id: "worker-2",
      worktree: ".claude/worktrees/b",
      branch: "feat/b",
    });
    expect(unaffected.packages["WP-attendance-export"].status).toBe("active");
    await expect(m.append({ type: "packet-revised", packet })).rejects.toThrow(
      /increments packet_version/,
    );
    const revised = await m.append({
      type: "packet-revised",
      packet: { ...packet, packet_version: 2 },
    });
    expect(revised.packages["WP-events-filter"].driftStopped).toBe(false);
    expect(revised.packet.packet_version).toBe(2);
  });
});

describe("Rehearsal 13 — the existing protections continue to hold", () => {
  it("keeps the single-issue workflow, reviewer isolation, and fail-closed permissions", () => {
    const root = path.resolve(__dirname, "..");
    expect(fs.existsSync(path.join(root, ".claude", "skills", "start-issue", "SKILL.md"))).toBe(
      true,
    );
    const reviewer = fs.readFileSync(
      path.join(root, ".claude", "agents", "code-reviewer.md"),
      "utf8",
    );
    expect(reviewer).toMatch(/disallowedTools: Write, Edit, NotebookEdit, Agent, Workflow/);
    expect(reviewer).toMatch(/isolation: worktree/);
    const settings = JSON.parse(
      fs.readFileSync(path.join(root, ".claude", "settings.json"), "utf8"),
    );
    for (const rule of [
      "Bash(gh pr merge *)",
      "Bash(gh pr ready *)",
      "Bash(gh api *)",
      "Bash(gh workflow run *)",
      "Bash(supabase link *)",
      "Bash(npx supabase db push *)",
      "Edit(./.claude/**)",
    ]) {
      expect(settings.permissions.deny).toContain(rule);
    }
    expect(settings.permissions.disableBypassPermissionsMode).toBe("disable");
  });

  it("still refuses hosted database targets from the local guard", async () => {
    const { resolveLocalDatabaseUrl } = await import("../scripts/lib/local-db.mjs");
    expect(() =>
      resolveLocalDatabaseUrl("postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres"),
    ).toThrow();
    expect(() =>
      resolveLocalDatabaseUrl("postgresql://u:x@aws-0-eu-west-2.pooler.supabase.com:6543/postgres"),
    ).toThrow();
    expect(
      resolveLocalDatabaseUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
    ).toBeTruthy();
  });

  it("keeps the production and hosted boundaries stated for every role", () => {
    const root = path.resolve(__dirname, "..");
    for (const file of [
      path.join(root, ".claude", "skills", "start-issue", "SKILL.md"),
      path.join(root, ".claude", "skills", "run-mission", "SKILL.md"),
      path.join(root, ".claude", "agents", "implementation-worker.md"),
      path.join(root, ".claude", "agents", "code-reviewer.md"),
    ]) {
      expect(fs.readFileSync(file, "utf8")).toMatch(/hosted Supabase/);
    }
  });
});
