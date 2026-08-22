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
  COLLISION_DOMAINS,
  OWNER_GATED_CLASSES,
  validatePackage,
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

/**
 * A plan event with a valid decomposition and separations, so a test that is
 * about cycles, domains or dependencies asserts that and not LAN-148 §A's
 * bookkeeping. Tests that are about the bookkeeping build their own.
 */
type PlanPackage = Record<string, unknown> & { separation?: Record<string, string> };

const planEvent = (packages: PlanPackage[], extra: object = {}) => ({
  type: "plan-recorded",
  packages: packages.map((pkg) =>
    packages.length > 1 && !pkg.separation
      ? { ...pkg, separation: plan.packages[0].separation }
      : pkg,
  ),
  decomposition: {
    ...plan.decomposition,
    critical_path: packages.length ? [packages[0].id] : [],
  },
  ...extra,
});

/** The UX sources §E requires of user-facing work. */
const uxSources = {
  slice_ux: "docs/ux/slice-ux.md",
  standards: "docs/ux/standards.md",
  ticket_contract: "docs/ux/tickets/LAN-900-events-filter.md",
  wireframes: "docs/ux/wireframes/events-filter-desktop.png, events-filter-375.png",
};

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
  ux_sources: uxSources,
  result,
});

/** A correction's receipt, carrying the bounded injection proof §D requires. */
const correctionReceipt = (findingIds: string[], sha = SHA) => ({
  ...workerReceipt("completed"),
  injection_evidence: findingIds.map((finding_id) => ({
    finding_id,
    test: "tests/mission-state.test.ts > the corrected behaviour",
    command: "npx vitest run tests/mission-state.test.ts -t 'the corrected behaviour'",
    failing_output: "AssertionError: expected the guard to refuse, but it allowed",
    restored_pass: "1 passed",
    sha,
  })),
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

/** LAN-148 §D: Brian is asked to judge the integrated result, so the walker
 * runs against the head he will be shown before any visual approval. */
const walked = (m: ReturnType<typeof fixture>, sha = SHA) =>
  m.append({
    type: "integrated-review",
    mode: "workflow-walker",
    head_sha: sha,
    result: "clear",
    jobs_completed: "Signed in, drafted a practice, confirmed its audience and took the register.",
  });

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
  return m.append({
    type: "review-receipt",
    package_id: packageId,
    receipt: reviewReceipt("clear"),
  });
}

describe("mission packet validation", () => {
  it("accepts the synthetic approved packet", () => {
    expect(validatePacket(packet)).toEqual([]);
  });

  /**
   * LAN-148. The first live mission advertised a fenced Lead but held none
   * until a heartbeat happened to be recorded, so a second Lead could have
   * taken the mission during that window. Initialization is the fence.
   */
  it("accepts presentation and operational-script collision domains", () => {
    for (const domain of ["ui-presentation", "operational-scripts"]) {
      expect(COLLISION_DOMAINS).toContain(domain);
      expect(validatePackage({ ...plan.packages[0], collision_domain: domain }, packet)).toEqual(
        [],
      );
    }
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
      m.append({
        type: "mission-init",
        packet: { ...packet, status: "not_ready" },
        lead_id: "lead-fixture",
        pid: 4242,
      }),
    ).rejects.toThrow(/cannot initialize execution/);
    await m.append({ type: "mission-init", packet, lead_id: "lead-fixture", pid: 4242 });
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
    const state = await m.append({
      type: "mission-init",
      packet,
      lead_id: "lead-fixture",
      pid: 4242,
    });
    expect(state.initialized).toBe(true);
    await expect(
      m.append({ type: "mission-init", packet, lead_id: "lead-fixture", pid: 4242 }),
    ).rejects.toThrow(/already initialized/);
  });

  it("refuses an invalid packet and appends nothing", async () => {
    const m = fixture();
    await expect(
      m.append({
        type: "mission-init",
        packet: { ...packet, approval: null },
        lead_id: "lead-fixture",
        pid: 4242,
      }),
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
    await m.append({ type: "mission-init", packet, lead_id: "lead-fixture", pid: 4242 });
    await expect(m.append({ type: "grant-merge-authority" })).rejects.toThrow(/Unknown event type/);
  });
});

describe("planning", () => {
  it("records the synthetic three-package DAG with collision domains and stable ids", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet, lead_id: "lead-fixture", pid: 4242 });
    const state = await m.append({
      type: "plan-recorded",
      packages: plan.packages,
      decomposition: plan.decomposition,
    });
    await m.append({
      type: "plan-approved",
      approved_by: "Brian",
      evidence: "decomposition and owner cost presented at checkpoint 1",
    });
    expect(Object.keys(state.packages).sort()).toEqual([
      "WP-attendance-export",
      "WP-events-filter",
      "WP-report-footer",
    ]);
    expect(state.packages["WP-report-footer"].depends_on).toEqual(["WP-attendance-export"]);
  });

  it("refuses a cycle, an unplanned dependency, and an undeclared collision domain", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet, lead_id: "lead-fixture", pid: 4242 });
    const base = plan.packages[0];
    await expect(
      m.append(
        planEvent([
          { ...base, id: "WP-a", depends_on: ["WP-b"] },
          { ...plan.packages[1], id: "WP-b", depends_on: ["WP-a"] },
        ]),
      ),
    ).rejects.toThrow(/cycle/);
    await expect(m.append(planEvent([{ ...base, depends_on: ["WP-ghost"] }]))).rejects.toThrow(
      /not planned/,
    );
    await expect(m.append(planEvent([{ ...base, collision_domain: "kitchen" }]))).rejects.toThrow(
      /collision_domain/,
    );
  });

  it("allows replanning that preserves package ids and refuses one that drops a package", async () => {
    const m = fixture();
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
    // Silently dropping is still refused.
    await expect(m.append(planEvent(plan.packages.slice(0, 2)))).rejects.toThrow(
      /dropped WP-report-footer without recording it/,
    );

    // Combining it away before anything durable exists is the point of §A.
    const combined = await m.append(
      planEvent(plan.packages.slice(0, 2), {
        removals: [
          {
            package_id: "WP-report-footer",
            reason:
              "Combined into WP-attendance-export: the footer is three lines of the same report and needed no second review round or merge.",
          },
        ],
      }),
    );
    expect(combined.packages["WP-report-footer"].status).toBe("removed");
    expect(combined.packages["WP-report-footer"].removed.reason).toMatch(/Combined into/);
    // Lineage survives; the frontier does not offer it.
    expect(nextActions(combined).some((a) => a.package_id === "WP-report-footer")).toBe(false);
    // And the revision withdrew the approval it no longer describes.
    expect(combined.planApproved).toBeNull();

    const extended = await m.append(
      planEvent([
        ...plan.packages,
        {
          ...plan.packages[1],
          id: "WP-extra",
          title: "Synthetic addition",
          collision_domain: "roster",
        },
      ]),
    );
    expect(Object.keys(extended.packages)).toHaveLength(4);
  });

  it("protects a package's identity once it has become durable", async () => {
    const m = fixture();
    await readyMission(m);
    await expect(
      m.append(
        planEvent(plan.packages.slice(0, 2), {
          removals: [{ package_id: "WP-report-footer", reason: "second thoughts" }],
        }),
      ),
    ).rejects.toThrow(/has already become durable .*identity and lineage are protected/);
  });

  it("refuses a split that is only a preference, and names what it costs", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet, lead_id: "lead-fixture", pid: 4242 });
    for (const reason of ["risk", "directory", "tidiness", "agent-time"]) {
      await expect(
        m.append({
          type: "plan-recorded",
          decomposition: plan.decomposition,
          packages: plan.packages.map((pkg: PlanPackage) => ({
            ...pkg,
            separation: { ...pkg.separation, reason },
          })),
        }),
      ).rejects.toThrow(new RegExp(`"${reason}" is not a boundary`));
    }
    // And a real boundary still has to say what it costs Brian.
    await expect(
      m.append({
        type: "plan-recorded",
        decomposition: plan.decomposition,
        packages: plan.packages.map((pkg: PlanPackage) => ({
          ...pkg,
          separation: { ...pkg.separation, owner_cost: "" },
        })),
      }),
    ).rejects.toThrow(/owner_cost must state what this split costs Brian/);
  });

  it("creates nothing durable until the decomposition is approved", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet, lead_id: "lead-fixture", pid: 4242 });
    await m.append(planEvent(plan.packages));
    await m.append({
      type: "linear-preflight",
      result: "reachable",
      detail: "synthetic fixture driver answered a read-only teams query",
    });
    await expect(
      m.append({ type: "linear-sync-intent", package_id: "WP-events-filter" }),
    ).rejects.toThrow(/plan is not approved/);
    expect(
      nextActions(await m.append({ type: "lead-heartbeat", lead_id: "l", pid: 1 })).some(
        (a) => a.action === "plan-approval",
      ),
    ).toBe(true);

    await m.append({
      type: "plan-approved",
      approved_by: "Brian",
      evidence: "decomposition and owner cost presented at checkpoint 1",
    });
    await expect(
      m.append({ type: "linear-sync-intent", package_id: "WP-events-filter" }),
    ).resolves.toBeTruthy();
  });
});

