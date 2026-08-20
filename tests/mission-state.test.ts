import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LEAD_TTL_MS,
  MAX_ACTIVE_WORKERS,
  appendEvent,
  leadLeaseAvailable,
  missionPaths,
  nextActions,
  readJournal,
  reduce,
  replayState,
} from "../scripts/mission/lib/state.mjs";
import {
  AUTO_MERGE_CLASSES,
  OWNER_GATED_CLASSES,
  validatePacket,
  validateWorkflowInventory,
} from "../scripts/mission/lib/packet.mjs";
import { promoteRule, readRules, validateRule } from "../scripts/mission/lib/owner-rules.mjs";

const packet = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "mission", "approved-packet.json"), "utf8"),
);
const plan = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "mission", "three-package-plan.json"), "utf8"),
);

const MISSION = packet.mission_id as string;
const SHA = "a".repeat(40);
const temporary: string[] = [];

afterEach(() => {
  for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-mission-"));
  temporary.push(root);
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo, { recursive: true });
  const env = { ...process.env, LANCERS_MISSION_ROOT: path.join(root, "state") };
  let tick = 1_700_000_000_000;
  const append = (event: object) => appendEvent(repo, MISSION, event, { env, now: (tick += 1000) });
  return { repo, env, append };
}

const workerReceipt = (result: string) => ({
  branch: "feat/synthetic",
  worktree: ".claude/worktrees/synthetic",
  surfaces: ["src/app/events"],
  acceptance_criteria: ["filter works"],
  verification: "npm run verify observed to pass",
  ci_state: "green",
  visual_state: "pending",
  migration_implications: "none",
  limitations: "none",
  result,
});

const reviewReceipt = (result: string, sha = SHA) => ({
  review_mode: "full",
  full_review_sha: sha,
  reviewed_head_sha: sha,
  round: 1,
  result,
  blocking_finding_ids: result === "blocked" ? ["R-001"] : [],
});

/** Initialize, plan, preflight, and synchronize every package. */
async function readyMission(m: ReturnType<typeof fixture>) {
  await m.append({ type: "mission-init", packet });
  await m.append({ type: "plan-recorded", packages: plan.packages });
  await m.append({
    type: "linear-preflight",
    result: "reachable",
    detail: "synthetic fixture driver answered a read-only teams query",
  });
  for (const [index, pkg] of plan.packages.entries()) {
    await m.append({ type: "linear-sync-intent", package_id: pkg.id });
    await m.append({
      type: "linear-sync-result",
      package_id: pkg.id,
      issue_id: `LAN-90${index}`,
    });
  }
}

