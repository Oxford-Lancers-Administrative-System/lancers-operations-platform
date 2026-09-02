import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LEAD_TTL_MS,
  MAX_ACTIVE_WORKERS,
  appendEvent,
  currentExecutionEpoch,
  executionEpochs,
  guardedLaneRefusals,
  leadLeaseAvailable,
  missionPaths,
  nextActions,
  packageLifecycle,
  readJournal,
  reduce,
  replayState,
  validateEvent,
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
import { withReviewInvocations } from "./helpers/mission-invocations";

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
  const raw = (event: object) => appendEvent(repo, MISSION, event, { env, now: (tick += 1000) });
  // LAN-179: a receipt now needs a real invocation behind it. These cases are
  // about everything else, so the helper performs those events for them.
  const append = withReviewInvocations(repo, MISSION, env, raw);
  return { repo, env, append, raw };
}

/**
 * A plan event with a valid decomposition and separations, so a test that is
 * about cycles, domains or dependencies asserts that and not LAN-148 §A's
 * bookkeeping. Tests that are about the bookkeeping build their own.
 */
type PlanPackage = Record<string, unknown> & {
  id: string;
  depends_on?: string[];
  separation?: Record<string, string>;
};

function plannedEpochs(packages: PlanPackage[]) {
  const ids = new Set(packages.map((pkg) => pkg.id));
  const planned = plan.decomposition.execution_epochs
    .map((epoch: { id: string; package_ids: string[] }) => ({
      ...epoch,
      package_ids: epoch.package_ids.filter((id) => ids.has(id)),
    }))
    .filter((epoch: { package_ids: string[] }) => epoch.package_ids.length > 0);
  const original = new Set(plan.packages.map((pkg: { id: string }) => pkg.id));
  for (const pkg of packages.filter((candidate) => !original.has(candidate.id))) {
    planned.push({ id: `E-${planned.length + 1}`, package_ids: [pkg.id] });
  }
  return planned;
}

