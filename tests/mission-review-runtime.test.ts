/**
 * LAN-179: fresh reviewer and walker environments, and the evidence they owe.
 *
 * The invariant under test is one chain:
 *
 *   required capabilities -> broker provision -> fresh assigned actor executes
 *   -> structured evidence -> state gate -> deterministic cleanup
 *
 * Every case below is a link in it, and most are transcribed from a Mission 4
 * receipt that was accepted at the time. Where a case names LAN-171, LAN-172 or
 * LAN-173, the shape it refuses is the shape that mission actually recorded.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { appendEvent, nextActions, reduce, replayState } from "../scripts/mission/lib/state.mjs";
import {
  buildPackageReviewContract,
  buildWalkerContract,
  classifyReviewSurfaces,
  completionCriteria,
  contractHash,
  jobResultDefects,
} from "../scripts/mission/lib/review-contract.mjs";
import {
  capacityVerdict,
  healthDefects,
  newRuntimeId,
  provisionPlan,
  provisionReviewRuntime,
  reclamationDefects,
  releaseReviewRuntime,
} from "../scripts/mission/lib/runtime-broker.mjs";
import { loadRules } from "../scripts/mission/merge-gate.mjs";
import type { ContractJob, MissionState, ReviewContract } from "./helpers/mission-invocations";
import { healthFor, jobResultsFor, withReviewInvocations } from "./helpers/mission-invocations";

const replay = (m: { repo: string; env: NodeJS.ProcessEnv }): MissionState =>
  replayState(m.repo, MISSION, m.env);

/** The planned package with this visual class. Throws rather than returning
 * undefined, so a fixture drift is a loud failure and not a null check. */
function packageWithVisual(state: MissionState, visual: "ui" | "nonvisual") {
  const found = Object.values(state.packages).find(
    (pkg) => (visual === "nonvisual") === (pkg.visual === "nonvisual"),
  );
  if (!found) throw new Error(`The plan fixture has no ${visual} package.`);
  return found;
}

const packet = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "mission", "approved-packet.json"), "utf8"),
);
const messagingPacket = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures", "mission", "mission-4-shaped-packet.json"),
    "utf8",
  ),
);
const plan = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "mission", "three-package-plan.json"), "utf8"),
);

const MISSION = packet.mission_id as string;
const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const rules = loadRules();
const temporary: string[] = [];

// Every append here takes the mission lock and re-reduces the whole journal, and
// the walker cases write a job per completion criterion. That is slow by
// construction, not hung, and it outgrows Vitest's 5s default under the full
// suite's parallelism.
vi.setConfig({ testTimeout: 60_000 });

afterEach(() => {
  for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(withPacket = packet) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-review-runtime-"));
  temporary.push(root);
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo, { recursive: true });
  const env = { ...process.env, LANCERS_MISSION_ROOT: path.join(root, "state") };
  let tick = 1_700_000_000_000;
  const raw = (event: object) => appendEvent(repo, MISSION, event, { env, now: (tick += 1000) });
  return {
    repo,
    env,
    raw,
    packet: withPacket,
    append: withReviewInvocations(repo, MISSION, env, raw),
  };
}

/** Initialize, plan, approve, preflight and synchronize the three packages. */
async function readyMission(m: ReturnType<typeof fixture>) {
  await m.raw({ type: "mission-init", packet: m.packet, lead_id: "lead-fixture", pid: 4242 });
  await m.raw({
    type: "plan-recorded",
    packages: plan.packages,
    decomposition: plan.decomposition,
  });
  await m.raw({
    type: "plan-approved",
    approved_by: "Brian",
    evidence: "decomposition and owner cost presented at checkpoint 1",
  });
  await m.raw({
    type: "linear-preflight",
    result: "reachable",
    detail: "synthetic fixture driver answered a read-only teams query",
  });
  for (const [index, pkg] of plan.packages.entries()) {
    await m.raw({ type: "linear-sync-intent", package_id: pkg.id });
    await m.raw({ type: "linear-sync-result", package_id: pkg.id, issue_id: `LAN-90${index}` });
  }
}

const uxSources = {
  slice_ux: "docs/ux/slice-ux.md",
  standards: "docs/ux/standards.md",
  ticket_contract: "docs/ux/tickets/LAN-900-events-filter.md",
  wireframes: "docs/ux/wireframes/events-filter-desktop.png, events-filter-375.png",
};

const workerReceipt = () => ({
  ux_sources: uxSources,
  branch: "feat/synthetic",
  worktree: ".claude/worktrees/synthetic",
  surfaces: ["src/lib/services/events.ts"],
  acceptance_criteria: ["filter works"],
  verification: "npm run verify observed to pass",
  ci_state: "green",
  visual_state: "nonvisual",
  migration_implications: "none",
  limitations: "none",
  result: "completed",
});

/** Drive one package to a pull request, ready for a review invocation. */
async function built(m: ReturnType<typeof fixture>, packageId: string, head = SHA) {
  await m.raw({
    type: "worker-dispatched",
    package_id: packageId,
    worker_id: `worker-${packageId}`,
    worktree: `.claude/worktrees/${packageId}`,
    branch: `feat/${packageId}`,
  });
  await m.raw({
    type: "worker-receipt",
    package_id: packageId,
    worker_id: `worker-${packageId}`,
    receipt: workerReceipt(),
  });
  await m.raw({ type: "pr-opened", package_id: packageId, pr_number: 42, head_sha: head });
}