describe("mission packet validation", () => {
  it("accepts the synthetic approved packet", () => {
    expect(validatePacket(packet)).toEqual([]);
  });

  it("fails closed on a missing or incomplete approval", () => {
    const unapproved: Record<string, unknown> = { ...packet };
    delete unapproved.approval;
    expect(validatePacket(unapproved).join("\n")).toMatch(/unapproved packet/i);
    expect(
      validatePacket({ ...packet, approval: { approved_by: "Brian" } }).length,
    ).toBeGreaterThan(0);
  });

  it("refuses a packet that widens the autonomous-merge envelope", () => {
    const widened = {
      ...packet,
      merge_envelope: {
        auto_merge_classes: ["schema-migration"],
        owner_gated: packet.merge_envelope.owner_gated,
      },
    };
    expect(validatePacket(widened).join("\n")).toMatch(/not an approved autonomous-merge class/);
  });

  it("refuses a packet that drops an owner-gated class", () => {
    const dropped = {
      ...packet,
      merge_envelope: {
        auto_merge_classes: ["standard-application"],
        owner_gated: packet.merge_envelope.owner_gated.filter(
          (cls: string) => cls !== "schema-migration",
        ),
      },
    };
    expect(validatePacket(dropped).join("\n")).toMatch(/must retain "schema-migration"/);
  });

  it("requires pinned source versions and requirement provenance", () => {
    const unversioned = {
      ...packet,
      sources: [{ id: "SRC-x", kind: "notion", ref: "notion://x" }],
    };
    expect(validatePacket(unversioned).join("\n")).toMatch(/pins source versions/);
    const orphaned = {
      ...packet,
      requirements: [{ id: "REQ-x", text: "x", source_id: "SRC-missing" }],
    };
    expect(validatePacket(orphaned).join("\n")).toMatch(/reference a declared source/);
  });

  it("requires every packet-completeness section or an explicit not-applicable reason", () => {
    for (const section of [
      "workflow_matrix",
      "delegated_to_mission_lead",
      "nonblocking_unknowns",
      "escalation_rules",
      "repository_drift",
      "blockers",
    ]) {
      const incomplete: Record<string, unknown> = structuredClone(packet);
      delete incomplete[section];
      expect(validatePacket(incomplete).join("\n")).toContain(`${section} is required`);
    }

    const notApplicable = {
      ...packet,
      delegated_to_mission_lead: {
        status: "not_applicable",
        reason: "Synthetic mission has no delegated product decisions.",
      },
    };
    expect(validatePacket(notApplicable)).toEqual([]);
  });

  it("requires the workflow matrix to match the separately frozen inventory exactly", () => {
    expect(validateWorkflowInventory(packet, ["W1"])).toEqual([]);
    expect(validateWorkflowInventory(packet, ["W1", "W2"]).join("\n")).toMatch(
      /must match the frozen inventory exactly/,
    );
    expect(
      validateWorkflowInventory({ ...packet, workflow_matrix: [{ id: "W2" }] }, ["W1"]),
    ).toEqual([expect.stringMatching(/expected W1; received W2/)]);
  });

  it("requires a status and a pinned baseline commit, and refuses executing a not_ready packet", async () => {
    const noStatus: Record<string, unknown> = { ...packet };
    delete noStatus.status;
    expect(validatePacket(noStatus).join("\n")).toMatch(/status must be one of/);
    expect(
      validatePacket({ ...packet, baseline: { branch: "main", commit: null } }).join("\n"),
    ).toMatch(/baseline\.commit must be the full 40-character SHA/);
    // A not_ready packet is a valid document — storable, reviewable —
    // and impossible to execute.
    expect(validatePacket({ ...packet, status: "not_ready" })).toEqual([]);
    const m = fixture();
    await expect(
      m.append({ type: "mission-init", packet: { ...packet, status: "not_ready" } }),
    ).rejects.toThrow(/cannot initialize execution/);
    await m.append({ type: "mission-init", packet });
    await expect(
      m.append({
        type: "packet-revised",
        packet: { ...packet, packet_version: 2, status: "not_ready" },
      }),
    ).rejects.toThrow(/only once it is approved/);
  });

  it("keeps the merge-class vocabularies closed", () => {
    expect(AUTO_MERGE_CLASSES).toEqual(["standard-application"]);
    expect(OWNER_GATED_CLASSES).toContain("schema-migration");
    expect(OWNER_GATED_CLASSES).toContain("rls-auth-security");
    expect(OWNER_GATED_CLASSES).toContain("highest-risk");
  });
});

describe("mission initialization", () => {
  it("initializes from a valid approved packet and refuses a second init", async () => {
    const m = fixture();
    const state = await m.append({ type: "mission-init", packet });
    expect(state.initialized).toBe(true);
    await expect(m.append({ type: "mission-init", packet })).rejects.toThrow(/already initialized/);
  });

  it("refuses an invalid packet and appends nothing", async () => {
    const m = fixture();
    await expect(
      m.append({ type: "mission-init", packet: { ...packet, approval: null } }),
    ).rejects.toThrow(/Invalid packet/);
    expect(readJournal(missionPaths(m.repo, MISSION, m.env).journal)).toEqual([]);
  });

  it("refuses any event before initialization", async () => {
    const m = fixture();
    await expect(m.append({ type: "plan-recorded", packages: plan.packages })).rejects.toThrow(
      /not initialized/,
    );
  });

  it("refuses an unknown event type outright", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet });
    await expect(m.append({ type: "grant-merge-authority" })).rejects.toThrow(/Unknown event type/);
  });
});