describe("idempotent Linear synchronization", () => {
  it("requires intent before result, and refuses duplicates in both directions", async () => {
    const m = fixture();
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
    await m.append({ type: "mission-init", packet, lead_id: "lead-fixture", pid: 4242 });
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
    await m.append(planEvent(colliding));
    await m.append({
      type: "plan-approved",
      approved_by: "Brian",
      evidence: "checkpoint 1",
    });
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

  /**
   * LAN-148 §F. In the first live run a downstream package sat idle for hours
   * because its dependency's pull request was reviewed, green and correct but
   * unmerged — Brian's merge timing had become a scheduling dependency. A
   * dependency reviewed clean at exactly the head its pull request carries is a
   * deterministic base; his merge authority is untouched.
   */
  it("dispatches on a dependency reviewed clean at its exact head, without waiting for the merge", async () => {
    const m = fixture();
    await readyMission(m);
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-attendance-export",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/wp-attendance",
      branch: "feat/wp-attendance",
    });
    await m.append({
      type: "worker-receipt",
      package_id: "WP-attendance-export",
      worker_id: "worker-1",
      receipt: workerReceipt("completed"),
    });
    await m.append({
      type: "pr-opened",
      package_id: "WP-attendance-export",
      pr_number: 41,
      head_sha: SHA,
    });
    await m.append({
      type: "review-receipt",
      package_id: "WP-attendance-export",
      receipt: reviewReceipt("clear"),
    });

    // The frontier now offers the downstream package, and says what it is
    // standing on.
    const reviewed = replayState(m.repo, MISSION, m.env);
    const offer = nextActions(reviewed).find(
      (action) => action.action === "dispatch" && action.package_id === "WP-report-footer",
    );
    expect(offer?.detail).toMatch(/recording the reviewed head of WP-attendance-export/);

    // Building on it without recording that basis is refused.
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-report-footer",
        worker_id: "worker-2",
        worktree: ".claude/worktrees/wp-report",
        branch: "feat/wp-report",
      }),
    ).rejects.toThrow(/builds on unmerged WP-attendance-export; the dispatch records that basis/);

    // A basis pinned to the wrong commit is refused too.
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-report-footer",
        worker_id: "worker-2",
        worktree: ".claude/worktrees/wp-report",
        branch: "feat/wp-report",
        dependency_basis: [{ package_id: "WP-attendance-export", head_sha: "b".repeat(40) }],
      }),
    ).rejects.toThrow(/but the reviewed head is/);

    const dispatched = await m.append({
      type: "worker-dispatched",
      package_id: "WP-report-footer",
      worker_id: "worker-2",
      worktree: ".claude/worktrees/wp-report",
      branch: "feat/wp-report",
      dependency_basis: [{ package_id: "WP-attendance-export", head_sha: SHA }],
    });
    expect(dispatched.packages["WP-report-footer"].status).toBe("active");
  });

  it("refuses a dependency whose head moved after its review, and records a deliberate wait", async () => {
    const m = fixture();
    await readyMission(m);
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-attendance-export",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/wp-attendance",
      branch: "feat/wp-attendance",
    });
    await m.append({
      type: "worker-receipt",
      package_id: "WP-attendance-export",
      worker_id: "worker-1",
      receipt: workerReceipt("completed"),
    });
    await m.append({
      type: "pr-opened",
      package_id: "WP-attendance-export",
      pr_number: 41,
      head_sha: SHA,
    });
    await m.append({
      type: "review-receipt",
      package_id: "WP-attendance-export",
      receipt: reviewReceipt("clear"),
    });
    // A new commit lands after the review; the base is no longer the reviewed one.
    await m.append({
      type: "pr-opened",
      package_id: "WP-attendance-export",
      pr_number: 41,
      head_sha: "c".repeat(40),
    });

    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-report-footer",
        worker_id: "worker-2",
        worktree: ".claude/worktrees/wp-report",
        branch: "feat/wp-report",
        dependency_basis: [{ package_id: "WP-attendance-export", head_sha: SHA }],
      }),
    ).rejects.toThrow(/but its pull request now carries/);

    // Choosing to wait for a merge the evidence does not require is a decision
    // the journal has to be able to show.
    const deferred = await m.append({
      type: "dispatch-deferred",
      package_id: "WP-report-footer",
      reason:
        "The export's migration has to be applied to the shared local stack before the footer can be verified against it.",
    });
    expect(deferred.dispatchDeferrals).toHaveLength(1);
    await expect(
      m.append({ type: "dispatch-deferred", package_id: "WP-report-footer" }),
    ).rejects.toThrow(/records the concrete safety or integration reason/);
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
    ).rejects.toThrow(
      /cannot start on WP-attendance-export: WP-attendance-export has no clear independent review/,
    );
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
    await m.append({ type: "mission-init", packet, lead_id: "lead-fixture", pid: 4242 });
    const colliding = [
      { ...plan.packages[0], id: "WP-events-a" },
      { ...plan.packages[0], id: "WP-events-b", title: "Synthetic sibling" },
    ];
    await m.append(planEvent(colliding));
    await m.append({
      type: "plan-approved",
      approved_by: "Brian",
      evidence: "checkpoint 1",
    });
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
    await walked(m);
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
    await walked(m);
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
      receipt: correctionReceipt(["R-001"], B),
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
    // The corrected head is a different integrated result, so it is walked again.
    await walked(m, B);
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
    await walked(m);
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
    await walked(m, B);
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

  /**
   * LAN-148. The rule review receipts already carried, now carried by worker
   * receipts too. In the first live run a worker returned after its package
   * had been merged, and the package walked backwards from "merged" to
   * "implemented" — re-opening a finished lifecycle and offering review and
   * merge-gate actions for work that had already shipped.
   */
  it("refuses a late worker receipt on merged work, and replay never regresses it", async () => {
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
      type: "merge-recorded",
      package_id: "WP-events-filter",
      sha: SHA,
      route: "owner",
    });

    await expect(
      m.append({
        type: "worker-receipt",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        receipt: workerReceipt("completed"),
      }),
    ).rejects.toThrow(/already merged; a late worker receipt is refused/);

    const events = readJournal(missionPaths(m.repo, MISSION, m.env).journal);
    const replayed = reduce([
      ...events,
      {
        type: "worker-receipt",
        at: "later",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        receipt: workerReceipt("completed"),
      },
    ]);
    expect(replayed.packages["WP-events-filter"].status).toBe("merged");
    // The evidence is kept even though the lifecycle does not move.
    expect(replayed.packages["WP-events-filter"].receipts).toHaveLength(1);
    expect(nextActions(replayed).some((action) => action.package_id === "WP-events-filter")).toBe(
      false,
    );
  });

  it("fences the mission from initialization, before any heartbeat", async () => {
    const m = fixture();
    const state = await m.append({
      type: "mission-init",
      packet,
      lead_id: "lead-one",
      pid: 4242,
    });
    expect(state.lead).toMatchObject({ lead_id: "lead-one", pid: 4242 });
    expect(
      leadLeaseAvailable(state, {
        leadId: "lead-two",
        now: Date.parse(state.lead.at),
        probe: () => true,
      }),
    ).toBe(false);
    expect(leadLeaseAvailable(state, { leadId: "lead-one" })).toBe(true);
  });

  it("refuses an initialization that carries no fence", async () => {
    const m = fixture();
    await expect(m.append({ type: "mission-init", packet })).rejects.toThrow(
      /stable Lead identity/,
    );
  });

  it("refuses late review receipts and corrections on merged work, and replay never regresses it", async () => {
    const m = fixture();
    await readyMission(m);
    await reviewedClear(m, "WP-events-filter");
    await walked(m);
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

  /**
   * LAN-148 §F. The blanket refusal made the checkpoint-approval tier Brian
   * approved on 2026-08-18 unreachable for the work it was designed for:
   * authorization rules are graded Highest, so the tier could never fire and
   * every reviewed authorization change queued behind his merge click.
   * Highest-risk work now travels the lane only once an answered checkpoint
   * names it. Migrations, and every path in the prohibited list, stay his.
   */
  it("lets a checkpoint-approved highest-risk package merge, and never a migration owner", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet, lead_id: "lead-fixture", pid: 4242 });
    const risky = [
      { ...plan.packages[1], id: "WP-risky", risk_class: "highest" },
      {
        ...plan.packages[1],
        id: "WP-migration",
        collision_domain: "schema-migrations",
        migration_owner: true,
      },
    ];
    await m.append(planEvent(risky));
    await m.append({
      type: "plan-approved",
      approved_by: "Brian",
      evidence: "checkpoint 1",
    });
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
    ).rejects.toThrow(/only when an answered owner checkpoint names it/);
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

    // Now give the highest-risk package what the tier actually asks for: an
    // answered checkpoint question naming it, a clear review at the exact head,
    // and — it is nonvisual — nothing else.
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-risky",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/wp-risky",
      branch: "feat/wp-risky",
    });
    await m.append({
      type: "worker-receipt",
      package_id: "WP-risky",
      worker_id: "worker-1",
      receipt: workerReceipt("completed"),
    });
    await m.append({ type: "pr-opened", package_id: "WP-risky", pr_number: 43, head_sha: SHA });
    await m.append({
      type: "review-receipt",
      package_id: "WP-risky",
      receipt: reviewReceipt("clear"),
    });
    await m.append({
      type: "owner-question",
      id: "Q-authorization-rule",
      classification: "hourly",
      text: "Synthetic: this widens who may end a role. Confirm before it merges.",
      source: "the authorization rule this package changes",
      affected_packages: ["WP-risky"],
    });

    // Unanswered, it is still refused — the ask cannot be skipped.
    await expect(
      m.append({
        type: "merge-recorded",
        package_id: "WP-risky",
        pr_number: 43,
        sha: SHA,
        route: "guarded-auto",
      }),
    ).rejects.toThrow(/Unresolved owner question Q-authorization-rule/);

    await m.append({
      type: "owner-answer",
      question_id: "Q-authorization-rule",
      answer: "Confirmed; that is the intended rule.",
      answered_by: "Brian",
      reusable: false,
    });
    const merged = await m.append({
      type: "merge-recorded",
      package_id: "WP-risky",
      pr_number: 43,
      sha: SHA,
      route: "guarded-auto",
    });
    expect(merged.packages["WP-risky"].merged.route).toBe("guarded-auto");
  });

  it("counts routing a lane-qualified package to Brian as a recorded harness defect", async () => {
    const m = fixture();
    await readyMission(m);
    await reviewedClear(m, "WP-attendance-export");

    // It qualifies: normal risk, nonvisual, clear review at the exact head.
    await expect(
      m.append({
        type: "merge-recorded",
        package_id: "WP-attendance-export",
        sha: SHA,
        route: "owner",
      }),
    ).rejects.toThrow(/qualified for the guarded lane; routing it to Brian anyway records why/);

    const state = await m.append({
      type: "merge-recorded",
      package_id: "WP-attendance-export",
      sha: SHA,
      route: "owner",
      owner_route_reason:
        "The mission-merge workflow was disabled during the incident, so the lane was unavailable.",
    });
    expect(state.laneBypasses).toHaveLength(1);
    expect(state.laneBypasses[0].package_id).toBe("WP-attendance-export");
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

describe("reviewing the thing the packages add up to", () => {
  /**
   * LAN-148 §D. Package-scoped review caught serious defects in the first live
   * run and missed twelve usability and consistency ones, because nobody
   * reviewed what the packages add up to. Brian is asked to judge the
   * integrated result, so the walker runs against the head he will be shown.
   */
  it("refuses a visual approval that no walker covers, and accepts one that is walked", async () => {
    const m = fixture();
    await readyMission(m);
    await reviewedClear(m, "WP-events-filter");

    await expect(
      m.append({
        type: "visual-approval",
        package_id: "WP-events-filter",
        approved_by: "Brian",
        evidence: "live review",
      }),
    ).rejects.toThrow(/No clear workflow-walker review covers/);

    // A walker at a different head is not a walker at this one.
    await m.append({
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: "d".repeat(40),
      result: "clear",
      jobs_completed: "Walked a different head entirely.",
    });
    await expect(
      m.append({
        type: "visual-approval",
        package_id: "WP-events-filter",
        approved_by: "Brian",
        evidence: "live review",
      }),
    ).rejects.toThrow(/No clear workflow-walker review covers/);

    // Nor is a blocked one.
    await m.append({
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: SHA,
      result: "blocked",
      jobs_completed: "The register could not be reached from the event.",
      findings: [{ id: "W-001", summary: "dead end" }],
    });
    await expect(
      m.append({
        type: "visual-approval",
        package_id: "WP-events-filter",
        approved_by: "Brian",
        evidence: "live review",
      }),
    ).rejects.toThrow(/No clear workflow-walker review covers/);

    await walked(m);
    const approved = await m.append({
      type: "visual-approval",
      package_id: "WP-events-filter",
      approved_by: "Brian",
      evidence: "live review",
    });
    expect(approved.packages["WP-events-filter"].visual_approved).toBe(true);
  });

  it("asks for a walker on the frontier, and for the jobs rather than the screens", async () => {
    const m = fixture();
    await readyMission(m);
    const state = await reviewedClear(m, "WP-events-filter");
    expect(
      nextActions(state).some(
        (action) => action.action === "workflow-walker" && action.package_id === "WP-events-filter",
      ),
    ).toBe(true);

    await expect(
      m.append({
        type: "integrated-review",
        mode: "workflow-walker",
        head_sha: SHA,
        result: "clear",
      }),
    ).rejects.toThrow(/records the user jobs it completed end to end, not the screens it visited/);

    await expect(
      m.append({ type: "integrated-review", mode: "eyeballed-it", head_sha: SHA, result: "clear" }),
    ).rejects.toThrow(/mode is one of workflow-walker, cross-surface/);

    await expect(
      m.append({
        type: "integrated-review",
        mode: "cross-surface",
        head_sha: SHA,
        result: "blocked",
      }),
    ).rejects.toThrow(/blocked integrated review names its findings/);
  });
});

describe("binding a fix to the test that would catch it again", () => {
  /**
   * LAN-148 §D. Bounded: reintroduce the defect, watch the named test fail,
   * restore the fix, watch it pass. Four recorded facts about one fix, only for
   * corrections, and only for the findings the correction was dispatched to
   * fix. Explicitly not a mutation-testing framework.
   */
  async function correcting(m: ReturnType<typeof fixture>) {
    await readyMission(m);
    await reviewedClear(m, "WP-events-filter");
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: reviewReceipt("blocked"),
    });
    await m.append({
      type: "correction-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      finding_ids: ["R-001", "R-002"],
    });
  }

  it("refuses a correction that fixed something without proving a test notices", async () => {
    const m = fixture();
    await correcting(m);
    await expect(
      m.append({
        type: "worker-receipt",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        receipt: workerReceipt("completed"),
      }),
    ).rejects.toThrow(/R-001 was corrected without injection evidence/);
  });

  it("refuses evidence that covers only some of the findings it was sent to fix", async () => {
    const m = fixture();
    await correcting(m);
    await expect(
      m.append({
        type: "worker-receipt",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        receipt: correctionReceipt(["R-001"]),
      }),
    ).rejects.toThrow(/R-002 was corrected without injection evidence/);
  });

  it("refuses evidence that is missing a step, or is not pinned to a commit", async () => {
    const m = fixture();
    await correcting(m);
    const evidence = correctionReceipt(["R-001", "R-002"]);
    evidence.injection_evidence[0].failing_output = "";
    await expect(
      m.append({
        type: "worker-receipt",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        receipt: evidence,
      }),
    ).rejects.toThrow(/R-001: injection evidence is missing/);

    const unpinned = correctionReceipt(["R-001", "R-002"]);
    unpinned.injection_evidence[1].sha = "abc";
    await expect(
      m.append({
        type: "worker-receipt",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        receipt: unpinned,
      }),
    ).rejects.toThrow(/records the exact SHA it was produced at/);
  });

  it("accepts a correction whose every fix carries its proof, and keeps it", async () => {
    const m = fixture();
    await correcting(m);
    const state = await m.append({
      type: "worker-receipt",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      receipt: correctionReceipt(["R-001", "R-002"]),
    });
    const receipt = state.packages["WP-events-filter"].receipts.at(-1);
    expect(receipt.injection_evidence).toHaveLength(2);
    expect(receipt.injection_evidence[0].sha).toBe(SHA);
  });

  it("asks nothing of an ordinary dispatch that is not correcting a finding", async () => {
    const m = fixture();
    await readyMission(m);
    await expect(reviewedClear(m, "WP-events-filter")).resolves.toBeTruthy();
  });
});

