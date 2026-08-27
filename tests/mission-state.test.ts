import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  EPOCH_LIMITS,
  LEAD_TTL_MS,
  MAX_ACTIVE_WORKERS,
  appendEvent,
  deriveEpochDefinition,
  epochView,
  guardedLaneRefusals,
  leadLeaseAvailable,
  missionPaths,
  nextActions,
  packageLifecycle,
  readJournal,
  reduce,
  replayState,
  resumeDossier,
  validateEvent,
} from "../scripts/mission/lib/state.mjs";
import { buildMissionReceipt } from "../scripts/mission/merge-gate.mjs";
import {
  AUTO_MERGE_CLASSES,
  COLLISION_DOMAINS,
  OWNER_GATED_CLASSES,
  validatePackage,
  validatePacket,
  validateWorkflowInventory,
} from "../scripts/mission/lib/packet.mjs";
import { promoteRule, readRules, validateRule } from "../scripts/mission/lib/owner-rules.mjs";
import { emptyEpochSignals, epochHealth } from "../scripts/mission/lib/epochs.mjs";

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

const uxConformance = {
  mockup_states: ["events filter — desktop", "events filter — measured 375px"],
  comparison_method: "Rendered both live states and compared structure and copy.",
  result: "clear",
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
  ci_state: "green",
  ux_conformance: uxConformance,
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

/** The one final mission smoke covers every package head. */
const walked = (
  m: ReturnType<typeof fixture>,
  sha = SHA,
  packageHeads = Object.fromEntries(plan.packages.map((pkg: { id: string }) => [pkg.id, sha])),
) =>
  m.append({
    type: "integrated-review",
    mode: "workflow-walker",
    head_sha: sha,
    package_heads: packageHeads,
    result: "clear",
    jobs_completed: "Signed in, drafted a practice, confirmed its audience and took the register.",
    report: "reviews/final-smoke.json",
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

describe("append-only journal annotations", () => {
  it("marks three false worker-incapacity entries corrected without rewriting them", async () => {
    const m = fixture();
    await readyMission(m);
    const before = readJournal(missionPaths(m.repo, MISSION, m.env).journal);
    const targets = [1, 2, 3];
    for (const target_event of targets) {
      await m.append({
        type: "journal-annotation",
        target_event,
        disposition: "corrected",
        reason: "The worker was resumable; one denied attempt was generalized incorrectly.",
        correction:
          "Resume the original worker identity and record the actual refusal if it fails.",
      });
    }
    const after = readJournal(missionPaths(m.repo, MISSION, m.env).journal);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(replayState(m.repo, MISSION, m.env).annotations).toHaveLength(3);
    await expect(
      m.append({
        type: "journal-annotation",
        target_event: 999,
        disposition: "corrected",
        reason: "Synthetic missing target",
        correction: "No correction",
      }),
    ).rejects.toThrow(/does not exist/);
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
    await m.append({
      type: "worker-receipt",
      package_id: "WP-events-a",
      worker_id: "worker-1",
      receipt: workerReceipt("completed"),
    });
    await m.append({
      type: "pr-opened",
      package_id: "WP-events-a",
      pr_number: 91,
      head_sha: SHA,
    });
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-a",
      receipt: reviewReceipt("blocked"),
    });
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-events-b",
        worker_id: "worker-2",
        worktree: ".claude/worktrees/b",
        branch: "feat/b",
      }),
    ).rejects.toThrow(/queued correction.*outranks a fresh dispatch/);
    await expect(
      m.append({
        type: "correction-dispatched",
        package_id: "WP-events-a",
        worker_id: "worker-1",
        finding_ids: ["R-001"],
      }),
    ).resolves.toBeTruthy();
  });

  it("dispatches dependent work only after its dependency merges to main", async () => {
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

    // A reviewed branch is not the trunk that dependent work must start from.
    const reviewed = replayState(m.repo, MISSION, m.env);
    expect(
      nextActions(reviewed).some(
        (action) => action.action === "dispatch" && action.package_id === "WP-report-footer",
      ),
    ).toBe(false);
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-report-footer",
        worker_id: "worker-2",
        worktree: ".claude/worktrees/wp-report",
        branch: "feat/wp-report",
      }),
    ).rejects.toThrow(/has not merged to main/);

    await m.append({
      type: "merge-recorded",
      package_id: "WP-attendance-export",
      pr_number: 41,
      sha: SHA,
      route: "guarded-auto",
    });

    const dispatched = await m.append({
      type: "worker-dispatched",
      package_id: "WP-report-footer",
      worker_id: "worker-2",
      worktree: ".claude/worktrees/wp-report",
      branch: "feat/wp-report",
    });
    expect(dispatched.packages["WP-report-footer"].status).toBe("active");
  });

  it("still waits for main when a reviewed dependency head moves", async () => {
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
    ).rejects.toThrow(/has not merged to main/);

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
      /cannot start on WP-attendance-export: WP-attendance-export has not merged to main/,
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

  it("re-scopes an active correction in place without abandoning its worker or lifecycle", async () => {
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
    await m.append({
      type: "correction-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      finding_ids: ["R-001", "R-002"],
    });
    await m.append({
      type: "owner-question",
      id: "Q-rescope",
      classification: "hourly",
      text: "Synthetic: should the correction include the dead export?",
      source: "finding R-003",
      affected_packages: ["WP-events-filter"],
    });
    await expect(
      m.append({
        type: "correction-dispatched",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        finding_ids: ["R-001"],
        record_only_finding_ids: ["R-003"],
      }),
    ).rejects.toThrow(/unanswered owner question Q-rescope/);
    await m.append({
      type: "owner-answer",
      question_id: "Q-rescope",
      answer: "Yes; record why no regression test can observe it.",
      answered_by: "Brian",
      reusable: false,
    });

    const state = await m.append({
      type: "correction-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      finding_ids: ["R-001"],
      record_only_finding_ids: ["R-003"],
    });

    expect(state.packages["WP-events-filter"].status).toBe("correction");
    expect(state.packages["WP-events-filter"].worker_id).toBe("worker-1");
    expect(state.packages["WP-events-filter"].abandoned_workers).toBeUndefined();
    expect(state.activeWorkers).toHaveLength(1);
    expect(state.activeWorkers[0]).toMatchObject({
      worker_id: "worker-1",
      kind: "correction",
      finding_ids: ["R-001"],
      record_only_finding_ids: ["R-003"],
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

  it("prioritizes a queued correction and still holds its resumption to owner-question gates", async () => {
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
    // WP-events-a is implemented and then blocked by review; its correction
    // outranks a fresh same-domain dispatch.
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
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-events-b",
        worker_id: "worker-2",
        worktree: ".claude/worktrees/b",
        branch: "feat/b",
      }),
    ).rejects.toThrow(/queued correction.*outranks a fresh dispatch/);
    // An unanswered owner question naming the package still pauses that
    // prioritized correction.
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
    await m.append({
      type: "visual-approval",
      package_id: "WP-events-filter",
      approved_by: "Brian",
      evidence: "live review at checkpoint 1",
    });
    const built = replayState(m.repo, MISSION, m.env);
    expect(packageLifecycle(built, built.packages["WP-events-filter"])).toBe("built");
    await expect(
      m.append({
        type: "package-gate-passed",
        package_id: "WP-events-filter",
        head_sha: SHA,
        receipt: { invented: true },
      }),
    ).rejects.toThrow(/exact receipt/);
    const gated = await m.append({
      type: "package-gate-passed",
      package_id: "WP-events-filter",
      head_sha: SHA,
      receipt: buildMissionReceipt(built, "WP-events-filter", SHA),
    });
    expect(packageLifecycle(gated, gated.packages["WP-events-filter"])).toBe("gate-passed");
    expect(nextActions(gated)).toContainEqual(
      expect.objectContaining({ action: "request-merge", package_id: "WP-events-filter" }),
    );
    const invalidated = await m.append({
      type: "package-gate-invalidated",
      package_id: "WP-events-filter",
      head_sha: SHA,
      reasons: ["Required check rerun failed."],
    });
    expect(packageLifecycle(invalidated, invalidated.packages["WP-events-filter"])).toBe("built");
    await m.append({
      type: "package-gate-passed",
      package_id: "WP-events-filter",
      head_sha: SHA,
      receipt: buildMissionReceipt(invalidated, "WP-events-filter", SHA),
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
    expect(packageLifecycle(state, state.packages["WP-events-filter"])).toBe("merged");
  });

  it("allows no model review or correction after owner approval at an unchanged head", async () => {
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
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: reviewReceipt("clear"),
    });
    const approved = await m.append({
      type: "visual-approval",
      package_id: "WP-events-filter",
      approved_by: "Brian",
      evidence: "live review at checkpoint 1",
    });
    expect(approved.packages["WP-events-filter"].visual_approval.head_sha).toBe(SHA);
    await expect(
      m.append({
        type: "review-receipt",
        package_id: "WP-events-filter",
        receipt: reviewReceipt("blocked"),
      }),
    ).rejects.toThrow(/no model review runs after approval/);
    await expect(
      m.append({
        type: "correction-dispatched",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        finding_ids: ["R-001"],
      }),
    ).rejects.toThrow(/Corrections happen before approval/);
    expect(
      nextActions(approved)
        .filter((action) => action.package_id === "WP-events-filter")
        .map((action) => action.action),
    ).toEqual(["merge-gate"]);
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
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: reviewReceipt("clear"),
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

    const events = readJournal(missionPaths(m.repo, MISSION, m.env).journal as string);
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
    // LAN-148: merged work still owes its worktree back, and nothing else.
    expect(
      nextActions(replayed)
        .filter((action) => action.package_id === "WP-events-filter")
        .map((action) => action.action),
    ).toEqual(["reclaim"]);
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
    const events = readJournal(missionPaths(m.repo, MISSION, m.env).journal as string);
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
      nextActions(replayed)
        .filter((action) => action.package_id === "WP-events-filter")
        .map((action) => action.action),
    ).toEqual(["reclaim"]);
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
  it("records each deliberate Lead recycle phase once", async () => {
    const m = fixture();
    await readyMission(m);
    const stopped = await m.append({
      type: "mission-stopped",
      reason: "phase-boundary",
      phase: "plan-approved",
      detail: "Reset Lead context after plan approval.",
    });
    expect(stopped.phaseRecycles).toEqual(["plan-approved"]);
    await m.append({ type: "mission-resumed", lead_id: "fresh-lead", pid: 4243 });
    await expect(
      m.append({
        type: "mission-stopped",
        reason: "phase-boundary",
        phase: "plan-approved",
        detail: "Duplicate recycle.",
      }),
    ).rejects.toThrow(/already recycled at plan-approved/);
  });

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

describe("owner-last review and the final mission smoke", () => {
  it.each([
    ["no conformance evidence", undefined, /clear visual review records/],
    [
      "no mockup states",
      { ...uxConformance, mockup_states: [] },
      /mockup_states names every compared state/,
    ],
    [
      "no comparison method",
      { ...uxConformance, comparison_method: "" },
      /comparison_method says how desktop and measured 375px were compared/,
    ],
  ])("refuses visual package-gate clearance with %s", async (_label, evidence, refusal) => {
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
    await expect(
      m.append({
        type: "review-receipt",
        package_id: "WP-events-filter",
        receipt: {
          review_mode: "package-gate",
          reviewed_head_sha: SHA,
          round: 1,
          result: "clear",
          ci_state: "green",
          sensitive_paths: [],
          report: "reviews/package-gate.json",
          ...(evidence ? { ux_conformance: evidence } : {}),
        },
      }),
    ).rejects.toThrow(refusal);
  });

  it("withholds owner walkthrough until the exact-head package gate is clear", async () => {
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
    const implemented = await m.append({
      type: "pr-opened",
      package_id: "WP-events-filter",
      pr_number: 42,
      head_sha: SHA,
    });
    expect(nextActions(implemented)).toContainEqual(
      expect.objectContaining({
        action: "package-gate",
        package_id: "WP-events-filter",
      }),
    );
    expect(nextActions(implemented).some((action) => action.action === "owner-walkthrough")).toBe(
      false,
    );
    await expect(
      m.append({
        type: "visual-approval",
        package_id: "WP-events-filter",
        approved_by: "Brian",
        evidence: "too early",
      }),
    ).rejects.toThrow(/not owner-ready/);

    const reviewed = await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: {
        review_mode: "package-gate",
        full_review_sha: SHA,
        reviewed_head_sha: SHA,
        round: 1,
        result: "clear",
        ci_state: "green",
        sensitive_paths: [],
        report: "reviews/package-gate.json",
        ux_conformance: uxConformance,
      },
    });
    expect(nextActions(reviewed)).toContainEqual(
      expect.objectContaining({
        action: "owner-walkthrough",
        package_id: "WP-events-filter",
      }),
    );
  });

  it("merges an approved issue without waiting for the mission walker", async () => {
    const m = fixture();
    await readyMission(m);
    await reviewedClear(m, "WP-events-filter");
    const approved = await m.append({
      type: "visual-approval",
      package_id: "WP-events-filter",
      approved_by: "Brian",
      evidence: "live issue review",
    });
    expect(guardedLaneRefusals(approved, "WP-events-filter", SHA)).toEqual([]);
    expect(nextActions(approved)).toContainEqual(
      expect.objectContaining({ action: "merge-gate", package_id: "WP-events-filter" }),
    );
    expect(nextActions(approved).some((action) => action.action === "workflow-walker")).toBe(false);
  });

  it("refuses the one workflow smoke until every issue is merged", async () => {
    const m = fixture();
    await readyMission(m);
    await expect(walked(m)).rejects.toThrow(/only after every live package has merged to main/);

    for (const pkg of plan.packages) {
      await m.append({
        type: "merge-recorded",
        package_id: pkg.id,
        sha: SHA,
        route: "owner",
      });
    }
    const merged = replayState(m.repo, MISSION, m.env);
    expect(nextActions(merged)).toContainEqual(
      expect.objectContaining({ action: "workflow-walker" }),
    );
    const smoked = await walked(m);
    expect(nextActions(smoked).some((action) => action.action === "workflow-walker")).toBe(false);
    expect(nextActions(smoked)).toContainEqual(expect.objectContaining({ action: "closeout" }));
  });

  it("keeps merged issues closed when the final smoke finds a defect", async () => {
    const m = fixture();
    await readyMission(m);
    for (const pkg of plan.packages) {
      await m.append({ type: "merge-recorded", package_id: pkg.id, sha: SHA, route: "owner" });
    }
    const blocked = await m.append({
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: SHA,
      result: "blocked",
      jobs_completed: "The attendance-to-report hand-off failed.",
      findings: ["W-001"],
      report: "reviews/final-smoke.json",
    });
    expect(
      (Object.values(blocked.packages) as Array<{ status: string }>).every(
        (pkg) => pkg.status === "merged",
      ),
    ).toBe(true);
    expect(nextActions(blocked)).toContainEqual(
      expect.objectContaining({ action: "mission-smoke-correction" }),
    );
    expect(nextActions(blocked).some((action) => action.action === "owner-walkthrough")).toBe(
      false,
    );
  });

  it("accepts the targeted re-walk at a new head, without a further package merge", async () => {
    // The harness prescribes that a blocked smoke creates one corrective issue
    // and pull request cycle -- an issue, deliberately not a package. So no
    // package merge follows the blocked smoke, and gating the re-walk on one
    // made it unsatisfiable for exactly the workflow the harness asks for. The
    // re-walk's evidence that corrective work landed is its own head.
    const m = fixture();
    await readyMission(m);
    for (const pkg of plan.packages) {
      await m.append({ type: "merge-recorded", package_id: pkg.id, sha: SHA, route: "owner" });
    }
    await m.append({
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: SHA,
      result: "blocked",
      jobs_completed: "The attendance board counted an unrecorded yes as a mismatch.",
      findings: ["W-001"],
      report: "reviews/final-smoke.json",
    });

    const correctedHead = "b".repeat(40);
    const rewalked = await m.append({
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: correctedHead,
      result: "clear",
      jobs_completed: "Re-walked only the affected journey at the corrected head.",
      report: "reviews/targeted-rewalk.json",
    });

    expect(rewalked.integratedReviews.at(-1)).toMatchObject({
      head_sha: correctedHead,
      result: "clear",
    });
  });

  it("caps final-smoke repair at one correction and one targeted re-walk", async () => {
    const m = fixture();
    await readyMission(m);
    for (const pkg of plan.packages) {
      await m.append({ type: "merge-recorded", package_id: pkg.id, sha: SHA, route: "owner" });
    }
    await m.append({
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: SHA,
      result: "blocked",
      jobs_completed: "The attendance-to-report hand-off failed.",
      findings: ["W-001"],
      report: "reviews/final-smoke.json",
    });
    await expect(
      m.append({
        type: "integrated-review",
        mode: "workflow-walker",
        head_sha: SHA,
        result: "blocked",
        jobs_completed: "Repeated the affected hand-off.",
        findings: ["W-001"],
        report: "reviews/targeted-rewalk.json",
      }),
    ).rejects.toThrow(/only after .* corrective work merged/);

    const correction = {
      ...plan.packages[1],
      id: "WP-smoke-correction",
      title: "Correct final-smoke finding W-001",
      depends_on: [],
    };
    await m.append(planEvent([...plan.packages, correction]));
    await m.append({
      type: "plan-approved",
      approved_by: "Brian",
      evidence: "approved the single smoke correction",
    });
    await m.append({
      type: "merge-recorded",
      package_id: correction.id,
      sha: "b".repeat(40),
      route: "owner",
    });
    const corrected = replayState(m.repo, MISSION, m.env);
    expect(nextActions(corrected)).toContainEqual(
      expect.objectContaining({ action: "workflow-walker" }),
    );

    const failedAgain = await m.append({
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: "b".repeat(40),
      result: "blocked",
      jobs_completed: "Repeated only the attendance-to-report hand-off.",
      findings: ["W-001"],
      report: "reviews/targeted-rewalk.json",
    });
    expect(nextActions(failedAgain)).toContainEqual(
      expect.objectContaining({ action: "owner-adjudication" }),
    );
    expect(
      nextActions(failedAgain).some((action) => action.action === "mission-smoke-correction"),
    ).toBe(false);
    await expect(
      m.append({
        type: "integrated-review",
        mode: "workflow-walker",
        head_sha: "b".repeat(40),
        result: "clear",
        jobs_completed: "Tried a third walk.",
        report: "reviews/third-walk.json",
      }),
    ).rejects.toThrow(/only after .* corrective work merged/);
  });

  /**
   * LAN-167. `missionWorkflowSmokes` used to count every workflow-walker
   * review the mission ever recorded, while `finalMissionSmoke` (used for
   * closeout) correctly scoped to reviews after the latest merge. A mission
   * that used its one smoke plus one targeted re-walk in an earlier round —
   * before later work merged — could never record another smoke afterward:
   * the cap check saw two prior reviews forever, even though a fresh merge
   * had happened since either of them. Closeout was then permanently
   * unreachable. The cap must scope the same way the closeout check does.
   */
  it("scopes the smoke cap to the current merge round, not all mission history", async () => {
    const m = fixture();
    await readyMission(m);
    for (const pkg of plan.packages) {
      await m.append({ type: "merge-recorded", package_id: pkg.id, sha: SHA, route: "owner" });
    }

    // Round 1: a blocked smoke, a corrective merge, then a clear re-walk.
    // Mission history now carries two lifetime workflow-walker reviews —
    // exactly the pre-existing history LAN-167 found could never be
    // out-counted by a later, fully post-merge smoke.
    await m.append({
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: SHA,
      result: "blocked",
      jobs_completed: "The attendance-to-report hand-off failed.",
      findings: ["W-101"],
      report: "reviews/round-1-smoke.json",
    });
    const correctionOne = {
      ...plan.packages[1],
      id: "WP-smoke-correction-1",
      title: "Correct round-1 finding W-101",
      depends_on: [],
    };
    await m.append(planEvent([...plan.packages, correctionOne]));
    await m.append({
      type: "plan-approved",
      approved_by: "Brian",
      evidence: "approved the round-1 smoke correction",
    });
    await m.append({
      type: "merge-recorded",
      package_id: correctionOne.id,
      sha: "b".repeat(40),
      route: "owner",
    });
    await m.append({
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: "b".repeat(40),
      result: "clear",
      jobs_completed: "Repeated the attendance-to-report hand-off; it now succeeds.",
      report: "reviews/round-1-rewalk.json",
    });

    // Round 2 begins: further work merges after both round-1 reviews.
    const laterAddition = {
      ...plan.packages[2],
      id: "WP-round-2-addition",
      title: "Round-2 work merged after the round-1 smoke pair",
      depends_on: [],
    };
    await m.append(planEvent([...plan.packages, correctionOne, laterAddition]));
    await m.append({
      type: "plan-approved",
      approved_by: "Brian",
      evidence: "approved the round-2 addition",
    });
    await m.append({
      type: "merge-recorded",
      package_id: laterAddition.id,
      sha: "c".repeat(40),
      route: "owner",
    });

    // This is the exact bug: a fresh, fully post-merge smoke, refused
    // forever under the old all-time count even though a merge intervened.
    const round2Smoke = await m.append({
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: "c".repeat(40),
      result: "blocked",
      jobs_completed: "Walked the mission journeys again at the round-2 head.",
      findings: ["W-102"],
      report: "reviews/round-2-smoke.json",
    });
    expect(
      (Object.values(round2Smoke.packages) as Array<{ status: string }>).every(
        (pkg) => pkg.status === "merged",
      ),
    ).toBe(true);

    // Guard still holds: a re-walk with no intervening merge is refused.
    await expect(
      m.append({
        type: "integrated-review",
        mode: "workflow-walker",
        head_sha: "c".repeat(40),
        result: "blocked",
        jobs_completed: "Tried again immediately.",
        findings: ["W-102"],
        report: "reviews/round-2-immediate-rewalk.json",
      }),
    ).rejects.toThrow(/only after .* corrective work merged/);

    // Merge the round-2 correction; the one targeted re-walk is permitted.
    const correctionTwo = {
      ...plan.packages[1],
      id: "WP-smoke-correction-2",
      title: "Correct round-2 finding W-102",
      depends_on: [],
    };
    await m.append(planEvent([...plan.packages, correctionOne, laterAddition, correctionTwo]));
    await m.append({
      type: "plan-approved",
      approved_by: "Brian",
      evidence: "approved the round-2 smoke correction",
    });
    await m.append({
      type: "merge-recorded",
      package_id: correctionTwo.id,
      sha: "d".repeat(40),
      route: "owner",
    });
    const round2Rewalk = await m.append({
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: "d".repeat(40),
      result: "blocked",
      jobs_completed: "Repeated only the affected journey.",
      findings: ["W-102"],
      report: "reviews/round-2-rewalk.json",
    });
    expect(nextActions(round2Rewalk)).toContainEqual(
      expect.objectContaining({ action: "owner-adjudication" }),
    );

    // Guard still holds: a third post-merge smoke in this round is refused.
    await expect(
      m.append({
        type: "integrated-review",
        mode: "workflow-walker",
        head_sha: "d".repeat(40),
        result: "clear",
        jobs_completed: "Tried a third walk.",
        report: "reviews/round-2-third-walk.json",
      }),
    ).rejects.toThrow(/only after .* corrective work merged/);
  });

  it("refuses security coverage that is stale or lacks a report", async () => {
    const m = fixture();
    await readyMission(m);
    await reviewedClear(m, "WP-events-filter");
    await expect(
      m.append({
        type: "review-receipt",
        package_id: "WP-events-filter",
        receipt: {
          review_mode: "security-tier",
          full_review_sha: SHA,
          reviewed_head_sha: "b".repeat(40),
          round: 1,
          result: "clear",
          ci_state: "green",
          sensitive_paths: [],
        },
      }),
    ).rejects.toThrow(/not current package head[\s\S]*report path/);
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

    // The worker cannot read state.mjs and its own instructions do not carry
    // the field list, so a refusal that only names the missing key sends it
    // back to guess. Every one of these refusals states the whole shape.
    await expect(
      m.append({
        type: "worker-receipt",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        receipt: evidence,
      }),
    ).rejects.toThrow(/"finding_id", "test", "command", "failing_output", "restored_pass", "sha"/);

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

  it("accepts an honestly dispatched record-only finding without fabricated injection proof", async () => {
    const m = fixture();
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
      finding_ids: ["R-001"],
      record_only_finding_ids: ["R-002"],
    });

    const state = await m.append({
      type: "worker-receipt",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      receipt: correctionReceipt(["R-001"]),
    });

    expect(state.packages["WP-events-filter"].status).toBe("implemented");
    const receipt = state.packages["WP-events-filter"].receipts.at(-1);
    expect(receipt.injection_evidence).toHaveLength(1);
    expect(receipt.correction_scope).toEqual({
      finding_ids: ["R-001"],
      record_only_finding_ids: ["R-002"],
    });
  });

  it("keeps record-only scope separate from injection-tested findings", async () => {
    const m = fixture();
    await readyMission(m);
    await reviewedClear(m, "WP-events-filter");
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: reviewReceipt("blocked"),
    });
    await expect(
      m.append({
        type: "correction-dispatched",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        finding_ids: ["R-001"],
        record_only_finding_ids: ["R-001"],
      }),
    ).rejects.toThrow(/named exactly once/);

    await expect(
      m.append({
        type: "correction-dispatched",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        finding_ids: ["R-001"],
        record_only_finding_ids: "R-002",
      }),
    ).rejects.toThrow(/Record-only correction findings are an array/);
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
    for (const pkg of plan.packages) {
      await m.append({ type: "merge-recorded", package_id: pkg.id, sha: SHA, route: "owner" });
    }
    await walked(m);
  }

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

describe("giving back what the mission took out", () => {
  /**
   * /run-mission deliberately stops short of this, for the reason /start-issue
   * does: work in flight is not debris. But the first live mission left both
   * database slots held and its worktrees on disk, because nothing reclaimed
   * them once packages merged. Reclamation is per package and does not wait for
   * the mission to end.
   */
  async function merged(m: ReturnType<typeof fixture>, packageId = "WP-events-filter") {
    await readyMission(m);
    await reviewedClear(m, packageId);
    await m.append({
      type: "visual-approval",
      package_id: packageId,
      approved_by: "Brian",
      evidence: "live review",
    });
    return m.append({
      type: "merge-recorded",
      package_id: packageId,
      sha: SHA,
      route: "guarded-auto",
    });
  }

  it("refuses to reclaim a package that has not reached a terminal state", async () => {
    const m = fixture();
    await readyMission(m);
    await expect(
      m.append({ type: "package-reclaimed", package_id: "WP-events-filter", merge_sha: SHA }),
    ).rejects.toThrow(/never on the strength of a receipt/);
  });

  it("refuses to reclaim under a worker that is still running", async () => {
    const m = fixture();
    await readyMission(m);
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/wp-events",
      branch: "feat/wp-events",
    });
    await expect(
      m.append({
        type: "package-reclaimed",
        package_id: "WP-events-filter",
        abandoned: true,
        reason: "stopping",
      }),
    ).rejects.toThrow(/still has an active worker; its worktree is not debris yet/);
  });

  it("requires the merge commit it was proved against", async () => {
    const m = fixture();
    await merged(m);
    await expect(
      m.append({ type: "package-reclaimed", package_id: "WP-events-filter" }),
    ).rejects.toThrow(/records the merge commit it was proved against, read from the repository/);
  });

  it("reclaims a merged package and stops offering it", async () => {
    const m = fixture();
    await merged(m);
    const state = await m.append({
      type: "package-reclaimed",
      package_id: "WP-events-filter",
      merge_sha: SHA,
    });
    expect(state.reclaimed).toContain("WP-events-filter");
    expect(state.packages["WP-events-filter"].reclaimed.merge_sha).toBe(SHA);
    expect(nextActions(state).some((action) => action.package_id === "WP-events-filter")).toBe(
      false,
    );
  });

  it("will not finalize a mission whose evidence was never written", async () => {
    const m = fixture();
    await merged(m);
    await m.append({ type: "package-reclaimed", package_id: "WP-events-filter", merge_sha: SHA });
    await expect(
      m.append({ type: "mission-finalized", stack_disposition: "retired" }),
    ).rejects.toThrow(/reclaiming resources is not the same act/);
  });

  it("will not close out while packages are unmerged and the final smoke is absent", async () => {
    const m = fixture();
    await merged(m);
    await expect(
      m.append({
        type: "mission-closeout",
        outcome: "delivered",
        notion_record: "https://app.notion.com/p/3bb488886d578126a88cdd747f590a01",
        shipped: [{ linear_issue_id: "LAN-900", pr_number: 42, sha: SHA }],
        owner_actions: "None.",
        next_action: "None.",
      }),
    ).rejects.toThrow(/only after every package has merged and the final workflow smoke is clear/);
  });

  /**
   * A resumed Lead has to be able to tell a finished mission from one that was
   * walked away from. The terminal event is what says so.
   */
  it("records abandonment with what was deliberately preserved", async () => {
    const m = fixture();
    await readyMission(m);
    await expect(
      m.append({ type: "mission-abandoned", reason: "usage exhausted" }),
    ).rejects.toThrow(/records what was deliberately preserved/);
    const state = await m.append({
      type: "mission-abandoned",
      reason: "The packet was superseded before the second package started.",
      preserved: "Both branches are pushed, PR #42 is open, and the journal is intact.",
    });
    expect(state.terminal.state).toBe("abandoned");
    expect(nextActions(state)).toEqual([
      { action: "none", detail: "The mission is abandoned. Nothing further is owed." },
    ]);
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
    const events = readJournal(missionPaths(m.repo, MISSION, m.env).journal as string);
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

/**
 * Lead epochs (LAN-178).
 *
 * Mission 4 ran one Lead from plan approval through every package because the
 * recycle rule was prose. These assert it is now a precondition on the events
 * that change state, and that the only way past it is Brian saying so.
 */
describe("Lead epochs", () => {
  const dossier = (state: { eventCount: number }) => ({
    dossier: "/tmp/synthetic-dossier.json",
    dossier_source_index: state.eventCount - 1,
  });

  type EpochState = ReturnType<typeof reduce>;

  const openEvent = (state: EpochState, overrides: Record<string, unknown> = {}) => ({
    type: "lead-epoch-opened",
    epoch_id: `E-${state.epochHistory.length + (state.epoch ? 1 : 0) + 1}`,
    lead_id: "lead-1",
    pid: 4242,
    ...deriveEpochDefinition(state),
    ...dossier(state),
    ...overrides,
  });

  const read = (m: ReturnType<typeof fixture>) => replayState(m.repo, MISSION, m.env);

  /**
   * The journal's own clock. These fixtures stamp synthetic timestamps a second
   * apart, so asking for the view at wall-clock time would read every epoch as
   * hours old — which is the right answer for a real journal and the wrong one
   * here. Tests that are about age set `now` themselves.
   */
  const clock = (m: ReturnType<typeof fixture>) => {
    const events = readJournal(missionPaths(m.repo, MISSION, m.env).journal as string);
    return Date.parse(events.at(-1)!.at);
  };
  const view = (m: ReturnType<typeof fixture>, now = clock(m)) => epochView(read(m), { now });

  /** Initialize and open the planning epoch the harness derives. */
  async function planningEpoch(m: ReturnType<typeof fixture>, leadId = "lead-1") {
    await m.append({ type: "mission-init", packet, lead_id: leadId, pid: 4242 });
    return m.append(openEvent(read(m), { lead_id: leadId }));
  }

  /** Close the current epoch and open the next one as a genuinely fresh Lead. */
  async function rotate(m: ReturnType<typeof fixture>, leadId: string) {
    const before = read(m);
    const token = `token-${before.eventCount}`;
    await m.append({
      type: "lead-epoch-closed",
      reason: "The epoch reached its boundary.",
      resume_token: token,
      ...dossier(before),
    });
    const closed = read(m);
    return m.append(openEvent(closed, { lead_id: leadId, resume_token: token }));
  }

  /** Plan, approve, take the mandatory recycle, and synchronize every package. */
  async function executionEpoch(m: ReturnType<typeof fixture>) {
    await planningEpoch(m);
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
    await rotate(m, "lead-2");
    await m.append({ type: "linear-preflight", result: "reachable", detail: "fixture preflight" });
    for (const [index, pkg] of plan.packages.entries()) {
      await m.append({ type: "linear-sync-intent", package_id: pkg.id });
      await m.append({
        type: "linear-sync-result",
        package_id: pkg.id,
        issue_id: `LAN-90${index}`,
      });
    }
    return read(m);
  }

  /** One package from dispatch to merge, inside whatever epoch is current. */
  async function driveToMerge(
    m: ReturnType<typeof fixture>,
    packageId: string,
    { visual = true } = {},
  ) {
    const worker = `worker-${packageId}`;
    await m.append({
      type: "worker-dispatched",
      package_id: packageId,
      worker_id: worker,
      worktree: `.claude/worktrees/${packageId}`,
      branch: `feat/${packageId}`,
    });
    await m.append({
      type: "worker-receipt",
      package_id: packageId,
      worker_id: worker,
      receipt: workerReceipt("completed"),
    });
    await m.append({ type: "pr-opened", package_id: packageId, pr_number: 42, head_sha: SHA });
    await m.append({
      type: "review-receipt",
      package_id: packageId,
      receipt: reviewReceipt("clear"),
    });
    if (visual) {
      await m.append({
        type: "visual-approval",
        package_id: packageId,
        approved_by: "Brian",
        evidence: "synthetic live review",
      });
    }
    return m.append({
      type: "merge-recorded",
      package_id: packageId,
      pr_number: 42,
      sha: SHA,
      route: "guarded-auto",
    });
  }

  /** Every package merged and the one integrated smoke clear, epoch by epoch. */
  async function walkedMission(m: ReturnType<typeof fixture>) {
    await executionEpoch(m);
    await driveToMerge(m, "WP-events-filter");
    await driveToMerge(m, "WP-attendance-export", { visual: false });
    await rotate(m, "lead-3");
    await driveToMerge(m, "WP-report-footer");
    await rotate(m, "lead-4");
    return m.append({
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: SHA,
      package_heads: Object.fromEntries(plan.packages.map((pkg: { id: string }) => [pkg.id, SHA])),
      result: "clear",
      jobs_completed:
        "Signed in, drafted a practice, confirmed its audience and took the register.",
      report: "reviews/final-smoke.json",
    });
  }

  it("opens a planning epoch before the mission acts, derived from state", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet, lead_id: "lead-1", pid: 4242 });
    const derived = deriveEpochDefinition(read(m));
    expect(derived.phase).toBe("planning");
    expect(derived.scope).toEqual({ packages: [], gate: "plan-approval" });
    expect(derived.permitted_action_classes).toEqual(["replan", "planning", "contract"]);

    const opened = await m.append(openEvent(read(m)));
    expect(view(m).status).toBe("open");
    expect(opened.epoch.epoch_id).toBe("E-1");
    // The fence exists from the opening event, exactly as it does for init.
    expect(opened.lead).toMatchObject({ lead_id: "lead-1", pid: 4242 });
  });

  it("refuses an epoch whose phase or scope the Lead chose for itself", async () => {
    const m = fixture();
    await m.append({ type: "mission-init", packet, lead_id: "lead-1", pid: 4242 });
    const state = read(m);
    await expect(m.append(openEvent(state, { phase: "implementation-wave" }))).rejects.toThrow(
      /harness derives planning from current mission state/,
    );
    await expect(
      m.append(openEvent(state, { scope: { packages: ["WP-events-filter"], gate: null } })),
    ).rejects.toThrow(/does not choose or enlarge its own assignment/);
  });

  it("reaches a boundary on plan approval and refuses durable execution after it", async () => {
    const m = fixture();
    await planningEpoch(m);
    expect(view(m).status).toBe("open");

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

    // Nothing was recorded to make this happen. The exit condition is the fence.
    const boundary = view(m);
    expect(boundary.status).toBe("boundary-pending");
    expect(boundary.boundary_reason).toMatch(/the plan is approved/);

    await expect(
      m.append({ type: "linear-sync-intent", package_id: "WP-events-filter" }),
    ).rejects.toThrow(/"linear-sync-intent" is sync work/);
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        worktree: ".claude/worktrees/wp-events",
        branch: "feat/wp-events",
      }),
    ).rejects.toThrow(/"worker-dispatched" is dispatch work/);

    // Reading, checkpointing and recording what Brian decided still work.
    await expect(m.append({ type: "checkpoint", number: 1 })).resolves.toBeTruthy();
  });

  it("hands the mission on only to a different Lead holding the unspent token", async () => {
    const m = fixture();
    await planningEpoch(m);
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
    const before = read(m);
    await m.append({
      type: "lead-epoch-closed",
      reason: "post-plan boundary",
      resume_token: "token-1",
      ...dossier(before),
    });
    const closed = read(m);
    // Closing releases the fence, so a fresh Lead is not locked out by the
    // outgoing Lead's still-warm heartbeat.
    expect(closed.lead).toBeNull();
    expect(closed.phaseRecycles).toEqual(["plan-approved"]);
    expect(closed.resumeToken).toMatchObject({ token: "token-1", spent: false });

    await expect(
      m.append(openEvent(closed, { lead_id: "lead-1", resume_token: "token-1" })),
    ).rejects.toThrow(/same session cannot resume its own closed epoch/);
    await expect(
      m.append(openEvent(closed, { lead_id: "lead-2", resume_token: "wrong" })),
    ).rejects.toThrow(/presents the one-use token/);
    await expect(m.append(openEvent(closed, { lead_id: "lead-2" }))).rejects.toThrow(
      /presents the one-use token/,
    );

    const opened = await m.append(
      openEvent(closed, { lead_id: "lead-2", resume_token: "token-1" }),
    );
    expect(opened.resumeToken).toMatchObject({ token: "token-1", spent: true });
    expect(opened.epoch.phase).toBe("implementation-wave");

    // The spent token cannot buy a second epoch.
    const after = read(m);
    await m.append({
      type: "lead-epoch-closed",
      reason: "wave boundary",
      resume_token: "token-2",
      ...dossier(after),
    });
    await expect(
      m.append(openEvent(read(m), { lead_id: "lead-3", resume_token: "token-1" })),
    ).rejects.toThrow(/token was spent when a later epoch opened/);
  });

  it("cuts a wave of at most two frontier packages and refuses the rest", async () => {
    const m = fixture();
    const scope = (await executionEpoch(m)).epoch!.scope.packages;
    expect(scope).toEqual(["WP-events-filter", "WP-attendance-export"]);
    expect(scope.length).toBeLessThanOrEqual(EPOCH_LIMITS.wavePackages);
    expect(EPOCH_LIMITS.wavePackages).toBe(MAX_ACTIVE_WORKERS);

    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-report-footer",
        worker_id: "worker-3",
        worktree: ".claude/worktrees/wp-report",
        branch: "feat/wp-report",
      }),
    ).rejects.toThrow(/outside this epoch's scope/);
  });

  it("drains already-active in-scope work and refuses every new dispatch", async () => {
    const m = fixture();
    await executionEpoch(m);
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/wp-events",
      branch: "feat/wp-events",
    });
    await m.append({ type: "lead-epoch-boundary-reached", reason: "Rotating the Lead." });
    await m.append({ type: "lead-epoch-draining", packages: ["WP-events-filter"] });
    expect(view(m).status).toBe("draining");

    // Completion evidence for the work that was already running is accepted.
    await expect(
      m.append({
        type: "worker-receipt",
        package_id: "WP-events-filter",
        worker_id: "worker-1",
        receipt: workerReceipt("completed"),
      }),
    ).resolves.toBeTruthy();
    await expect(
      m.append({ type: "pr-opened", package_id: "WP-events-filter", pr_number: 42, head_sha: SHA }),
    ).resolves.toBeTruthy();

    // A second in-scope package that was not running is not drainable work.
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-attendance-export",
        worker_id: "worker-2",
        worktree: ".claude/worktrees/wp-attendance",
        branch: "feat/wp-attendance",
      }),
    ).rejects.toThrow(/starts new dispatch work/);
    await expect(
      m.append({
        type: "pr-opened",
        package_id: "WP-attendance-export",
        pr_number: 43,
        head_sha: SHA,
      }),
    ).rejects.toThrow(/was not active and in scope when draining began/);
  });

  it("extends a green epoch by exactly one adjacent package, once", async () => {
    const m = fixture();
    await executionEpoch(m);
    await driveToMerge(m, "WP-attendance-export", { visual: false });
    const health = view(m).health;
    expect(health.color).toBe("green");

    const extend = (overrides: Record<string, unknown> = {}) => ({
      type: "lead-epoch-adjusted",
      kind: "extend-current",
      source_epoch_id: "E-2",
      target_epoch_id: "E-2",
      old_scope: { packages: ["WP-events-filter", "WP-attendance-export"], gate: null },
      new_scope: {
        packages: ["WP-events-filter", "WP-attendance-export", "WP-report-footer"],
        gate: null,
      },
      old_exit_condition: view(m).exit_condition,
      new_exit_condition: "WP-report-footer has merged to main.",
      health: { color: "green", reason_codes: [] },
      approved_by: "Brian",
      authorization: "Yes — finish the report footer under this Lead rather than rotating again.",
      reason: "The footer's dependency merged and it is one small package.",
      limit: { added_packages: 1, expires_after_hours: 2 },
      expires_at: new Date(clock(m) + EPOCH_LIMITS.extensionMs).toISOString(),
      ...overrides,
    });

    // Two packages is not "one adjacent package", and neither is none.
    await expect(
      m.append(
        extend({
          new_scope: {
            packages: [
              "WP-events-filter",
              "WP-attendance-export",
              "WP-report-footer",
              "WP-invented",
            ],
            gate: null,
          },
        }),
      ),
    ).rejects.toThrow(/adds exactly one adjacent eligible package/);
    await expect(
      m.append(
        extend({
          new_scope: { packages: ["WP-events-filter", "WP-attendance-export"], gate: null },
        }),
      ),
    ).rejects.toThrow(/adds neither/);
    // Only Brian authorizes it; a proposal is not an approval.
    await expect(m.append(extend({ authorization: "" }))).rejects.toThrow(
      /only an explicit owner message authorizes filing/,
    );

    const extended = await m.append(extend());
    expect(extended.epoch.scope.packages).toEqual([
      "WP-events-filter",
      "WP-attendance-export",
      "WP-report-footer",
    ]);
    // The prior definition is not rewritten; it survives inside the adjustment.
    expect(extended.epoch.adjustments[0].old_scope.packages).toEqual([
      "WP-events-filter",
      "WP-attendance-export",
    ]);
    await expect(
      m.append({
        type: "worker-dispatched",
        package_id: "WP-report-footer",
        worker_id: "worker-3",
        worktree: ".claude/worktrees/wp-report",
        branch: "feat/wp-report",
      }),
    ).resolves.toBeTruthy();

    // The budget is one. A second extension is refused however healthy it is.
    await expect(m.append(extend({ epoch_id: "E-2" }))).rejects.toThrow(
      /already used its one normal extension/,
    );
  });

  it("refuses an extension that takes a package and a correction at once", async () => {
    const m = fixture();
    await executionEpoch(m);
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
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: reviewReceipt("blocked"),
    });
    await m.append({
      type: "correction-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      finding_ids: ["R-001"],
    });
    await m.append({
      type: "merge-recorded",
      package_id: "WP-attendance-export",
      sha: SHA,
      route: "owner",
      owner_route_reason: "fixture",
    });

    // One bounded unit of work means one, not one of each.
    await expect(
      m.append({
        type: "lead-epoch-adjusted",
        kind: "extend-current",
        source_epoch_id: "E-2",
        target_epoch_id: "E-2",
        old_scope: view(m).scope,
        new_scope: {
          packages: ["WP-events-filter", "WP-attendance-export", "WP-report-footer"],
          gate: null,
        },
        old_exit_condition: view(m).exit_condition,
        new_exit_condition: "Both finish.",
        health: {
          color: view(m).health.color,
          reason_codes: view(m).health.reasons.map((reason: { code: string }) => reason.code),
        },
        accepted_reason_codes: view(m).health.reasons.map(
          (reason: { code: string }) => reason.code,
        ),
        approved_by: "Brian",
        authorization: "Take the footer and finish the correction.",
        reason: "Both at once.",
        correction_package_id: "WP-events-filter",
        expires_at: new Date(clock(m) + EPOCH_LIMITS.extensionMs).toISOString(),
      }),
    ).rejects.toThrow(/never both/);
  });

  it("re-fences the epoch when its owner-approved extension expires", async () => {
    const m = fixture();
    await executionEpoch(m);
    await driveToMerge(m, "WP-attendance-export", { visual: false });
    const granted = clock(m);
    await m.append({
      type: "lead-epoch-adjusted",
      kind: "extend-current",
      source_epoch_id: "E-2",
      target_epoch_id: "E-2",
      old_scope: view(m).scope,
      new_scope: {
        packages: ["WP-events-filter", "WP-attendance-export", "WP-report-footer"],
        gate: null,
      },
      old_exit_condition: view(m).exit_condition,
      new_exit_condition: "WP-report-footer has merged to main.",
      health: { color: "green", reason_codes: [] },
      approved_by: "Brian",
      authorization: "Yes, one more package.",
      reason: "One small adjacent package.",
      limit: { added_packages: 1, expires_after_hours: 2 },
      expires_at: new Date(granted + EPOCH_LIMITS.extensionMs).toISOString(),
    });
    expect(view(m, granted + 1000).status).toBe("open");
    const lapsed = view(m, granted + EPOCH_LIMITS.extensionMs + 1000);
    expect(lapsed.status).toBe("boundary-pending");
    expect(lapsed.boundary_reason).toMatch(/extension expired/);
  });

  it("refuses an extension that would cross into the walker, cutover or closeout", async () => {
    const m = fixture();
    await walkedMission(m);
    const current = view(m);
    expect(current.phase).toBe("integration");
    await expect(
      m.append({
        type: "lead-epoch-adjusted",
        kind: "extend-current",
        source_epoch_id: current.epoch_id,
        target_epoch_id: current.epoch_id,
        old_scope: current.scope,
        new_scope: { packages: ["WP-events-filter"], gate: "mission-workflow-smoke" },
        old_exit_condition: current.exit_condition,
        new_exit_condition: "One more thing.",
        health: {
          color: current.health.color,
          reason_codes: current.health.reasons.map((reason: { code: string }) => reason.code),
        },
        approved_by: "Brian",
        authorization: "Carry on.",
        reason: "Convenience.",
        expires_at: new Date(clock(m) + EPOCH_LIMITS.extensionMs).toISOString(),
      }),
    ).rejects.toThrow(/never crosses into the integrated walker, cutover or closeout/);
  });

  it("derives yellow and red from structured evidence with reason codes", async () => {
    const m = fixture();
    await executionEpoch(m);
    const opened = Date.parse(view(m).opened_at);

    // Age alone, at the named thresholds and nowhere before them.
    expect(view(m, opened + EPOCH_LIMITS.yellowAgeMs - 1).health.color).toBe("green");
    const yellow = view(m, opened + EPOCH_LIMITS.yellowAgeMs).health;
    expect(yellow.color).toBe("yellow");
    expect(yellow.reasons.map((reason: { code: string }) => reason.code)).toContain("epoch-age");
    expect(view(m, opened + EPOCH_LIMITS.redAgeMs).health.color).toBe("red");

    // Missing optional telemetry reads unknown, and is never green evidence.
    expect(yellow.unknown.map((entry: { signal: string }) => entry.signal)).toContain(
      "context-usage",
    );

    // A lost worker is red on its own, and points at the event that says so.
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-filter",
      worker_id: "worker-1",
      worktree: ".claude/worktrees/wp-events",
      branch: "feat/wp-events",
    });
    await m.append({
      type: "worker-abandoned",
      package_id: "WP-events-filter",
      reason: "worker process exited without a receipt",
    });
    const red = view(m).health;
    expect(red.color).toBe("red");
    const abandoned = red.reasons.find(
      (reason: { code: string }) => reason.code === "worker-abandoned",
    );
    expect(abandoned.event_index).toBe(read(m).eventCount - 1);
    expect(
      readJournal(missionPaths(m.repo, MISSION, m.env).journal)[abandoned.event_index].type,
    ).toBe("worker-abandoned");
  });

  it("keeps running work at the head of the next wave rather than stranding it", async () => {
    const m = fixture();
    await executionEpoch(m);
    await driveToMerge(m, "WP-attendance-export", { visual: false });
    await rotate(m, "lead-3");
    // Both remaining packages are eligible now, so the wave is plan order.
    expect(view(m).scope.packages).toEqual(["WP-events-filter", "WP-report-footer"]);

    await m.append({
      type: "worker-dispatched",
      package_id: "WP-report-footer",
      worker_id: "worker-3",
      worktree: ".claude/worktrees/wp-report",
      branch: "feat/wp-report",
    });
    await rotate(m, "lead-4");
    // The package carrying a worker leads the next wave despite plan order, so
    // a rotation drains it instead of leaving it outside the new assignment.
    expect(view(m).scope.packages).toEqual(["WP-report-footer", "WP-events-filter"]);
    await expect(
      m.append({
        type: "worker-receipt",
        package_id: "WP-report-footer",
        worker_id: "worker-3",
        receipt: workerReceipt("completed"),
      }),
    ).resolves.toBeTruthy();
  });

  it("counts owner answers as pressure, then as risk", async () => {
    const m = fixture();
    await executionEpoch(m);
    const ask = async (index: number) => {
      await m.append({
        type: "owner-question",
        id: `Q-${index}`,
        classification: "hourly",
        text: `Synthetic question ${index}`,
        source: "fixture",
        affected_packages: [],
      });
      await m.append({
        type: "owner-answer",
        question_id: `Q-${index}`,
        answer: "Yes.",
        answered_by: "Brian",
        reusable: false,
      });
    };
    for (let index = 1; index < EPOCH_LIMITS.yellowOwnerAnswers; index += 1) await ask(index);
    expect(view(m).health.color).toBe("green");
    await ask(EPOCH_LIMITS.yellowOwnerAnswers);
    const pressured = view(m).health;
    expect(pressured.color).toBe("yellow");
    expect(pressured.reasons[0]).toMatchObject({ code: "owner-answers" });
    expect(pressured.reasons[0].event_index).toBe(read(m).eventCount - 1);

    for (
      let index = EPOCH_LIMITS.yellowOwnerAnswers + 1;
      index <= EPOCH_LIMITS.redOwnerAnswers;
      index += 1
    ) {
      await ask(index);
    }
    expect(view(m).health.color).toBe("red");
  });

  it("reads corrected entries, repeated rounds, replaced sessions and delegated evidence as red", async () => {
    const m = fixture();
    await executionEpoch(m);

    // The signals are recorded in the order a mission would produce them: the
    // execution first, then the annotations. Once any of them is red the epoch
    // is fenced, and no further dispatch would be accepted — which is the point.
    // The Lead filing work that belongs to a worker.
    await m.append({
      type: "worker-dispatched",
      package_id: "WP-events-filter",
      worker_id: "lead-2",
      worktree: ".claude/worktrees/wp-events",
      branch: "feat/wp-events",
    });
    await m.append({
      type: "worker-receipt",
      package_id: "WP-events-filter",
      worker_id: "lead-2",
      receipt: workerReceipt("completed"),
    });
    await m.append({
      type: "pr-opened",
      package_id: "WP-events-filter",
      pr_number: 42,
      head_sha: SHA,
    });
    // A third invocation on one package lineage.
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: { ...reviewReceipt("blocked"), round: EPOCH_LIMITS.redReviewRound },
    });
    // A Lead correcting its own journal entry.
    await m.append({
      type: "journal-annotation",
      target_event: 2,
      disposition: "corrected",
      reason: "The recorded plan misstated the collision domain.",
      correction: "WP-events-filter is in the events domain.",
    });
    // A session acting inside an assignment it did not open.
    await m.append({ type: "lead-heartbeat", lead_id: "lead-replacement", pid: 4243 });

    const health = view(m).health;
    expect(health.color).toBe("red");
    expect(health.red.map((reason: { code: string }) => reason.code)).toEqual(
      expect.arrayContaining([
        "lead-entry-corrected",
        "session-replaced",
        "lead-filed-delegated-evidence",
        "review-round-repeat",
      ]),
    );
    // A blocked review owing a correction is its own recoverable signal.
    expect(health.yellow.map((reason: { code: string }) => reason.code)).toContain(
      "correction-round-active",
    );
    for (const reason of health.reasons) {
      expect(typeof reason.code).toBe("string");
      expect(reason.event_index === null || Number.isInteger(reason.event_index)).toBe(true);
    }
  });

  it("treats a reused Lead identity as red", async () => {
    const m = fixture();
    await planningEpoch(m, "lead-1");
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
    await rotate(m, "lead-2");
    // Not the epoch immediately before, so the handshake accepts it — and the
    // health says plainly that this session has held this mission before.
    await rotate(m, "lead-1");
    const health = view(m).health;
    expect(health.color).toBe("red");
    expect(health.red.map((reason: { code: string }) => reason.code)).toContain(
      "session-identity-reused",
    );
  });

  it("treats an epoch with no Lead identity as red", () => {
    // Nothing can open one through the CLI, which requires the identity. This
    // is the fail-closed reading: an unfenced assignment is never green.
    const health = epochHealth(
      {
        epoch_id: "E-unfenced",
        lead_id: "",
        opened_at: new Date(0).toISOString(),
        opening_event_index: 0,
        scope: { packages: [] },
        signals: emptyEpochSignals(),
      },
      { activeWorkers: [], packages: {} },
      { now: 0 },
    )!;
    expect(health.color).toBe("red");
    expect(health.red.map((reason: { code: string }) => reason.code)).toContain(
      "session-identity-absent",
    );
  });

  it("warns as a wave approaches its exit condition", async () => {
    const m = fixture();
    await executionEpoch(m);
    await driveToMerge(m, "WP-attendance-export", { visual: false });
    expect(view(m).health.color).toBe("green");

    // The other package in the wave is gated at its exact head, so the epoch is
    // one merge from being over.
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
    await m.append({
      type: "review-receipt",
      package_id: "WP-events-filter",
      receipt: reviewReceipt("clear"),
    });
    await m.append({
      type: "visual-approval",
      package_id: "WP-events-filter",
      approved_by: "Brian",
      evidence: "synthetic live review",
    });
    await m.append({
      type: "package-gate-passed",
      package_id: "WP-events-filter",
      head_sha: SHA,
      receipt: buildMissionReceipt(read(m), "WP-events-filter", SHA),
    });
    const health = view(m).health;
    expect(health.color).toBe("yellow");
    expect(health.yellow.map((reason: { code: string }) => reason.code)).toContain(
      "approaching-scope-boundary",
    );
  });

  it("recommends a recycle at yellow and fences red until Brian accepts the risk", async () => {
    const m = fixture();
    await executionEpoch(m);
    const opened = Date.parse(view(m).opened_at);

    const atYellow = nextActions(read(m), { now: opened + EPOCH_LIMITS.yellowAgeMs });
    expect(atYellow[0]).toMatchObject({ action: "recycle-lead" });
    expect(atYellow[0].health!.color).toBe("yellow");
    // Yellow is a recommendation, not a fence: ordinary work still appears.
    expect(atYellow.some((action) => action.action === "dispatch")).toBe(true);

    // Red is a fence. The epoch reaches a boundary with nobody recording one.
    const atRed = view(m, opened + EPOCH_LIMITS.redAgeMs);
    expect(atRed.status).toBe("boundary-pending");
    expect(atRed.boundary_reason).toMatch(/Health is red \(epoch-age\)/);

    const proposal = (overrides: Record<string, unknown> = {}) => ({
      type: "lead-epoch-adjusted",
      kind: "extend-current",
      source_epoch_id: "E-2",
      target_epoch_id: "E-2",
      old_scope: atRed.scope,
      new_scope: { packages: ["WP-events-filter", "WP-attendance-export"], gate: null },
      old_exit_condition: atRed.exit_condition,
      new_exit_condition: "WP-events-filter and WP-attendance-export have merged to main.",
      health: { color: "red", reason_codes: ["epoch-age"] },
      approved_by: "Brian",
      authorization: "I know it is long. Finish this wave.",
      reason: "The wave is nearly done.",
      correction_package_id: undefined,
      expires_at: new Date(opened + EPOCH_LIMITS.redAgeMs + EPOCH_LIMITS.extensionMs).toISOString(),
      ...overrides,
    });

    // Filing it against a red epoch without naming the risk is refused, and
    // calling it green is refused even harder.
    await expect(
      m.append({ ...proposal(), at: new Date(opened + EPOCH_LIMITS.redAgeMs).toISOString() }),
    ).rejects.toThrow(/epoch-age is unaccepted/);
    await expect(
      m.append({
        ...proposal({
          health: { color: "green", reason_codes: [] },
          accepted_reason_codes: ["epoch-age"],
        }),
        at: new Date(opened + EPOCH_LIMITS.redAgeMs).toISOString(),
      }),
    ).rejects.toThrow(/records the health the harness computed \(red\)/);
  });

  it("keeps the implementation Lead out of the integrated walker and the closeout", async () => {
    const m = fixture();
    await executionEpoch(m);
    await driveToMerge(m, "WP-events-filter");
    await driveToMerge(m, "WP-attendance-export", { visual: false });
    await rotate(m, "lead-3");
    await driveToMerge(m, "WP-report-footer");

    // Every package has merged, so this wave is done — and the walker is not
    // its work to file, however eligible the mission now is.
    const finished = view(m);
    expect(finished.status).toBe("boundary-pending");
    const walker = {
      type: "integrated-review",
      mode: "workflow-walker",
      head_sha: SHA,
      package_heads: Object.fromEntries(plan.packages.map((pkg: { id: string }) => [pkg.id, SHA])),
      result: "clear",
      jobs_completed:
        "Signed in, drafted a practice, confirmed its audience and took the register.",
      report: "reviews/final-smoke.json",
    };
    await expect(m.append(walker)).rejects.toThrow(/"integrated-review" is integration work/);

    await rotate(m, "lead-4");
    expect(view(m).phase).toBe("integration");
    await expect(m.append(walker)).resolves.toBeTruthy();
  });

  it("gives cutover and closeout their own epochs", async () => {
    const m = fixture();
    await walkedMission(m);
    expect(view(m).status).toBe("boundary-pending");

    // An unanswered owner decision is acceptance work, not closeout work.
    await m.append({
      type: "owner-question",
      id: "Q-cutover",
      classification: "immediate",
      text: "Has the external provider confirmed the cutover window?",
      source: "packet gates.external",
      affected_packages: [],
    });
    await rotate(m, "lead-5");
    expect(view(m).phase).toBe("acceptance-cutover");

    const closeout = {
      type: "mission-closeout",
      outcome: "delivered",
      notion_record: "notion://synthetic/mission-record",
      shipped: plan.packages.map(() => ({
        linear_issue_id: "LAN-900",
        pr_number: 42,
        sha: SHA,
      })),
      owner_actions: "none",
      next_action: "none",
    };
    await expect(m.append(closeout)).rejects.toThrow(/"mission-closeout" is closeout work/);

    await m.append({
      type: "owner-answer",
      question_id: "Q-cutover",
      answer: "Confirmed for Friday.",
      answered_by: "Brian",
      reusable: false,
    });
    expect(view(m).status).toBe("boundary-pending");
    await rotate(m, "lead-6");
    expect(view(m).phase).toBe("closeout");
    await expect(m.append(closeout)).resolves.toBeTruthy();
  });

  it("re-cuts future waves only, inside the approved DAG", async () => {
    const m = fixture();
    await planningEpoch(m);
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
    // An unanswered question holds the export back, so this wave is one package
    // and two remain to be grouped.
    await m.append({
      type: "owner-question",
      id: "Q-hold",
      classification: "hourly",
      text: "Should the export include withdrawn members?",
      source: "packet requirement REQ-attendance-export",
      affected_packages: ["WP-attendance-export"],
    });
    await rotate(m, "lead-2");
    expect(view(m).scope.packages).toEqual(["WP-events-filter"]);

    const recut = (waves: string[][]) => ({
      type: "lead-epoch-adjusted",
      kind: "recut-future",
      source_epoch_id: "E-2",
      target_epoch_id: null,
      old_scope: view(m).scope,
      new_scope: view(m).scope,
      old_exit_condition: view(m).exit_condition,
      new_exit_condition: view(m).exit_condition,
      future_waves: waves,
      health: { color: "green", reason_codes: [] },
      approved_by: "Brian",
      authorization: "Yes, group the export and the footer that way.",
      reason: "Fewer rotations for two small packages.",
    });

    // The DAG is not up for regrouping: the footer cannot precede or share a
    // wave with the export it depends on.
    await expect(m.append(recut([["WP-report-footer"], ["WP-attendance-export"]]))).rejects.toThrow(
      /depends on WP-attendance-export, no later than/,
    );
    await expect(m.append(recut([["WP-attendance-export", "WP-report-footer"]]))).rejects.toThrow(
      /depends on WP-attendance-export, no later than/,
    );
    // Nor may it add, drop or invent approved work.
    await expect(m.append(recut([["WP-attendance-export"]]))).rejects.toThrow(
      /WP-report-footer is dropped by this re-cut/,
    );
    await expect(m.append(recut([["WP-attendance-export"], ["WP-events-filter"]]))).rejects.toThrow(
      /WP-events-filter is not a future package/,
    );

    const before = read(m);
    const after = await m.append(recut([["WP-attendance-export"], ["WP-report-footer"]]));
    expect(after.epochPlan.futureWaves).toEqual([["WP-attendance-export"], ["WP-report-footer"]]);
    // The approved plan itself is untouched — same packages, same edges.
    expect(after.packages).toEqual(before.packages);
    expect(after.decomposition).toEqual(before.decomposition);
    // And it kept nobody's session alive, so it spent no extension budget.
    expect(view(m).adjustments_used).toBe(0);
  });

  it("lets a wave propose a revised plan but never approve one", async () => {
    const m = fixture();
    await executionEpoch(m);
    const revised = plan.packages.map((pkg: Record<string, unknown>) =>
      pkg.id === "WP-report-footer" ? { ...pkg, title: "Synthetic: revised footer" } : pkg,
    );

    // Recording a revised decomposition creates nothing, so it is allowed in
    // place — and it withdraws the approval, which is what makes the harness
    // derive a planning epoch next.
    const proposed = await m.append({
      type: "plan-recorded",
      packages: revised,
      decomposition: plan.decomposition,
    });
    expect(proposed.planApproved).toBeNull();
    expect(deriveEpochDefinition(proposed).phase).toBe("planning");

    // Approving it is a different act and belongs to a fresh Lead.
    await expect(
      m.append({
        type: "plan-approved",
        approved_by: "Brian",
        evidence: "revised decomposition presented",
      }),
    ).rejects.toThrow(/"plan-approved" is planning work/);
  });

  it("requires a live epoch before a revised packet may replace the contract", async () => {
    const m = fixture();
    await executionEpoch(m);
    const revised = {
      ...packet,
      packet_version: packet.packet_version + 1,
      gates: { owner: [], external: [] },
    };

    // A revised packet is not new execution, so a boundary still accepts the
    // owner's contract arriving — that is how drift-stopped work resumes.
    await m.append({ type: "lead-epoch-boundary-reached", reason: "Rotating the Lead." });
    expect(view(m).status).toBe("boundary-pending");
    await expect(m.append({ type: "packet-revised", packet: revised })).resolves.toBeTruthy();

    // A closed epoch accepts nothing. Without this the mission's whole approved
    // contract — requirements, owner gates, non-goals — could be replaced after
    // the handover, by the very session that just gave the mission up.
    const before = read(m);
    await m.append({
      type: "lead-epoch-closed",
      reason: "The epoch reached its boundary.",
      resume_token: "token-contract",
      ...dossier(before),
    });
    await expect(
      m.append({
        type: "packet-revised",
        packet: { ...revised, packet_version: revised.packet_version + 1 },
      }),
    ).rejects.toThrow(/is closed/);
    // The contract that was there before the close is still the one in force.
    expect(read(m).packet.packet_version).toBe(revised.packet_version);
  });

  it("replays an epoch-free journal unchanged and adopts an epoch prospectively", async () => {
    const file = path.join(__dirname, "fixtures", "mission", "mission-4-shaped-journal.ndjson");
    const events = readJournal(file);
    const state = reduce(events);

    // Mission 4's shape, and its consequence: a plan approved, execution
    // continued under one Lead, and the recycle still owed at the end.
    expect(state.eventCount).toBe(events.length);
    expect(events.filter((event) => event.type === "lead-heartbeat").length).toBeGreaterThan(5);
    expect(state.phaseRecycles).toEqual([]);
    expect(state.epoch).toBeNull();
    expect(state.epochHistory).toEqual([]);
    // Everything the journal earned is still there.
    expect(state.packages["WP-events-filter"].status).toBe("merged");
    expect(state.reclaimed).toEqual(["WP-events-filter"]);
    expect(state.planApproved).toMatchObject({ by: "Brian" });
    expect(nextActions(state).length).toBeGreaterThan(0);
    // Reading it rewrites nothing.
    expect(readJournal(file)).toEqual(events);

    // The next epoch is the boundary it owes, not the execution it wanted.
    expect(deriveEpochDefinition(state).phase).toBe("post-plan-boundary");

    const m = fixture();
    const journal = missionPaths(m.repo, MISSION, m.env).journal as string;
    fs.mkdirSync(path.dirname(journal), { recursive: true, mode: 0o700 });
    fs.writeFileSync(journal, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
    const adopted = await m.append(
      openEvent(read(m), { lead_id: "lead-fresh", bootstrapped: true }),
    );
    expect(adopted.epoch).toMatchObject({ phase: "post-plan-boundary", bootstrapped: true });
    // No epoch was invented for the work already done.
    expect(adopted.epochHistory).toEqual([]);
    expect(adopted.epoch.opening_event_index).toBe(events.length);
  });

  it("refuses the plan-approved-to-worker-dispatched sequence Mission 4 recorded", async () => {
    const file = path.join(__dirname, "fixtures", "mission", "mission-4-shaped-journal.ndjson");
    const events = readJournal(file);
    const at = events.findIndex((event) => event.type === "worker-dispatched");
    const dispatch = events[at];
    const before = events.slice(0, at);

    // The shape: approved, then straight into durable execution, with no stop
    // and no recycle in between.
    expect(before.some((event) => event.type === "plan-approved")).toBe(true);
    expect(before.some((event) => event.type === "mission-stopped")).toBe(false);
    // Before LAN-178 this was the whole of the protection: nothing refused it.
    expect(validateEvent(dispatch, reduce(before))).toEqual([]);

    const m = fixture();
    const journal = missionPaths(m.repo, MISSION, m.env).journal as string;
    fs.mkdirSync(path.dirname(journal), { recursive: true, mode: 0o700 });
    fs.writeFileSync(journal, `${before.map((event) => JSON.stringify(event)).join("\n")}\n`);
    await m.append(openEvent(read(m), { lead_id: "lead-fresh", bootstrapped: true }));

    await expect(m.append(dispatch)).rejects.toThrow(/post-plan-boundary/);
    await expect(m.append(dispatch)).rejects.toThrow(/"worker-dispatched" is dispatch work/);
  });

  it("generates a dossier of the working set, not of the narration", async () => {
    const file = path.join(__dirname, "fixtures", "mission", "mission-4-shaped-journal.ndjson");
    const events = readJournal(file);
    const m = fixture();
    const journal = missionPaths(m.repo, MISSION, m.env).journal as string;
    fs.mkdirSync(path.dirname(journal), { recursive: true, mode: 0o700 });
    fs.writeFileSync(journal, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
    await m.append(openEvent(read(m), { lead_id: "lead-fresh", bootstrapped: true }));
    await m.append({
      type: "owner-question",
      id: "Q-open",
      classification: "immediate",
      text: "Which recipients may the export include?",
      source: "privacy boundary",
      affected_packages: ["WP-attendance-export"],
    });
    await m.append({
      type: "journal-annotation",
      target_event: 16,
      disposition: "corrected",
      reason: "The receipt overstated its verification.",
      correction: "Only the events suite was run, not npm run verify.",
    });

    const state = read(m);
    const generated = resumeDossier(state, { now: clock(m) });
    const serialized = JSON.stringify(generated);

    // A third of that journal is heartbeats. None of them survive, because the
    // dossier is a projection of state and never a reading of the narration.
    expect(serialized).not.toMatch(/heartbeat/);
    expect(serialized).not.toMatch(/lead-heartbeat/);
    expect(generated.source_event_index).toBe(state.eventCount - 1);

    // What does survive is the frontier and what is still owed.
    expect(generated.objective).toBe(packet.objective);
    expect(generated.packages.completed).toEqual([
      expect.objectContaining({ id: "WP-events-filter", reclaimed: true }),
    ]);
    expect(generated.packages.blocked.map((entry: { id: string }) => entry.id)).toContain(
      "WP-attendance-export",
    );
    expect(generated.packages.waiting.map((entry: { id: string }) => entry.id)).toContain(
      "WP-report-footer",
    );
    expect(generated.open_owner_decisions.map((entry: { id: string }) => entry.id)).toEqual([
      "Q-open",
    ]);
    expect(generated.operative_corrected_decisions).toContainEqual(
      expect.objectContaining({ kind: "journal-correction", target_event: 16 }),
    );
    expect(
      generated.unverified_acceptance_criteria.map(
        (entry: { requirement_id?: string }) => entry.requirement_id,
      ),
    ).toContain("REQ-attendance-export");
    // Resource reporting stays at the abstraction the harness already uses.
    expect(Object.keys(generated.resources)).toEqual([
      "live_packages",
      "active_workers",
      "reclaimed_packages",
      "checkpoints",
    ]);
    expect(serialized).not.toMatch(/"pid"/);
  });

  it("offers Brian exactly three choices at a boundary, with the health behind them", async () => {
    const m = fixture();
    await planningEpoch(m);
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

    const actions = nextActions(read(m), { now: clock(m) });
    expect(actions.map((action) => action.action)).toEqual([
      "continue-fresh-lead",
      "pause-or-stop-mission",
      "adjust-epoch",
    ]);
    const [recommended, pause, adjust] = actions;
    expect(recommended.health).toMatchObject({ color: "green", reasons: [] });
    expect(recommended.health!.unknown[0].signal).toBe("context-usage");
    expect(recommended.detail).toMatch(/Recommended/);
    expect(recommended.detail).toMatch(/epoch close/);
    expect(recommended.detail).toMatch(/--token/);
    expect(recommended.next_scope).toEqual([]);
    expect(pause.detail).toMatch(/mission -- stop/);
    // What an adjustment may and may not change is stated where Brian reads it.
    expect(adjust.detail).toMatch(/Owner approval required/);
    expect(adjust.detail).toMatch(
      /Neither changes the approved packages, requirements, dependency DAG or acceptance criteria/,
    );
  });
});