describe("planning", () => {
  it("records the synthetic three-package DAG with collision domains and stable ids", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet });
    const state = await m.append({ type: "plan-recorded", packages: plan.packages });
    expect(Object.keys(state.packages).sort()).toEqual([
      "WP-attendance-export",
      "WP-events-filter",
      "WP-report-footer",
    ]);
    expect(state.packages["WP-report-footer"].depends_on).toEqual(["WP-attendance-export"]);
  });

  it("refuses a cycle, an unplanned dependency, and an undeclared collision domain", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet });
    const base = plan.packages[0];
    await expect(
      m.append({
        type: "plan-recorded",
        packages: [
          { ...base, id: "WP-a", depends_on: ["WP-b"] },
          { ...plan.packages[1], id: "WP-b", depends_on: ["WP-a"] },
        ],
      }),
    ).rejects.toThrow(/cycle/);
    await expect(
      m.append({
        type: "plan-recorded",
        packages: [{ ...base, depends_on: ["WP-ghost"] }],
      }),
    ).rejects.toThrow(/not planned/);
    await expect(
      m.append({
        type: "plan-recorded",
        packages: [{ ...base, collision_domain: "kitchen" }],
      }),
    ).rejects.toThrow(/collision_domain/);
  });

  it("allows replanning that preserves package ids and refuses one that drops a package", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet });
    await m.append({ type: "plan-recorded", packages: plan.packages });
    await expect(
      m.append({ type: "plan-recorded", packages: plan.packages.slice(0, 2) }),
    ).rejects.toThrow(/never silently dropped/);
    const extended = await m.append({
      type: "plan-recorded",
      packages: [
        ...plan.packages,
        {
          ...plan.packages[1],
          id: "WP-extra",
          title: "Synthetic addition",
          collision_domain: "roster",
        },
      ],
    });
    expect(Object.keys(extended.packages)).toHaveLength(4);
  });
});

describe("idempotent Linear synchronization", () => {
  it("requires intent before result, and refuses duplicates in both directions", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet });
    await m.append({ type: "plan-recorded", packages: plan.packages });
    await expect(
      m.append({ type: "linear-sync-result", package_id: "WP-events-filter", issue_id: "LAN-901" }),
    ).rejects.toThrow(/Record the intent before the result/);
    await m.append({ type: "linear-sync-intent", package_id: "WP-events-filter" });
    await expect(
      m.append({ type: "linear-sync-intent", package_id: "WP-events-filter" }),
    ).rejects.toThrow(/pending sync intent/);
    await m.append({
      type: "linear-sync-result",
      package_id: "WP-events-filter",
      issue_id: "LAN-901",
    });
    await expect(
      m.append({ type: "linear-sync-intent", package_id: "WP-events-filter" }),
    ).rejects.toThrow(/already synchronized/);
    await expect(
      m.append({ type: "linear-sync-result", package_id: "WP-events-filter", issue_id: "LAN-902" }),
    ).rejects.toThrow(/No pending sync intent|already synchronized/);
  });
});

describe("worker dispatch", () => {
  it("refuses dispatch before the connectivity preflight and before Linear synchronization", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet });
    await m.append({ type: "plan-recorded", packages: plan.packages });
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        worktree: ".claude/worktrees/wp-events",
        branch: "feat/wp-events",
      }),
    ).rejects.toThrow(/No Linear connectivity preflight|no created or reconciled Linear issue/);
  });

  it("runs two non-colliding packages and refuses the third", async () => {
    const m = fixture();
    await readyMission(m);
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/wp-events",
      branch: "feat/wp-events",
    });
    const two = await m.append({
      type: "worker-dispatched",
      package_id: "WP-attendance-export",
      worker_id: "worker-2",
      worktree: ".claude/worktrees/wp-attendance",
      branch: "feat/wp-attendance",
    });
    expect(two.activeWorkers).toHaveLength(MAX_ACTIVE_WORKERS);
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-report-footer",
        worker_id: "worker-3",
        worktree: ".claude/worktrees/wp-report",
        branch: "feat/wp-report",
      }),
    ).rejects.toThrow(/Maximum implementation concurrency is 2/);
  });

  it("serializes colliding collision domains and a second migration owner", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet });
    const colliding = [
      { ...plan.packages[0], id: "WP-events-a", migration_owner: true },
      { ...plan.packages[0], id: "WP-events-b", title: "Synthetic sibling" },
      {
        ...plan.packages[1],
        id: "WP-schema",
        title: "Synthetic migration",
        collision_domain: "schema-migrations",
        migration_owner: true,
      },
    ];
    await m.append({ type: "plan-recorded", packages: colliding });
    await m.append({
      type: "linear-preflight",
      result: "reachable",
      detail: "synthetic fixture driver",
    });
    for (const [index, pkg] of colliding.entries()) {
      await m.append({ type: "linear-sync-intent", package_id: pkg.id });
      await m.append({
        type: "linear-sync-result",
        package_id: pkg.id,
        issue_id: `LAN-91${index}`,
      });
    }
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-a",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/a",
      branch: "feat/a",
    });
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-events-b",
        worker_id: "worker-2",
        worktree: ".claude/worktrees/b",
        branch: "feat/b",
      }),
    ).rejects.toThrow(/collides with WP-events-a on domain "events"/);
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-schema",
        worker_id: "worker-2",
        worktree: ".claude/worktrees/c",
        branch: "feat/c",
      }),
    ).rejects.toThrow(/only one migration-owning package runs at a time/);
  });

  it("refuses dispatch of a package whose dependency is unmerged or whose owner question is open", async () => {
    const m = fixture();
    await readyMission(m);
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-report-footer",
        worker_id: "worker-1",
        worktree: ".claude/worktrees/wp-report",
        branch: "feat/wp-report",
      }),
    ).rejects.toThrow(/depends on WP-attendance-export, which is not merged/);
    await m.append({
      type: "owner-question",
      id: "Q-filter-default",
      classification: "hourly",
      text: "Synthetic: which filter state is the default?",
      source: "SRC-notion-brief is silent",
      affected_packages: ["WP-events-filter"],
    });
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        worktree: ".claude/worktrees/wp-events",
        branch: "feat/wp-events",
      }),
    ).rejects.toThrow(/unanswered owner question Q-filter-default/);
    await m.append({
      type: "owner-answer",
      question_id: "Q-filter-default",
      answer: "Default to upcoming events.",
      answered_by: "Brian",
      reusable: false,
    });
    const state = await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/wp-events",
      branch: "feat/wp-events",
    });
    expect(state.packages["WP-events-filter"].status).toBe("active");
  });
});