const SERVICE_DIFF = [{ status: "M", path: "src/lib/services/events.ts" }];
const DOC_DIFF = [{ status: "M", path: "docs/synthetic-note.md" }];
const SEED_DIFF = [{ status: "M", path: "tests/fixtures/mission/approved-packet.json" }];
const PUBLIC_DIFF = [{ status: "M", path: "src/lib/rsvp/token.ts" }];

/** Request, provision and dispatch one invocation, returning what it produced. */
async function invoke(
  m: ReturnType<typeof fixture>,
  packageId: string,
  {
    head = SHA,
    files = SERVICE_DIFF,
    round = 1,
    agentId = "reviewer-fresh-1",
    invocationId = "inv-1",
    runtimeId = "rt-000001",
    findingIds = [] as string[],
    runtimeState = "ready",
    ready = null as string[] | null,
  } = {},
) {
  const state = replay(m);
  const contract = buildPackageReviewContract({
    state,
    packageId,
    headSha: head,
    round,
    files,
    rules,
    findingIds,
  });
  await m.raw({
    type: "review-invocation-requested",
    invocation_id: invocationId,
    role: "package-reviewer",
    package_id: packageId,
    head_sha: head,
    round,
    changed_files: files,
    ...(findingIds.length > 0 ? { finding_ids: findingIds } : {}),
    contract,
    contract_hash: contractHash(contract),
  });
  const health = healthFor(contract as ReviewContract, head);
  if (ready) health.capabilities_ready = ready;
  await m.raw({
    type: "review-runtime-ready",
    invocation_id: invocationId,
    role: "package-reviewer",
    package_id: packageId,
    runtime_id: runtimeId,
    state: runtimeState,
    ...(runtimeState === "ready"
      ? {
          lease_slot: "mission-review-1",
          implementation_slot: "mission-implementation",
          health,
        }
      : { reason: "every review slot is busy" }),
  });
  if (runtimeState === "ready") {
    await m.raw({
      type: "reviewer-dispatched",
      invocation_id: invocationId,
      package_id: packageId,
      agent_id: agentId,
      session_id: `session-${agentId}`,
    });
  }
  return { contract, invocationId, runtimeId, agentId, head };
}

function receiptFrom(
  invocation: Awaited<ReturnType<typeof invoke>>,
  overrides: Record<string, unknown> = {},
) {
  return {
    review_mode: "package-gate",
    full_review_sha: invocation.head,
    reviewed_head_sha: invocation.head,
    round: 1,
    result: "clear",
    ci_state: "green",
    sensitive_paths: [],
    report: "reviews/package-gate.json",
    invocation_id: invocation.invocationId,
    runtime_id: invocation.runtimeId,
    agent_id: invocation.agentId,
    contract_hash: contractHash(invocation.contract),
    job_results: jobResultsFor(invocation.contract as ReviewContract),
    ...overrides,
  };
}

describe("generating the review contract from durable sources", () => {
  it("classifies the exact-head diff into the five terms the contract is built from", () => {
    const classification = classifyReviewSurfaces(
      [
        { status: "M", path: "src/lib/rsvp/token.ts" },
        { status: "M", path: "src/app/events/page.tsx" },
        { status: "M", path: "supabase/seed.sql" },
        { status: "M", path: "src/lib/delivery/whatsapp.ts" },
        { status: "M", path: "docs/synthetic-note.md" },
      ],
      rules,
    );
    expect(classification.sensitive).toContain("src/lib/rsvp/token.ts");
    expect(classification.visual).toContain("src/app/events/page.tsx");
    expect(classification.evidence).toContain("supabase/seed.sql");
    expect(classification.transport).toContain("src/lib/delivery/whatsapp.ts");
    expect(classification.sensitive).not.toContain("docs/synthetic-note.md");
  });

  it("derives capabilities and jobs mechanically, not from what the Lead asks for", async () => {
    const m = fixture();
    await readyMission(m);
    await built(m, "WP-player-answer" in plan.packages ? "WP-player-answer" : plan.packages[0].id);
    const state = replay(m);
    const contract = buildPackageReviewContract({
      state,
      packageId: plan.packages[0].id,
      headSha: SHA,
      files: PUBLIC_DIFF,
      rules,
    });

    // A public token surface pulls in the public browser context and the two
    // negative jobs a link scanner and a reload require.
    expect(contract.capabilities).toEqual(
      expect.arrayContaining(["public-session", "application"]),
    );
    const jobIds = contract.jobs.map((job: ContractJob) => job.id);
    expect(jobIds).toEqual(expect.arrayContaining(["RJ-public-scanner", "RJ-public-reload"]));
    // Every packet requirement the package claims becomes its own job.
    for (const requirementId of state.packages[plan.packages[0].id].requirement_ids) {
      expect(jobIds).toContain(`RJ-req-${requirementId}`);
    }
    expect(contract.reviewer_required).toBe(true);
  });

  it("keeps deterministic clearance only while the sensitive, rendered and evidence union is empty", async () => {
    const m = fixture();
    await readyMission(m);
    const state = replay(m);
    const nonvisual = packageWithVisual(state, "nonvisual");

    const empty = buildPackageReviewContract({
      state,
      packageId: nonvisual.id,
      headSha: SHA,
      files: DOC_DIFF,
      rules,
    });
    expect(empty.reviewer_required).toBe(false);

    // LAN-179 §5: a seed or fixture change is evidence-affecting even though no
    // component changed. Mission 4's LAN-173 fixture clearance is exactly this.
    const seeded = buildPackageReviewContract({
      state,
      packageId: nonvisual.id,
      headSha: SHA,
      files: SEED_DIFF,
      rules,
    });
    expect(seeded.reviewer_required).toBe(true);
    expect(seeded.classification?.evidence.length).toBeGreaterThan(0);
  });

  it("refuses a contract the Lead trimmed", async () => {
    const m = fixture();
    await readyMission(m);
    const packageId = plan.packages[0].id;
    await built(m, packageId);
    const state = replay(m);
    const contract = buildPackageReviewContract({
      state,
      packageId,
      headSha: SHA,
      files: PUBLIC_DIFF,
      rules,
    });
    const trimmed = {
      ...contract,
      capabilities: contract.capabilities.filter(
        (capability: string) => capability !== "public-session",
      ),
      jobs: contract.jobs.filter((job: ContractJob) => !job.id.startsWith("RJ-public")),
    };

    await expect(
      m.raw({
        type: "review-invocation-requested",
        invocation_id: "inv-trimmed",
        role: "package-reviewer",
        package_id: packageId,
        head_sha: SHA,
        round: 1,
        changed_files: PUBLIC_DIFF,
        contract: trimmed,
        contract_hash: contractHash(trimmed),
      }),
    ).rejects.toThrow(/exact contract the harness derives/);
  });
});