describe("closing the mission where Brian will find it", () => {
  const shipped = [{ linear_issue_id: "LAN-900", pr_number: 42, sha: SHA }];
  const finding = {
    id: "F-001",
    impact_severity: "medium",
    gate_disposition: "advisory",
    consequence: "The roster count and the report footer disagree by one for a lapsed member.",
    evidence: "https://github.com/example/repo/pull/42#discussion_r1",
    recommendation: "Read the count from the same service the footer uses.",
    owner_disposition: "Brian to triage at the next checkpoint.",
  };
  const payload = (overrides: Record<string, unknown> = {}) => ({
    outcome: "delivered-with-residue",
    notion_record: "https://app.notion.com/p/3bb488886d578126a88cdd747f590a01",
    shipped,
    unresolved_findings: [finding],
    owner_actions: "None.",
    next_action: "Triage F-001 at the next checkpoint.",
    elapsed: "6h 40m",
    ...overrides,
  });

  async function crossed(m: ReturnType<typeof fixture>) {
    await readyMission(m);
    await m.append({
      type: "integrated-review",
      mode: "cross-surface",
      head_sha: SHA,
      result: "clear",
    });
  }

  it("refuses a closeout with no cross-surface review of the integrated result", async () => {
    const m = fixture();
    await readyMission(m);
    await expect(m.append({ type: "mission-closeout", ...payload() })).rejects.toThrow(
      /No clear cross-surface review covers the integrated result/,
    );
  });

  it("refuses an outcome that is not one of the three that can be true", async () => {
    const m = fixture();
    await crossed(m);
    await expect(
      m.append({ type: "mission-closeout", ...payload({ outcome: "great success" }) }),
    ).rejects.toThrow(/three labels that can be true/);
  });

  it("refuses a closeout that does not say where it was written", async () => {
    const m = fixture();
    await crossed(m);
    await expect(
      m.append({ type: "mission-closeout", ...payload({ notion_record: "" }) }),
    ).rejects.toThrow(/existing Notion mission record/);
  });

  it("requires the exact shipped evidence, not a summary of it", async () => {
    const m = fixture();
    await crossed(m);
    await expect(
      m.append({ type: "mission-closeout", ...payload({ shipped: [] }) }),
    ).rejects.toThrow(/lists what shipped/);
    await expect(
      m.append({
        type: "mission-closeout",
        ...payload({ shipped: [{ linear_issue_id: "LAN-900", pr_number: 42, sha: "abc" }] }),
      }),
    ).rejects.toThrow(/exact merged SHA/);
  });

  /**
   * The alternative is LAN-146: an issue created to hold eleven findings
   * because nothing durable would. A finding survives the mission carrying
   * everything a single triage pass needs.
   */
  it("makes every unresolved finding triageable on its own", async () => {
    const m = fixture();
    await crossed(m);
    for (const field of [
      "impact_severity",
      "gate_disposition",
      "consequence",
      "evidence",
      "recommendation",
      "owner_disposition",
    ]) {
      await expect(
        m.append({
          type: "mission-closeout",
          ...payload({ unresolved_findings: [{ ...finding, [field]: "" }] }),
        }),
      ).rejects.toThrow(new RegExp("F-001 is missing .Aa".replace("Aa", field)));
    }
  });

  it("records the closeout, and offers it on the frontier once everything has landed", async () => {
    const m = fixture();
    await crossed(m);
    const state = await m.append({ type: "mission-closeout", ...payload() });
    expect(state.closeout.outcome).toBe("delivered-with-residue");
    expect(state.closeout.unresolved_findings[0].id).toBe("F-001");
    expect(state.closeout.notion_record).toMatch(/notion/);
  });
});