describe("worker receipts and correction lineage", () => {
  async function dispatched(m: ReturnType<typeof fixture>) {
    await readyMission(m);
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/wp-events",
      branch: "feat/wp-events",
    });
  }

  it("requires the receipt to come from the dispatched worker with every field present", async () => {
    const m = fixture();
    await dispatched(m);
    await expect(
      m.append({
        type: "worker-receipt",
        package_id: "WP-events-filter",
        worker_id: "worker-9",
        receipt: workerReceipt("completed"),
      }),
    ).rejects.toThrow(/does not match the dispatched worker/);
    const partial: Record<string, unknown> = { ...workerReceipt("completed") };
    delete partial.limitations;
    await expect(
      m.append({
        type: "worker-receipt",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        receipt: partial,
      }),
    ).rejects.toThrow(/missing `limitations`/);
  });

  it("resumes the original worker for an ordinary correction and refuses a replacement implementer", async () => {
    const m = fixture();
    await dispatched(m);
    await m.append({
      type: "worker-receipt",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      receipt: workerReceipt("completed"),
    });
    await m.append({
      type: "pr-opened",
      package_id: "WP-events-filter",
      pr_number: 41,
      head_sha: SHA,
    });
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: reviewReceipt("blocked"),
    });
    await expect(
      m.append({
        type: "correction-dispatched",
        package_id: "WP-events-filter",
        worker_id: "worker-2",
        finding_ids: ["R-001"],
      }),
    ).rejects.toThrow(/resumes the original implementation worker \(worker-1\)/);
    const state = await m.append({
      type: "correction-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      finding_ids: ["R-001"],
    });
    expect(state.activeWorkers[0]).toMatchObject({
      worker_id: "worker-1",
      kind: "correction",
      finding_ids: ["R-001"],
    });
  });

  it("routes a blocked review to a correction on the frontier, never to another review", async () => {
    const m = fixture();
    await dispatched(m);
    await m.append({
      type: "worker-receipt",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      receipt: workerReceipt("completed"),
    });
    await m.append({
      type: "pr-opened",
      package_id: "WP-events-filter",
      pr_number: 41,
      head_sha: SHA,
    });
    const state = await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: reviewReceipt("blocked"),
    });
    expect(state.packages["WP-events-filter"].status).toBe("blocked");
    const actions = nextActions(state);
    const forPackage = actions.filter((action) => action.package_id === "WP-events-filter");
    expect(forPackage.map((action) => action.action)).toContain("correction");
    expect(forPackage.map((action) => action.action)).not.toContain("review");
    expect(forPackage.find((action) => action.action === "correction")?.detail).toContain(
      "worker-1",
    );
  });

  it("holds a correction resumption to the same scheduling conjuncts as a fresh dispatch", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet });
    const colliding = [
      { ...plan.packages[0], id: "WP-events-a" },
      { ...plan.packages[0], id: "WP-events-b", title: "Synthetic sibling" },
    ];
    await m.append({ type: "plan-recorded", packages: colliding });
    await m.append({
      type: "linear-preflight",
      result: "reachable",
      detail: "synthetic fixture driver",
    });
    for (const [index, pkg] of colliding.entries()) {
      await m.append({ type: "linear-sync-intent", package_id: pkg.id });
      await m.append({
        type: "linear-sync-result",
        package_id: pkg.id,
        issue_id: `LAN-93${index}`,
      });
    }
    // WP-events-a is implemented and then blocked by review; its slot frees,
    // and the same-domain sibling takes it.
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-a",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/a",
      branch: "feat/a",
    });
    await m.append({
      type: "worker-receipt",
      package_id: "WP-events-a",
      worker_id: "worker-1",
      receipt: workerReceipt("completed"),
    });
    await m.append({ type: "pr-opened", package_id: "WP-events-a", pr_number: 45, head_sha: SHA });
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-a",
      receipt: reviewReceipt("blocked"),
    });
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-b",
      worker_id: "worker-2",
      worktree: ".claude/worktrees/b",
      branch: "feat/b",
    });
    // The correction must wait: resuming worker-1 now would put two workers
    // in the "events" collision domain at once.
    await expect(
      m.append({
        type: "correction-dispatched",
        package_id: "WP-events-a",
        worker_id: "worker-1",
        finding_ids: ["R-001"],
      }),
    ).rejects.toThrow(/collides with WP-events-b on domain "events"/);
    await m.append({
      type: "worker-receipt",
      package_id: "WP-events-b",
      worker_id: "worker-2",
      receipt: workerReceipt("completed"),
    });
    // The domain is clear, but an unanswered owner question naming the
    // package still pauses its correction.
    await m.append({
      type: "owner-question",
      id: "Q-correction-scope",
      classification: "hourly",
      text: "Synthetic: does the correction change the filter default?",
      source: "review finding R-001",
      affected_packages: ["WP-events-a"],
    });
    await expect(
      m.append({
        type: "correction-dispatched",
        package_id: "WP-events-a",
        worker_id: "worker-1",
        finding_ids: ["R-001"],
      }),
    ).rejects.toThrow(/unanswered owner question Q-correction-scope/);
    await m.append({
      type: "owner-answer",
      question_id: "Q-correction-scope",
      answer: "No; keep the default.",
      answered_by: "Brian",
      reusable: false,
    });
    const resumed = await m.append({
      type: "correction-dispatched",
      package_id: "WP-events-a",
      worker_id: "worker-1",
      finding_ids: ["R-001"],
    });
    expect(resumed.activeWorkers[0]).toMatchObject({ worker_id: "worker-1", kind: "correction" });
  });
});