describe("brokering the runtime", () => {
  it("plans one step per capability and provides nothing it has no step for", () => {
    const plan = provisionPlan(["source-read", "database", "application", "browser-375"]);
    const steps = plan.map((entry) => entry.step);
    expect(steps).toEqual([
      "attach-worktree",
      "prove-no-destructive-reuse",
      "start-database",
      "start-application",
      "prepare-375-browser",
      "prove-health",
    ]);
    expect(
      healthDefects(
        {
          head_sha: SHA,
          capabilities_ready: [
            "source-read",
            "database",
            "application",
            "browser-375",
            "transport-seam",
          ],
          database: true,
          application: true,
          auth: true,
          url: "http://127.0.0.1:3101",
        },
        { capabilities: ["source-read", "database", "application", "browser-375"], headSha: SHA },
      ),
    ).toEqual([
      "transport-seam is reported ready but no provisioning step supplies it for this profile.",
    ]);
  });

  it("records waiting-for-capacity instead of a weaker review", async () => {
    const verdict = capacityVerdict({
      registry: { slots: {} },
      missionId: MISSION,
      liveRuntimes: ["rt-a", "rt-b"],
    });
    expect(verdict.state).toBe("waiting-for-capacity");

    const outcome = await provisionReviewRuntime({
      invocationId: "inv-queued",
      role: "package-reviewer",
      missionId: MISSION,
      headSha: SHA,
      capabilities: ["source-read"],
      registry: { slots: {} },
      liveRuntimes: ["rt-a", "rt-b"],
      executors: {},
    });
    expect(outcome.state).toBe("waiting-for-capacity");
    expect(outcome.reason).toMatch(/waits/);
  });

  it("refuses to dispatch a reviewer until the runtime is healthy at the exact head", async () => {
    const m = fixture();
    await readyMission(m);
    const packageId = plan.packages[0].id;
    await built(m, packageId);

    const state = replay(m);
    const contract = buildPackageReviewContract({
      state,
      packageId,
      headSha: SHA,
      files: SERVICE_DIFF,
      rules,
    });
    await m.raw({
      type: "review-invocation-requested",
      invocation_id: "inv-1",
      role: "package-reviewer",
      package_id: packageId,
      head_sha: SHA,
      round: 1,
      changed_files: SERVICE_DIFF,
      contract,
      contract_hash: contractHash(contract),
    });

    await expect(
      m.raw({
        type: "reviewer-dispatched",
        invocation_id: "inv-1",
        package_id: packageId,
        agent_id: "reviewer-fresh-1",
        session_id: "session-1",
      }),
    ).rejects.toThrow(/no brokered runtime/);

    await m.raw({
      type: "review-runtime-ready",
      invocation_id: "inv-1",
      role: "package-reviewer",
      package_id: packageId,
      runtime_id: "rt-000001",
      state: "waiting-for-capacity",
      reason: "every review slot is busy",
    });
    await expect(
      m.raw({
        type: "reviewer-dispatched",
        invocation_id: "inv-1",
        package_id: packageId,
        agent_id: "reviewer-fresh-1",
        session_id: "session-1",
      }),
    ).rejects.toThrow(/waiting-for-capacity runtime[\s\S]*never narrows/);
  });

  it("refuses a runtime that is the mission's shared implementation stack", async () => {
    const m = fixture();
    await readyMission(m);
    const packageId = plan.packages[0].id;
    await built(m, packageId);
    const state = replay(m);
    const contract = buildPackageReviewContract({
      state,
      packageId,
      headSha: SHA,
      files: SERVICE_DIFF,
      rules,
    });
    await m.raw({
      type: "review-invocation-requested",
      invocation_id: "inv-1",
      role: "package-reviewer",
      package_id: packageId,
      head_sha: SHA,
      round: 1,
      changed_files: SERVICE_DIFF,
      contract,
      contract_hash: contractHash(contract),
    });
    await expect(
      m.raw({
        type: "review-runtime-ready",
        invocation_id: "inv-1",
        role: "package-reviewer",
        package_id: packageId,
        runtime_id: "rt-000001",
        state: "ready",
        lease_slot: "mission-implementation",
        implementation_slot: "mission-implementation",
        health: healthFor(contract as ReviewContract, SHA),
      }),
    ).rejects.toThrow(/shared implementation stack/);
  });

  it("treats a missing seed scenario as an unready runtime, not a skipped job", () => {
    expect(
      healthDefects(
        {
          head_sha: SHA,
          capabilities_ready: ["source-read", "database", "database-reset-seed"],
          database: true,
          scenarios: [],
        },
        {
          capabilities: ["source-read", "database", "database-reset-seed"],
          headSha: SHA,
        },
      ),
    ).toEqual([
      "The runtime records the synthetic scenario identifiers it loaded. A missing seed state is an unready runtime, never a job the reviewer may skip.",
    ]);
  });

  it("gives each invocation attempt its own runtime identity", () => {
    expect(newRuntimeId("inv-1", 1)).not.toBe(newRuntimeId("inv-1", 2));
    expect(newRuntimeId("inv-1", 1)).toBe(newRuntimeId("inv-1", 1));
  });
});