describe("user-facing work says what contract it was built against", () => {
  /**
   * LAN-148 §E. Root AGENTS.md has always required user-facing work to read the
   * slice UX contract, the general standards, the applicable ticket contract
   * and both wireframes. The Mission Lead's brief did not name them, so
   * mission-delegated UI work reached implementation with the packet as its
   * only contract — and a packet is superseded, while docs/ux/tickets/ is
   * where the next mission will look.
   */
  const uiReceipt = (overrides: Record<string, unknown> = {}) => ({
    ...workerReceipt("completed"),
    ux_sources: { ...uxSources, ...overrides },
  });

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

  it("refuses a UI receipt that names no UX sources at all", async () => {
    const m = fixture();
    await dispatched(m);
    const receipt = workerReceipt("completed");
    delete (receipt as Record<string, unknown>).ux_sources;
    await expect(
      m.append({
        type: "worker-receipt",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        receipt,
      }),
    ).rejects.toThrow(/user-facing work names its UX sources/);
  });

  it.each(["slice_ux", "standards", "ticket_contract", "wireframes"])(
    "refuses a UI receipt missing %s",
    async (key) => {
      const m = fixture();
      await dispatched(m);
      await expect(
        m.append({
          type: "worker-receipt",
          package_id: "WP-events-filter",
          worker_id: "worker-1",
          receipt: uiReceipt({ [key]: "" }),
        }),
      ).rejects.toThrow(new RegExp("ux_sources.Aa".replace("Aa", key)));
    },
  );

  it("requires the contract to be durable, not the packet it came from", async () => {
    const m = fixture();
    await dispatched(m);
    await expect(
      m.append({
        type: "worker-receipt",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        receipt: uiReceipt({
          ticket_contract: "missions/packets/M-SYNTHETIC/packet.json",
        }),
      }),
    ).rejects.toThrow(/delivery writes the implemented one there/);
  });

  it("accepts a UI receipt whose contract lives in the durable directory", async () => {
    const m = fixture();
    await dispatched(m);
    const state = await m.append({
      type: "worker-receipt",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      receipt: uiReceipt(),
    });
    expect(state.packages["WP-events-filter"].status).toBe("implemented");
  });

  it("asks nothing of nonvisual work", async () => {
    const m = fixture();
    await readyMission(m);
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-attendance-export",
      worker_id: "worker-2",
      worktree: ".claude/worktrees/wp-attendance",
      branch: "feat/wp-attendance",
    });
    const receipt = workerReceipt("completed");
    delete (receipt as Record<string, unknown>).ux_sources;
    const state = await m.append({
      type: "worker-receipt",
      package_id: "WP-attendance-export",
      worker_id: "worker-2",
      receipt,
    });
    expect(state.packages["WP-attendance-export"].status).toBe("implemented");
  });

  it("keeps every durable contract findable by the name the rule states", () => {
    const contracts = fs.readdirSync(path.join(__dirname, "..", "docs", "ux", "tickets"));
    expect(contracts.length).toBeGreaterThan(0);
    for (const name of contracts) {
      expect(name).toMatch(/^LAN-\d+-[a-z0-9-]+\.md$/);
    }
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
      {
        type: "mission-init",
        at: "2026-08-18T10:00:00.000Z",
        packet,
        lead_id: "lead-fixture",
        pid: 4242,
      },
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