describe("owner questions, answers, and visual approval", () => {
  it("classifies questions, refuses duplicates, and records answers exactly once", async () => {
    const m = fixture();
    await readyMission(m);
    await expect(
      m.append({
        type: "owner-question",
        id: "Q-1",
        classification: "whenever",
        text: "x",
        source: "y",
        affected_packages: [],
      }),
    ).rejects.toThrow(/"immediate" or "hourly"/);
    await m.append({
      type: "owner-question",
      id: "Q-1",
      classification: "immediate",
      text: "Synthetic blocker",
      source: "conflict",
      affected_packages: ["WP-events-filter"],
    });
    await expect(
      m.append({
        type: "owner-question",
        id: "Q-1",
        classification: "hourly",
        text: "again",
        source: "again",
        affected_packages: [],
      }),
    ).rejects.toThrow(/already exists/);
    await m.append({
      type: "owner-answer",
      question_id: "Q-1",
      answer: "Do the simple thing.",
      answered_by: "Brian",
      reusable: true,
    });
    await expect(
      m.append({
        type: "owner-answer",
        question_id: "Q-1",
        answer: "twice",
        answered_by: "Brian",
        reusable: false,
      }),
    ).rejects.toThrow(/already answered/);
  });

  it("refuses visual approval of nonvisual work", async () => {
    const m = fixture();
    await readyMission(m);
    await expect(
      m.append({
        type: "visual-approval",
        package_id: "WP-attendance-export",
        approved_by: "Brian",
        evidence: "live review",
      }),
    ).rejects.toThrow(/nonvisual/);
  });
});