describe("who may file the evidence", () => {
  it("refuses a receipt that names no dispatched invocation", async () => {
    const m = fixture();
    await readyMission(m);
    const packageId = plan.packages[0].id;
    await built(m, packageId);
    await expect(
      m.raw({
        type: "review-receipt",
        package_id: packageId,
        receipt: {
          review_mode: "package-gate",
          reviewed_head_sha: SHA,
          round: 1,
          result: "clear",
          ci_state: "green",
          sensitive_paths: [],
          report: "reviews/package-gate.json",
        },
      }),
    ).rejects.toThrow(/never dispatched/);
  });

  it("refuses the Mission Lead's own identity as the reviewer", async () => {
    const m = fixture();
    await readyMission(m);
    const packageId = plan.packages[0].id;
    await built(m, packageId);
    await expect(invoke(m, packageId, { agentId: "lead-fixture" })).rejects.toThrow(
      /Mission Lead's own identity[\s\S]*never files the evidence/,
    );
  });

  it("refuses the package's own implementer as the reviewer", async () => {
    const m = fixture();
    await readyMission(m);
    const packageId = plan.packages[0].id;
    await built(m, packageId);
    await expect(invoke(m, packageId, { agentId: `worker-${packageId}` })).rejects.toThrow(
      /implemented this work/,
    );
  });

  it("gives a correction round a fresh invocation, identity and runtime", async () => {
    const m = fixture();
    await readyMission(m);
    const packageId = plan.packages[0].id;
    await built(m, packageId);
    const first = await invoke(m, packageId);
    await m.raw({
      type: "review-receipt",
      package_id: packageId,
      receipt: receiptFrom(first, {
        result: "blocked",
        job_results: jobResultsFor(
          first.contract as ReviewContract,
          (first.contract as ReviewContract).jobs[0].id,
        ),
        findings: [{ id: "R-001", affected_jobs: [(first.contract as ReviewContract).jobs[0].id] }],
      }),
    });
    await m.raw({
      type: "correction-dispatched",
      package_id: packageId,
      worker_id: `worker-${packageId}`,
      finding_ids: ["R-001"],
    });
    await m.raw({
      type: "worker-receipt",
      package_id: packageId,
      worker_id: `worker-${packageId}`,
      receipt: {
        ...workerReceipt(),
        injection_evidence: [
          {
            finding_id: "R-001",
            test: "tests/mission-review-runtime.test.ts > the corrected behaviour",
            command: "npx vitest run tests/mission-review-runtime.test.ts",
            failing_output: "AssertionError: expected the guard to refuse",
            restored_pass: "1 passed",
            sha: OTHER_SHA,
          },
        ],
      },
    });
    await m.raw({ type: "pr-opened", package_id: packageId, pr_number: 42, head_sha: OTHER_SHA });

    // The same reviewer identity cannot take the correction round.
    await expect(
      invoke(m, packageId, {
        head: OTHER_SHA,
        round: 2,
        invocationId: "inv-2",
        runtimeId: "rt-000002",
        agentId: first.agentId,
        findingIds: ["R-001"],
      }),
    ).rejects.toThrow(/already held an invocation on this mission/);
    await m.raw({
      type: "review-invocation-abandoned",
      invocation_id: "inv-2",
      reason: "the identity offered for it had already reviewed this mission",
    });

    const second = await invoke(m, packageId, {
      head: OTHER_SHA,
      round: 2,
      invocationId: "inv-3",
      runtimeId: "rt-000003",
      agentId: "reviewer-fresh-2",
      findingIds: ["R-001"],
    });
    expect(second.runtimeId).not.toBe(first.runtimeId);
    expect(second.contract.jobs.map((job: ContractJob) => job.id)).toContain("RJ-finding-R-001");
  });
});