const planEvent = (packages: PlanPackage[], extra: object = {}) => ({
  type: "plan-recorded",
  packages: packages.map((pkg) =>
    packages.length > 1 && !pkg.separation
      ? { ...pkg, separation: plan.packages[0].separation }
      : pkg,
  ),
  decomposition: {
    ...plan.decomposition,
    execution_epochs: plannedEpochs(packages),
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
    // LAN-209: a gate pass is the durable record that this package's draft may
    // be lifted. It records no receipt; the conditions are re-derived here.
    await expect(
      m.append({
        type: "package-gate-passed",
        package_id: "WP-events-filter",
        head_sha: "c".repeat(40),
      }),
    ).rejects.toThrow(/exact current 40-character head SHA/);
    const gated = await m.append({
      type: "package-gate-passed",
      package_id: "WP-events-filter",
      head_sha: SHA,
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
    ).rejects.toThrow(/qualified to leave draft; routing it to Brian anyway records why/);

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
  async function checkpointMergedEpochs(m: ReturnType<typeof fixture>) {
    let state = replayState(m.repo, MISSION, m.env);
    for (let epoch = currentExecutionEpoch(state); epoch; epoch = currentExecutionEpoch(state)) {
      for (const packageId of epoch.package_ids) {
        const pkg = state.packages[packageId];
        if (pkg.status === "merged" && !state.reclaimed.includes(packageId)) {
          state = await m.append({
            type: "package-reclaimed",
            package_id: packageId,
            merge_sha: pkg.merged.sha,
          });
        }
      }
      epoch = currentExecutionEpoch(state);
      if (!epoch?.complete) throw new Error(`${epoch?.id ?? "epoch"} is not complete`);
      state = await m.append({ type: "checkpoint", number: state.checkpoints + 1 });
    }
    return state;
  }

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
    const merged = await checkpointMergedEpochs(m);
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
    await checkpointMergedEpochs(m);
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
    await checkpointMergedEpochs(m);
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
    await checkpointMergedEpochs(m);
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
    const corrected = await checkpointMergedEpochs(m);
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
    await checkpointMergedEpochs(m);

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
    await checkpointMergedEpochs(m);
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
    await checkpointMergedEpochs(m);

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
    await checkpointMergedEpochs(m);
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

/** Planned execution epochs (LAN-192). */
describe("planned execution epochs", () => {
  const baseEvents = (decomposition = plan.decomposition) => [
    { type: "mission-init", at: "2026-08-29T12:00:00.000Z", packet, lead_id: "lead-1", pid: 4242 },
    {
      type: "plan-recorded",
      at: "2026-08-29T12:00:01.000Z",
      packages: plan.packages,
      decomposition,
    },
    {
      type: "plan-approved",
      at: "2026-08-29T12:00:02.000Z",
      approved_by: "Brian",
      evidence: "approved decomposition",
    },
  ];

  it("uses the ordered issue groups approved with the plan", () => {
    const state = reduce(baseEvents());
    expect(executionEpochs(state)).toEqual(plan.decomposition.execution_epochs);
    expect(currentExecutionEpoch(state)).toMatchObject({
      id: "E-1",
      package_ids: ["WP-events-filter", "WP-attendance-export"],
      complete: false,
    });
  });

  it("allows dependent packages in one group so they may run sequentially", () => {
    const decomposition = {
      ...plan.decomposition,
      execution_epochs: [
        { id: "E-1", package_ids: ["WP-attendance-export", "WP-report-footer"] },
        { id: "E-2", package_ids: ["WP-events-filter"] },
      ],
    };
    const before = reduce(baseEvents().slice(0, 1));
    const event = baseEvents(decomposition)[1];
    expect(validateEvent(event, before)).toEqual([]);
    expect(currentExecutionEpoch(reduce(baseEvents(decomposition)))?.package_ids).toEqual([
      "WP-attendance-export",
      "WP-report-footer",
    ]);
  });

  it("validates group size, complete coverage, uniqueness and dependency order", () => {
    const before = reduce(baseEvents().slice(0, 1));
    const defects = (execution_epochs: Array<{ id: string; package_ids: string[] }>) =>
      validateEvent(baseEvents({ ...plan.decomposition, execution_epochs })[1], before).join("\n");

    expect(
      defects([{ id: "E-1", package_ids: plan.packages.map((pkg: { id: string }) => pkg.id) }]),
    ).toMatch(/one or two packages/);
    expect(defects([{ id: "E-1", package_ids: ["WP-events-filter"] }])).toMatch(
      /does not belong to an execution epoch/,
    );
    expect(
      defects([
        { id: "E-1", package_ids: ["WP-events-filter", "WP-report-footer"] },
        { id: "E-2", package_ids: ["WP-attendance-export"] },
      ]),
    ).toMatch(/must be in the same or an earlier execution epoch/);
  });

  it("projects deterministic two-package groups for legacy plans", () => {
    const decomposition = { ...plan.decomposition };
    delete decomposition.execution_epochs;
    const state = reduce(baseEvents(decomposition));
    expect(executionEpochs(state)).toEqual([
      { id: "E-1", package_ids: ["WP-events-filter", "WP-attendance-export"] },
      { id: "E-2", package_ids: ["WP-report-footer"] },
    ]);
  });

  it("keeps historical runtime epoch events readable but inert", () => {
    const events = baseEvents();
    const before = reduce(events);
    const legacy = {
      type: "lead-epoch-opened",
      at: "2026-08-29T12:00:03.000Z",
      epoch_id: "E-old",
    };
    expect(validateEvent(legacy, before)).toEqual([]);
    expect(currentExecutionEpoch(reduce([...events, legacy]))).toEqual(
      currentExecutionEpoch(before),
    );
  });

  it("offers only the current group and advances only after its completion checkpoint", async () => {
    const m = fixture();
    await readyMission(m);
    expect(
      nextActions(replayState(m.repo, MISSION, m.env))
        .filter((action) => action.action === "dispatch")
        .map((action) => action.package_id),
    ).toEqual(["WP-events-filter", "WP-attendance-export"]);

    const completed = reduce([
      ...baseEvents(),
      ...["WP-events-filter", "WP-attendance-export"].flatMap((package_id, index) => [
        {
          type: "merge-recorded",
          at: `2026-08-29T12:00:1${index}.000Z`,
          package_id,
          sha: SHA,
          route: "guarded",
        },
        {
          type: "package-reclaimed",
          at: `2026-08-29T12:00:2${index}.000Z`,
          package_id,
          merge_sha: SHA,
        },
      ]),
    ]);
    expect(currentExecutionEpoch(completed)?.complete).toBe(true);
    expect(nextActions(completed).map((action) => action.action)).toContain("checkpoint-and-stop");

    const advanced = reduce([
      ...baseEvents(),
      ...["WP-events-filter", "WP-attendance-export"].flatMap((package_id, index) => [
        {
          type: "merge-recorded",
          at: `2026-08-29T12:01:1${index}.000Z`,
          package_id,
          sha: SHA,
          route: "guarded",
        },
        {
          type: "package-reclaimed",
          at: `2026-08-29T12:01:2${index}.000Z`,
          package_id,
          merge_sha: SHA,
        },
      ]),
      { type: "checkpoint", at: "2026-08-29T12:02:00.000Z", number: 1 },
    ]);
    expect(advanced.completedEpochs).toEqual(["E-1"]);
    expect(currentExecutionEpoch(advanced)?.id).toBe("E-2");
    const regrouped = baseEvents({
      ...plan.decomposition,
      execution_epochs: [
        { id: "E-1", package_ids: ["WP-events-filter"] },
        { id: "E-2", package_ids: ["WP-attendance-export", "WP-report-footer"] },
      ],
    })[1];
    expect(validateEvent(regrouped, advanced).join("\n")).toMatch(
      /Completed execution epoch E-1 is immutable/,
    );
  });
});