describe("guarded merge recording", () => {
  async function reviewedClear(m: ReturnType<typeof fixture>, packageId: string) {
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
      receipt: workerReceipt("completed"),
    });
    await m.append({ type: "pr-opened", package_id: packageId, pr_number: 42, head_sha: SHA });
    await m.append({
      type: "review-receipt",
      package_id: packageId,
      receipt: reviewReceipt("clear"),
    });
  }

  it("records a qualifying guarded merge only with clear review at the exact SHA and visual approval", async () => {
    const m = fixture();
    await readyMission(m);
    await reviewedClear(m, "WP-events-filter");
    await expect(
      m.append({
        type: "merge-recorded",
        package_id: "WP-events-filter",
        pr_number: 42,
        sha: SHA,
        route: "guarded-auto",
      }),
    ).rejects.toThrow(/recorded visual approval/);
    await m.append({
      type: "visual-approval",
      package_id: "WP-events-filter",
      approved_by: "Brian",
      evidence: "live review at checkpoint 1",
    });
    await expect(
      m.append({
        type: "merge-recorded",
        package_id: "WP-events-filter",
        pr_number: 42,
        sha: "b".repeat(40),
        route: "guarded-auto",
      }),
    ).rejects.toThrow(/clear review receipt at exactly/);
    const state = await m.append({
      type: "merge-recorded",
      package_id: "WP-events-filter",
      pr_number: 42,
      sha: SHA,
      route: "guarded-auto",
    });
    expect(state.packages["WP-events-filter"].status).toBe("merged");
  });

  it("clears visual approval on a correction and on a new head — Brian approved what he saw", async () => {
    const B = "b".repeat(40);
    const m = fixture();
    await readyMission(m);
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/wp-events",
      branch: "feat/wp-events",
    });
    await m.append({
      type: "worker-receipt",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      receipt: workerReceipt("completed"),
    });
    await m.append({
      type: "pr-opened",
      package_id: "WP-events-filter",
      pr_number: 42,
      head_sha: SHA,
    });
    const approved = await m.append({
      type: "visual-approval",
      package_id: "WP-events-filter",
      approved_by: "Brian",
      evidence: "live review at checkpoint 1",
    });
    expect(approved.packages["WP-events-filter"].visual_approval.head_sha).toBe(SHA);
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: reviewReceipt("blocked"),
    });
    const corrected = await m.append({
      type: "correction-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      finding_ids: ["R-001"],
    });
    expect(corrected.packages["WP-events-filter"].visual_approved).toBe(false);
    await m.append({
      type: "worker-receipt",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      receipt: workerReceipt("completed"),
    });
    await m.append({
      type: "pr-opened",
      package_id: "WP-events-filter",
      pr_number: 42,
      head_sha: B,
    });
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: reviewReceipt("clear", B),
    });
    await expect(
      m.append({
        type: "merge-recorded",
        package_id: "WP-events-filter",
        pr_number: 42,
        sha: B,
        route: "guarded-auto",
      }),
    ).rejects.toThrow(/recorded visual approval/);
    await m.append({
      type: "visual-approval",
      package_id: "WP-events-filter",
      approved_by: "Brian",
      evidence: "live review at checkpoint 2, corrected head",
    });
    const merged = await m.append({
      type: "merge-recorded",
      package_id: "WP-events-filter",
      pr_number: 42,
      sha: B,
      route: "guarded-auto",
    });
    expect(merged.packages["WP-events-filter"].status).toBe("merged");
  });

  it("clears visual approval when a new head appears with no correction in between", async () => {
    // The head can move outside the correction path — a worker pushes again
    // and records the new head. This test is deliberately sensitive to the
    // pr-opened mismatch branch alone: no blocked review, no correction
    // dispatch, so nothing else clears the approval first.
    const B = "b".repeat(40);
    const m = fixture();
    await readyMission(m);
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/wp-events",
      branch: "feat/wp-events",
    });
    await m.append({
      type: "worker-receipt",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      receipt: workerReceipt("completed"),
    });
    await m.append({
      type: "pr-opened",
      package_id: "WP-events-filter",
      pr_number: 42,
      head_sha: SHA,
    });
    const approved = await m.append({
      type: "visual-approval",
      package_id: "WP-events-filter",
      approved_by: "Brian",
      evidence: "live review at checkpoint 1",
    });
    expect(approved.packages["WP-events-filter"].visual_approved).toBe(true);
    const moved = await m.append({
      type: "pr-opened",
      package_id: "WP-events-filter",
      pr_number: 42,
      head_sha: B,
    });
    expect(moved.packages["WP-events-filter"].visual_approved).toBe(false);
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: reviewReceipt("clear", B),
    });
    await expect(
      m.append({
        type: "merge-recorded",
        package_id: "WP-events-filter",
        pr_number: 42,
        sha: B,
        route: "guarded-auto",
      }),
    ).rejects.toThrow(/recorded visual approval/);
    // A repeat of the SAME head does not clear a live approval.
    await m.append({
      type: "visual-approval",
      package_id: "WP-events-filter",
      approved_by: "Brian",
      evidence: "live review at checkpoint 2, new head",
    });
    const repeated = await m.append({
      type: "pr-opened",
      package_id: "WP-events-filter",
      pr_number: 42,
      head_sha: B,
    });
    expect(repeated.packages["WP-events-filter"].visual_approved).toBe(true);
  });

  it("refuses late review receipts and corrections on merged work, and replay never regresses it", async () => {
    const m = fixture();
    await readyMission(m);
    await reviewedClear(m, "WP-events-filter");
    await m.append({
      type: "visual-approval",
      package_id: "WP-events-filter",
      approved_by: "Brian",
      evidence: "live review at checkpoint 1",
    });
    await m.append({
      type: "merge-recorded",
      package_id: "WP-events-filter",
      pr_number: 42,
      sha: SHA,
      route: "guarded-auto",
    });
    await expect(
      m.append({
        type: "review-receipt",
        package_id: "WP-events-filter",
        receipt: reviewReceipt("blocked"),
      }),
    ).rejects.toThrow(/already merged; a late or duplicate review receipt is refused/);
    await expect(
      m.append({
        type: "correction-dispatched",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        finding_ids: ["R-009"],
      }),
    ).rejects.toThrow(/already merged/);
    // Even a journal that somehow contains the late receipt cannot regress
    // merged work on replay, and the frontier offers nothing for it.
    const events = readJournal(missionPaths(m.repo, MISSION, m.env).journal);
    const replayed = reduce([
      ...events,
      {
        type: "review-receipt",
        at: "later",
        package_id: "WP-events-filter",
        receipt: reviewReceipt("blocked"),
      },
    ]);
    expect(replayed.packages["WP-events-filter"].status).toBe("merged");
    expect(
      nextActions(replayed).filter((action) => action.package_id === "WP-events-filter"),
    ).toEqual([]);
  });

  it("never guarded-merges highest-risk or migration-owning work; the owner route remains", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet });
    const risky = [
      { ...plan.packages[1], id: "WP-risky", risk_class: "highest" },
      {
        ...plan.packages[1],
        id: "WP-migration",
        collision_domain: "schema-migrations",
        migration_owner: true,
      },
    ];
    await m.append({ type: "plan-recorded", packages: risky });
    await m.append({
      type: "linear-preflight",
      result: "reachable",
      detail: "synthetic fixture driver",
    });
    for (const [index, pkg] of risky.entries()) {
      await m.append({ type: "linear-sync-intent", package_id: pkg.id });
      await m.append({
        type: "linear-sync-result",
        package_id: pkg.id,
        issue_id: `LAN-92${index}`,
      });
    }
    await expect(
      m.append({
        type: "merge-recorded",
        package_id: "WP-risky",
        pr_number: 43,
        sha: SHA,
        route: "guarded-auto",
      }),
    ).rejects.toThrow(/Highest-risk work cannot autonomous-merge in v1/);
    await expect(
      m.append({
        type: "merge-recorded",
        package_id: "WP-migration",
        pr_number: 44,
        sha: SHA,
        route: "guarded-auto",
      }),
    ).rejects.toThrow(/owner-merged, never autonomous/);
    const state = await m.append({
      type: "merge-recorded",
      package_id: "WP-migration",
      pr_number: 44,
      sha: SHA,
      route: "owner",
    });
    expect(state.packages["WP-migration"].merged.route).toBe("owner");
  });
});