describe("what a clear receipt has to prove", () => {
  // The nonvisual package: these cases are about the job contract, not about
  // the separate visual-conformance gate ADR 0020 already owns.
  const NONVISUAL = plan.packages.find((pkg: { visual: string }) => pkg.visual === "nonvisual").id;

  async function ready(m: ReturnType<typeof fixture>, options = {}) {
    await readyMission(m);
    await built(m, NONVISUAL);
    return { packageId: NONVISUAL, invocation: await invoke(m, NONVISUAL, options) };
  }

  it("refuses a wrong head, runtime, invocation or contract hash", async () => {
    const m = fixture();
    const { packageId, invocation } = await ready(m);
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ runtime_id: "rt-somewhere-else" }, /not the runtime brokered/],
      [{ agent_id: "some-other-agent" }, /not the dispatched reviewer/],
      [{ contract_hash: "0".repeat(64) }, /contract hash does not match/],
      [{ invocation_id: "inv-nonexistent" }, /never dispatched/],
    ];
    for (const [override, expected] of cases) {
      await expect(
        m.raw({
          type: "review-receipt",
          package_id: packageId,
          receipt: receiptFrom(invocation, override),
        }),
      ).rejects.toThrow(expected);
    }
  });

  it("refuses a clear receipt that omits a contract job", async () => {
    const m = fixture();
    const { packageId, invocation } = await ready(m);
    const results = jobResultsFor(invocation.contract as ReviewContract).slice(1);
    await expect(
      m.raw({
        type: "review-receipt",
        package_id: packageId,
        receipt: receiptFrom(invocation, { job_results: results }),
      }),
    ).rejects.toThrow(/have no result[\s\S]*not a subset/);
  });

  it("refuses static reasoning where the contract requires live proof (LAN-172)", async () => {
    const m = fixture();
    const { packageId, invocation } = await ready(m);
    const liveJob = invocation.contract.jobs.find((job: ContractJob) => job.evidence === "live");
    if (!liveJob) throw new Error("This contract has no live job to substitute for.");
    const results = jobResultsFor(invocation.contract as ReviewContract).map((entry) =>
      entry.job_id === liveJob.id
        ? {
            ...entry,
            evidence_kind: "static",
            executed:
              "Reviewed the diff and the service tests; no live database verification was performed.",
          }
        : entry,
    );
    await expect(
      m.raw({
        type: "review-receipt",
        package_id: packageId,
        receipt: receiptFrom(invocation, { job_results: results }),
      }),
    ).rejects.toThrow(/requires live evidence[\s\S]*never a weaker proof/);
  });

  it("refuses a passing job described as not performed or blocked by capacity (LAN-171)", async () => {
    const m = fixture();
    const { packageId, invocation } = await ready(m);
    const jobId = (invocation.contract as ReviewContract).jobs[0].id;
    for (const narrative of [
      "Port 3010 was occupied, so this was omitted.",
      "Database acquisition was refused; a static substitute stands in.",
      "Seed state was missing, so this was not exercised.",
    ]) {
      const results = jobResultsFor(invocation.contract as ReviewContract).map((entry) =>
        entry.job_id === jobId ? { ...entry, executed: narrative } : entry,
      );
      await expect(
        m.raw({
          type: "review-receipt",
          package_id: packageId,
          receipt: receiptFrom(invocation, { job_results: results }),
        }),
      ).rejects.toThrow(/Record it blocked, or wait for the capability/);
    }
  });

  it("refuses visual work whose 375px context was never measured", async () => {
    const m = fixture();
    await readyMission(m);
    const state = replay(m);
    const visualPackage = packageWithVisual(state, "ui");
    await built(m, visualPackage.id);
    const invocation = await invoke(m, visualPackage.id, {
      files: [{ status: "M", path: "src/app/events/page.tsx" }],
    });
    const rendered = (invocation.contract as ReviewContract).jobs.filter(
      (job: ContractJob) => job.evidence === "rendered",
    );
    expect(rendered.map((job: ContractJob) => job.id)).toEqual([
      "RJ-render-desktop",
      "RJ-render-phone375",
    ]);

    const results = jobResultsFor(invocation.contract as ReviewContract).map((entry) =>
      entry.job_id === "RJ-render-phone375"
        ? {
            ...entry,
            viewports: [
              { label: "phone375", measured_width: 390, measured_height: 844, screenshot: "p.png" },
            ],
          }
        : entry,
    );
    await expect(
      m.raw({
        type: "review-receipt",
        package_id: visualPackage.id,
        receipt: receiptFrom(invocation, {
          job_results: results,
          ux_conformance: {
            mockup_states: ["events filter — desktop", "events filter — measured 375px"],
            comparison_method: "Rendered both live states and compared structure and copy.",
            result: "clear",
          },
        }),
      }),
    ).rejects.toThrow(/measured 390px, not 375px/);
  });

  it("refuses a runtime that did not prove what the contract needs, and a job run without it", async () => {
    const m = fixture();
    await readyMission(m);
    await built(m, NONVISUAL);
    // The fence is at the runtime: a half-provisioned environment never becomes
    // ready, so the reviewer waits rather than reviewing without the database.
    await expect(invoke(m, NONVISUAL, { ready: ["source-read"] })).rejects.toThrow(
      /did not prove them ready[\s\S]*waits for capacity/,
    );

    // And at the receipt, for the case where a runtime went unhealthy after it
    // was proved: a job may not be reported executed in a runtime that never
    // held the capability it needs.
    const state = replay(m);
    const contract = buildPackageReviewContract({
      state,
      packageId: NONVISUAL,
      headSha: SHA,
      files: SERVICE_DIFF,
      rules,
    });
    expect(
      jobResultDefects(
        { result: "clear", job_results: jobResultsFor(contract as ReviewContract) },
        contract as ReviewContract,
        ["source-read"],
      ),
    ).toEqual(
      expect.arrayContaining([expect.stringMatching(/could not have been executed there/)]),
    );
  });

  it("keeps finding-to-job lineage on a blocked receipt", async () => {
    const m = fixture();
    const { packageId, invocation } = await ready(m);
    const jobId = (invocation.contract as ReviewContract).jobs[0].id;
    const blocked = jobResultsFor(invocation.contract as ReviewContract, jobId);
    await expect(
      m.raw({
        type: "review-receipt",
        package_id: packageId,
        receipt: receiptFrom(invocation, {
          result: "blocked",
          job_results: blocked,
          findings: [{ id: "R-001", affected_jobs: [] }],
        }),
      }),
    ).rejects.toThrow(/names the jobs it affects/);

    const state = await m.raw({
      type: "review-receipt",
      package_id: packageId,
      receipt: receiptFrom(invocation, {
        result: "blocked",
        job_results: blocked,
        findings: [{ id: "R-001", affected_jobs: [jobId] }],
      }),
    });
    expect(state.reviewInvocations[invocation.invocationId].disposition).toBe("blocked");
  });
});