describe("drift, stops, and resumption", () => {
  it("clears an abandoned worker without losing package history", async () => {
    const m = fixture();
    await readyMission(m);
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-crashed",
      worktree: ".claude/worktrees/wp-events",
      branch: "feat/wp-events",
    });
    const state = await m.append({
      type: "worker-abandoned",
      package_id: "WP-events-filter",
      reason: "worker process exited without a receipt",
    });
    expect(state.activeWorkers).toEqual([]);
    expect(state.packages["WP-events-filter"].status).toBe("synced");
    expect(state.packages["WP-events-filter"].abandoned_workers).toHaveLength(1);
  });
  it("stops only drift-affected work and resumes it with a revised approved packet", async () => {
    const m = fixture();
    await readyMission(m);
    await m.append({
      type: "scope-drift",
      detail: "SRC-notion-brief moved to version 2026-08-19.1",
      affected_packages: ["WP-events-filter"],
    });
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        worktree: ".claude/worktrees/wp-events",
        branch: "feat/wp-events",
      }),
    ).rejects.toThrow(/stopped by source drift/);
    const unaffected = await m.append({
      type: "worker-dispatched",
      package_id: "WP-attendance-export",
      worker_id: "worker-2",
      worktree: ".claude/worktrees/wp-attendance",
      branch: "feat/wp-attendance",
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
  });

  it("accepts only checkpoint, heartbeat, answers, and resume while stopped", async () => {
    const m = fixture();
    await readyMission(m);
    await m.append({ type: "checkpoint", number: 1 });
    await m.append({
      type: "mission-stopped",
      reason: "usage-exhausted",
      detail: "Simulated Claude Max exhaustion",
    });
    await expect(
      m.append({ type: "linear-sync-intent", package_id: "WP-events-filter" }),
    ).rejects.toThrow(/mission is stopped/);
    const resumed = await m.append({
      type: "mission-resumed",
      lead_id: "lead-resumed",
      pid: 4242,
    });
    expect(resumed.stopped).toBeNull();
    expect(resumed.lead).toMatchObject({ lead_id: "lead-resumed", pid: 4242 });
  });

  it("numbers checkpoints consecutively", async () => {
    const m = fixture();
    await readyMission(m);
    await expect(m.append({ type: "checkpoint", number: 5 })).rejects.toThrow(/expected 1/);
    await m.append({ type: "checkpoint", number: 1 });
    await m.append({ type: "checkpoint", number: 2 });
  });
});