describe("the walker's complete job set", () => {
  it("carries every completion criterion the packet names, with stable ids", () => {
    const criteria = completionCriteria(messagingPacket);
    expect(criteria.filter((entry) => entry.id.startsWith("CE-"))).toHaveLength(16);
    expect(criteria[0].id).toBe("CE-001");
    expect(criteria[15].id).toBe("CE-016");
    expect(criteria[0].text).toBe(messagingPacket.completion_evidence[0]);
    expect(criteria.filter((entry) => entry.id.startsWith("WF-"))).toHaveLength(8);

    const contract = buildWalkerContract({
      state: { packet: messagingPacket },
      headSha: SHA,
    });
    expect(contract.jobs).toHaveLength(24);
    expect(contract.scope).toBe("complete");
    expect(contract.capabilities).toEqual(
      expect.arrayContaining(["browser-375", "public-session"]),
    );
  });

  it("refuses a targeted re-walk that names a criterion the packet does not define", () => {
    expect(() =>
      buildWalkerContract({
        state: { packet: messagingPacket },
        headSha: SHA,
        affectedJobIds: ["CE-099"],
      }),
    ).toThrow(/does not define/);
  });

  it("narrows a targeted re-walk to only the affected criteria", () => {
    const contract = buildWalkerContract({
      state: { packet: messagingPacket },
      headSha: SHA,
      affectedJobIds: ["CE-003", "CE-011"],
    });
    expect(contract.jobs.map((job: ContractJob) => job.id)).toEqual(["CE-003", "CE-011"]);
    expect(contract.scope).toBe("targeted-re-walk");
  });

  it("refuses a walk that substitutes a prose summary for the job set", async () => {
    const m = fixture();
    await readyMission(m);
    for (const pkg of plan.packages) {
      await m.raw({ type: "merge-recorded", package_id: pkg.id, sha: SHA, route: "owner" });
    }
    await expect(
      m.raw({
        type: "integrated-review",
        mode: "workflow-walker",
        head_sha: SHA,
        result: "clear",
        jobs_completed:
          "Signed in, drafted a practice, confirmed its audience and took the register.",
        report: "reviews/final-smoke.json",
      }),
    ).rejects.toThrow(/prose summary of completed jobs is no longer accepted/);
  });

  it("refuses a clear walk that omitted criteria", async () => {
    const m = fixture();
    await readyMission(m);
    for (const pkg of plan.packages) {
      await m.raw({ type: "merge-recorded", package_id: pkg.id, sha: SHA, route: "owner" });
    }
    const state = replay(m);
    const contract = buildWalkerContract({ state, headSha: SHA });
    await m.raw({
      type: "review-invocation-requested",
      invocation_id: "inv-walk",
      role: "workflow-walker",
      head_sha: SHA,
      round: 1,
      contract,
      contract_hash: contractHash(contract),
    });
    await m.raw({
      type: "review-runtime-ready",
      invocation_id: "inv-walk",
      role: "workflow-walker",
      runtime_id: "rt-walk01",
      state: "ready",
      lease_slot: "mission-walk-1",
      implementation_slot: "mission-implementation",
      health: healthFor(contract as ReviewContract, SHA),
    });
    await m.raw({
      type: "walker-dispatched",
      invocation_id: "inv-walk",
      agent_id: "walker-fresh-1",
      session_id: "session-walk",
    });
    await expect(
      m.raw({
        type: "integrated-review",
        mode: "workflow-walker",
        head_sha: SHA,
        result: "clear",
        report: "reviews/final-smoke.json",
        invocation_id: "inv-walk",
        runtime_id: "rt-walk01",
        agent_id: "walker-fresh-1",
        contract_hash: contractHash(contract),
        job_results: jobResultsFor(contract as ReviewContract).slice(1),
      }),
    ).rejects.toThrow(/have no result/);
  });

  it("refuses the Lead as the walker, and an implementer of any package", async () => {
    const m = fixture();
    await readyMission(m);
    for (const pkg of plan.packages) {
      await built(m, pkg.id);
      await m.raw({ type: "merge-recorded", package_id: pkg.id, sha: SHA, route: "owner" });
    }
    const state = replay(m);
    const contract = buildWalkerContract({ state, headSha: SHA });
    await m.raw({
      type: "review-invocation-requested",
      invocation_id: "inv-walk",
      role: "workflow-walker",
      head_sha: SHA,
      round: 1,
      contract,
      contract_hash: contractHash(contract),
    });
    await m.raw({
      type: "review-runtime-ready",
      invocation_id: "inv-walk",
      role: "workflow-walker",
      runtime_id: "rt-walk01",
      state: "ready",
      lease_slot: "mission-walk-1",
      implementation_slot: "mission-implementation",
      health: healthFor(contract as ReviewContract, SHA),
    });
    await expect(
      m.raw({
        type: "walker-dispatched",
        invocation_id: "inv-walk",
        agent_id: `worker-${plan.packages[1].id}`,
        session_id: "session-walk",
      }),
    ).rejects.toThrow(/implemented this work/);
  });
});

describe("owner-ready promotion and reclamation", () => {
  async function cleared(m: ReturnType<typeof fixture>) {
    await readyMission(m);
    const state = replay(m);
    const visualPackage = packageWithVisual(state, "ui");
    await built(m, visualPackage.id);
    const invocation = await invoke(m, visualPackage.id, {
      files: [{ status: "M", path: "src/app/events/page.tsx" }],
    });
    await m.raw({
      type: "review-receipt",
      package_id: visualPackage.id,
      receipt: receiptFrom(invocation, {
        ux_conformance: {
          mockup_states: ["events filter — desktop", "events filter — measured 375px"],
          comparison_method: "Rendered both live states and compared structure and copy.",
          result: "clear",
        },
      }),
    });
    return { packageId: visualPackage.id, invocation };
  }

  it("promotes only a machine-cleared exact head, and only at zero owner commands", async () => {
    const m = fixture();
    const { invocation } = await cleared(m);
    await expect(
      m.raw({
        type: "review-runtime-promoted",
        invocation_id: invocation.invocationId,
        environment_id: "env-1",
        url: "http://127.0.0.1:3101",
        review_identity: "review@synthetic.local",
        head_sha: OTHER_SHA,
        owner_commands: 0,
        state_manifest: ["events filter — desktop", "events filter — measured 375px"],
      }),
    ).rejects.toThrow(/serves the exact cleared head/);

    await expect(
      m.raw({
        type: "review-runtime-promoted",
        invocation_id: invocation.invocationId,
        environment_id: "env-1",
        url: "http://127.0.0.1:3101",
        review_identity: "review@synthetic.local",
        head_sha: SHA,
        owner_commands: 1,
        state_manifest: ["events filter — desktop"],
      }),
    ).rejects.toThrow(/zero commands/);

    const state = await m.raw({
      type: "review-runtime-promoted",
      invocation_id: invocation.invocationId,
      environment_id: "env-1",
      url: "http://127.0.0.1:3101",
      review_identity: "review@synthetic.local",
      head_sha: SHA,
      owner_commands: 0,
      state_manifest: ["events filter — desktop", "events filter — measured 375px"],
    });
    expect(state.ownerEnvironments["env-1"].head_sha).toBe(SHA);
  });

  it("refuses to promote from an invocation that never cleared", async () => {
    const m = fixture();
    await readyMission(m);
    const packageId = plan.packages[0].id;
    await built(m, packageId);
    const invocation = await invoke(m, packageId);
    await expect(
      m.raw({
        type: "review-runtime-promoted",
        invocation_id: invocation.invocationId,
        environment_id: "env-1",
        url: "http://127.0.0.1:3101",
        review_identity: "review@synthetic.local",
        head_sha: SHA,
        owner_commands: 0,
        state_manifest: ["desktop"],
      }),
    ).rejects.toThrow(/machine-cleared head/);
  });

  it("refuses to release a runtime whose invocation is still live", async () => {
    const m = fixture();
    await readyMission(m);
    const packageId = plan.packages[0].id;
    await built(m, packageId);
    const invocation = await invoke(m, packageId);
    await expect(
      m.raw({
        type: "review-runtime-released",
        runtime_id: invocation.runtimeId,
        reclamation: {
          runtime_id: invocation.runtimeId,
          lease_slot: "mission-review-1",
          lease_released: true,
          application_stopped: true,
          worktree_clean: true,
          unpushed_commits: 0,
          slot_reusable: true,
          reported_active: false,
        },
      }),
    ).rejects.toThrow(/still dispatched[\s\S]*never reclaims capacity somebody is using/);
  });

  it("refuses a reclamation that destroys unpushed work or leaves the slot held", () => {
    const base = {
      runtime_id: "rt-1",
      lease_slot: "mission-review-1",
      lease_released: true,
      application_stopped: true,
      worktree_clean: true,
      unpushed_commits: 0,
      slot_reusable: true,
      reported_active: false,
    };
    expect(reclamationDefects(base, "rt-1")).toEqual([]);
    expect(reclamationDefects({ ...base, worktree_clean: false }, "rt-1")).toEqual([
      expect.stringMatching(/worktree is dirty/),
    ]);
    expect(reclamationDefects({ ...base, unpushed_commits: 2 }, "rt-1")).toEqual([
      expect.stringMatching(/2 unpushed commit/),
    ]);
    expect(reclamationDefects({ ...base, reported_active: true }, "rt-1")).toEqual([
      expect.stringMatching(/Status still reports/),
    ]);
  });

  it("refuses cleanup of a live invocation or an unpushed checkout in the broker itself", async () => {
    const executors = {
      "inspect-worktree": async () => ({ dirty: false, unpushedCommits: 3 }),
      "stop-application": async () => ({}),
      "release-lease": async () => ({ slot: "mission-review-1" }),
      "remove-worktree": async () => ({}),
      "read-status": async () => ({ active: false }),
    };
    await expect(
      releaseReviewRuntime({
        runtime: { runtime_id: "rt-1" },
        invocation: { invocation_id: "inv-1", disposition: "dispatched" },
        executors,
      }),
    ).rejects.toThrow(/live owning invocation/);
    await expect(
      releaseReviewRuntime({
        runtime: { runtime_id: "rt-1" },
        invocation: { invocation_id: "inv-1", disposition: "completed" },
        executors,
      }),
    ).rejects.toThrow(/3 unpushed commit/);

    const proof = await releaseReviewRuntime({
      runtime: { runtime_id: "rt-1" },
      invocation: { invocation_id: "inv-1", disposition: "completed" },
      executors: {
        ...executors,
        "inspect-worktree": async () => ({ dirty: false, unpushedCommits: 0 }),
      },
    });
    expect(reclamationDefects(proof, "rt-1")).toEqual([]);
  });

  it("asks for a release on every terminal invocation path", async () => {
    const m = fixture();
    await readyMission(m);
    const packageId = plan.packages[0].id;
    await built(m, packageId);
    const invocation = await invoke(m, packageId);
    const abandoned = await m.raw({
      type: "review-invocation-abandoned",
      invocation_id: invocation.invocationId,
      reason: "the reviewer session died without a receipt",
    });
    expect(nextActions(abandoned)).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "release-review-runtime" })]),
    );
  });
});