describe("durable reconstruction", () => {
  it("replays the journal into identical state and identical next actions for a fresh Lead", async () => {
    const m = fixture();
    await readyMission(m);
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/wp-events",
      branch: "feat/wp-events",
    });
    const before = replayState(m.repo, MISSION, m.env);
    const events = readJournal(missionPaths(m.repo, MISSION, m.env).journal);
    const after = reduce(events);
    expect(after).toEqual(before);
    expect(nextActions(after)).toEqual(nextActions(before));
    expect(nextActions(after).map((action) => action.action)).toContain("dispatch");
  });

  it("holds the Lead lease for a live pid and frees it only when expired and dead", () => {
    const state = reduce([
      { type: "mission-init", at: "2026-08-18T10:00:00.000Z", packet },
      {
        type: "lead-heartbeat",
        at: "2026-08-18T10:00:00.000Z",
        lead_id: "lead-one",
        pid: 111,
      },
    ]);
    const start = Date.parse("2026-08-18T10:00:00.000Z");
    const alive = () => undefined;
    const dead = () => {
      throw Object.assign(new Error("gone"), { code: "ESRCH" });
    };
    expect(
      leadLeaseAvailable(state, { leadId: "lead-one", pid: 111, now: start, probe: alive }),
    ).toBe(true);
    expect(
      leadLeaseAvailable(state, { leadId: "lead-two", pid: 222, now: start + 1000, probe: alive }),
    ).toBe(false);
    expect(
      leadLeaseAvailable(state, {
        leadId: "lead-two",
        pid: 222,
        now: start + LEAD_TTL_MS + 1000,
        probe: alive,
      }),
    ).toBe(false);
    expect(
      leadLeaseAvailable(state, {
        leadId: "lead-two",
        pid: 222,
        now: start + LEAD_TTL_MS + 1000,
        probe: dead,
      }),
    ).toBe(true);
  });
});

describe("owner rule registry", () => {
  const rule = {
    id: "RULE-UI-007",
    scope: "Ordinary administrative list pages",
    rule: "Default to 25-row pagination unless a more specific workflow rule exists",
    exceptions: ["Roster prioritizes maximum useful single-page information density"],
    source: "Brian",
    date: "2026-08-18",
    status: "approved",
    approval_evidence: "Checkpoint 2 answer: 'make that a standing rule'",
    source_mission: "M-SYNTHETIC-REHEARSAL",
  };

  it("promotes an approved rule once and refuses a duplicate id", async () => {
    const m = fixture();
    await promoteRule(m.repo, rule, m.env);
    expect(readRules(m.repo, m.env).rules).toHaveLength(1);
    await expect(promoteRule(m.repo, rule, m.env)).rejects.toThrow(/already exists/);
  });

  it("refuses promotion without explicit approval evidence or approved status", () => {
    expect(validateRule({ ...rule, status: "proposed" }).join("\n")).toMatch(/"approved"/);
    expect(validateRule({ ...rule, approval_evidence: "" }).join("\n")).toMatch(
      /explicitly approved reuse/,
    );
    expect(validateRule(rule)).toEqual([]);
  });
});