describe("Mission 4's exact failure shapes", () => {
  it("refuses the LAN-173 shape: the Lead deterministically clearing a fixture change", async () => {
    const m = fixture();
    await readyMission(m);
    const state = replay(m);
    const nonvisual = packageWithVisual(state, "nonvisual");
    await built(m, nonvisual.id);
    const contract = buildPackageReviewContract({
      state: replay(m),
      packageId: nonvisual.id,
      headSha: SHA,
      files: SEED_DIFF,
      rules,
    });
    await m.raw({
      type: "review-invocation-requested",
      invocation_id: "inv-fixture",
      role: "package-reviewer",
      package_id: nonvisual.id,
      head_sha: SHA,
      round: 1,
      changed_files: SEED_DIFF,
      contract,
      contract_hash: contractHash(contract),
    });
    await m.raw({
      type: "review-runtime-ready",
      invocation_id: "inv-fixture",
      role: "package-reviewer",
      package_id: nonvisual.id,
      runtime_id: "rt-fixture",
      state: "ready",
      lease_slot: "mission-review-1",
      implementation_slot: "mission-implementation",
      health: healthFor(contract as ReviewContract, SHA),
    });
    await expect(
      m.raw({
        type: "reviewer-dispatched",
        invocation_id: "inv-fixture",
        package_id: nonvisual.id,
        agent_id: "lead-fixture",
        session_id: "session-lead",
        deterministic: true,
      }),
    ).rejects.toThrow(/Deterministic clearance is refused/);
  });

  it("requires all sixteen completion criteria of a Mission 4-shaped packet", () => {
    const contract = buildWalkerContract({ state: { packet: messagingPacket }, headSha: SHA });
    const ids = contract.jobs.map((job: ContractJob) => job.id);
    for (let index = 1; index <= 16; index += 1) {
      expect(ids).toContain(`CE-${String(index).padStart(3, "0")}`);
    }
    const partial = {
      result: "clear",
      job_results: jobResultsFor(contract as ReviewContract).slice(0, 4),
    };
    expect(jobResultDefects(partial, contract as ReviewContract)).toEqual(
      expect.arrayContaining([expect.stringMatching(/have no result[\s\S]*not a subset/)]),
    );
  });
});

describe("legacy journals", () => {
  it("replays a pre-LAN-179 journal unchanged", () => {
    const legacy = fs
      .readFileSync(
        path.join(__dirname, "fixtures", "mission", "mission-4-shaped-journal.ndjson"),
        "utf8",
      )
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
    const state = reduce(legacy) as MissionState & {
      initialized: boolean;
      eventCount: number;
      reviewRuntimes: Record<string, unknown>;
    };
    expect(state.initialized).toBe(true);
    expect(state.eventCount).toBe(legacy.length);
    // The new projections exist and are empty; nothing invents an invocation for
    // work that was already done.
    expect(state.reviewInvocations).toEqual({});
    expect(state.reviewRuntimes).toEqual({});
    expect(state.ownerEnvironments).toEqual({});
  });
});
