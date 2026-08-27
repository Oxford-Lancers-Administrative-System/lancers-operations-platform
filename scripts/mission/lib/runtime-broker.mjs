/**
 * The runtime broker: who owns a reviewer's or walker's local environment.
 *
 * LAN-179. In Mission 4 the Mission Lead owned this. It chose ports, negotiated
 * leases, rescued environments that had lost their owner, and — when none of
 * that worked — decided which proof a review could do without. Three of the
 * mission's five packages cleared on evidence that had been narrowed by an
 * infrastructure problem rather than by a judgement about the code.
 *
 * The broker takes that decision away from the Lead. A Lead asks for a
 * capability profile; the broker allocates a review-purpose coordinator slot
 * that is never the mission's shared implementation stack, prepares it at the
 * exact head, proves it healthy, and gives back an immutable receipt. When no
 * capacity is free the answer is `waiting-for-capacity` — an infrastructure
 * state, distinct from a review result, which the state machine refuses to
 * convert into a clearance.
 *
 * The pure functions here decide; the two async ones perform, through injected
 * executors so a rehearsal proves the same decisions without Docker.
 */

import crypto from "node:crypto";

import { REVIEW_CAPABILITIES } from "./review-contract.mjs";

/**
 * The states a brokered runtime can hold.
 *
 * These are infrastructure states. They deliberately share no vocabulary with
 * `clear` and `blocked`: the whole defect this replaces was a missing runtime
 * arriving at the journal wearing a review verdict.
 */
export const RUNTIME_STATES = [
  "ready",
  "waiting-for-capacity",
  "provisioning-failed",
  "unhealthy",
  "abandoned",
  "released",
];

/** The states from which no reviewer may be dispatched. */
export const NON_DISPATCHABLE_RUNTIME_STATES = RUNTIME_STATES.filter((state) => state !== "ready");

/** Coordinator records carrying this purpose are review runtimes, never the stack. */
export const REVIEW_LEASE_PURPOSE = "review";
export const IMPLEMENTATION_LEASE_PURPOSE = "implementation";

/** How many review runtimes one mission may hold at once. */
export const MAX_CONCURRENT_REVIEW_RUNTIMES = 2;

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

/**
 * A runtime identity bound to one invocation attempt.
 *
 * Derived, not random, so a retry after a provisioning failure produces a
 * different id and a resumed Lead cannot reuse the failed one by accident.
 */
/** @param {string} invocationId @param {number} [attempt] */
export function newRuntimeId(invocationId, attempt = 1) {
  const digest = crypto
    .createHash("sha256")
    .update(`${invocationId}#${attempt}`)
    .digest("hex")
    .slice(0, 10);
  return `rt-${digest}`;
}

/**
 * The provisioning steps, in order, for one capability profile.
 *
 * This list is the broker's contract with itself: the executable path runs
 * exactly these, and the health receipt is checked against the capabilities
 * they claim to deliver. A capability with no step here cannot become ready.
 */
/** @param {string[]} capabilities */
export function provisionPlan(capabilities) {
  const wanted = new Set(capabilities ?? []);
  const steps = [
    { step: "attach-worktree", provides: ["source-read"] },
    { step: "prove-no-destructive-reuse", provides: [] },
  ];
  if (wanted.has("dependencies"))
    steps.push({ step: "install-dependencies", provides: ["dependencies"] });
  if (wanted.has("database")) steps.push({ step: "start-database", provides: ["database"] });
  if (wanted.has("database-reset-seed")) {
    steps.push({ step: "reset-and-seed", provides: ["database-reset-seed"] });
  }
  if (wanted.has("application"))
    steps.push({ step: "start-application", provides: ["application"] });
  if (wanted.has("operator-session")) {
    steps.push({ step: "prepare-operator-session", provides: ["operator-session"] });
  }
  if (wanted.has("public-session")) {
    steps.push({ step: "prepare-public-context", provides: ["public-session"] });
  }
  if (wanted.has("browser-desktop")) {
    steps.push({ step: "prepare-desktop-browser", provides: ["browser-desktop"] });
  }
  if (wanted.has("browser-375")) {
    steps.push({ step: "prepare-375-browser", provides: ["browser-375"] });
  }
  if (wanted.has("transport-seam")) {
    steps.push({ step: "arm-local-transport", provides: ["transport-seam"] });
  }
  steps.push({ step: "prove-health", provides: [] });
  return steps;
}

/**
 * Whether this mission may take another review runtime right now.
 *
 * Capacity is refused, never borrowed: the mission's implementation stack is
 * excluded by construction, so a busy review slot can only ever produce a
 * queued invocation.
 */
/**
 * @param {{ registry: Record<string, any>, missionId: string, liveRuntimes?: string[],
 *   maxConcurrent?: number }} input
 */
export function capacityVerdict({
  registry,
  missionId,
  liveRuntimes = [],
  maxConcurrent = MAX_CONCURRENT_REVIEW_RUNTIMES,
}) {
  if (liveRuntimes.length >= maxConcurrent) {
    return {
      state: "waiting-for-capacity",
      reason: `This mission already holds ${liveRuntimes.length} review runtime(s) (${liveRuntimes.join(", ")}); at most ${maxConcurrent} run at once. The invocation keeps its identity and contract and waits.`,
    };
  }
  const slots = Object.values(registry?.slots ?? {});
  const implementation = slots.find(
    (record) =>
      record.missionId === missionId &&
      (record.purpose ?? IMPLEMENTATION_LEASE_PURPOSE) === IMPLEMENTATION_LEASE_PURPOSE &&
      !["released", "stale"].includes(record.state),
  );
  return { state: "ready", reason: null, implementationSlot: implementation?.slot ?? null };
}

/**
 * Why this health receipt does not prove the runtime the contract asked for.
 *
 * `capabilities_ready` is the load-bearing field: a job may only be executed in
 * a runtime that proved the capabilities the job requires, and the state machine
 * compares the two sets. A receipt that claims a capability the plan has no step
 * for is refused rather than believed.
 */
/**
 * @param {Record<string, any> | null} health
 * @param {{ capabilities?: string[], headSha?: string | null }} [expectation]
 * @returns {string[]}
 */
export function healthDefects(health, { capabilities = [], headSha = null } = {}) {
  if (health === null || typeof health !== "object" || Array.isArray(health)) {
    return ["A runtime records a structured health receipt."];
  }
  const defects = [];
  if (headSha && health.head_sha !== headSha) {
    defects.push(
      `The runtime proved itself healthy at ${health.head_sha ?? "no head"}, not at the invocation's head ${headSha}.`,
    );
  }
  const ready = Array.isArray(health.capabilities_ready) ? health.capabilities_ready : null;
  if (!ready) {
    defects.push("A runtime records `capabilities_ready`: the capabilities it actually proved.");
    return defects;
  }
  const unknown = ready.filter((capability) => !REVIEW_CAPABILITIES.includes(capability));
  if (unknown.length > 0) {
    defects.push(`${unknown.join(", ")} is not a capability this harness can provide.`);
  }
  const provided = new Set(provisionPlan(capabilities).flatMap((step) => step.provides));
  const unprovisioned = ready.filter(
    (capability) => !provided.has(capability) && REVIEW_CAPABILITIES.includes(capability),
  );
  if (unprovisioned.length > 0) {
    defects.push(
      `${unprovisioned.join(", ")} is reported ready but no provisioning step supplies it for this profile.`,
    );
  }
  const missing = (capabilities ?? []).filter((capability) => !ready.includes(capability));
  if (missing.length > 0) {
    defects.push(
      `The contract requires ${missing.join(", ")}; the runtime did not prove ${missing.length === 1 ? "it" : "them"} ready. A reviewer waits for capacity rather than reviewing without it.`,
    );
  }
  if (capabilities.includes("database") && health.database !== true) {
    defects.push("The runtime did not prove its local database answering.");
  }
  if (capabilities.includes("application")) {
    if (health.application !== true)
      defects.push("The runtime did not prove its application answering.");
    if (health.auth !== true) defects.push("The runtime did not prove its Auth service answering.");
    if (!isNonEmptyString(health.url)) defects.push("The runtime records the URL it serves.");
  }
  if (capabilities.includes("database-reset-seed")) {
    const scenarios = Array.isArray(health.scenarios) ? health.scenarios : [];
    if (scenarios.length === 0 || !scenarios.every(isNonEmptyString)) {
      defects.push(
        "The runtime records the synthetic scenario identifiers it loaded. A missing seed state is an unready runtime, never a job the reviewer may skip.",
      );
    }
  }
  return defects;
}

/**
 * The facts a release has to establish before capacity is called reusable.
 *
 * Every one of these was a way the first live mission leaked or destroyed
 * something: a lease nobody released, an application still holding a port, a
 * worktree with unpushed work reclaimed as debris, and a status page that went
 * on reporting a resource that was gone.
 */
export const RECLAMATION_FIELDS = [
  "runtime_id",
  "lease_slot",
  "lease_released",
  "application_stopped",
  "worktree_clean",
  "unpushed_commits",
  "slot_reusable",
  "reported_active",
];

/**
 * @param {Record<string, any> | null} proof
 * @param {string} [runtimeId]
 * @returns {string[]}
 */
export function reclamationDefects(proof, runtimeId) {
  if (proof === null || typeof proof !== "object" || Array.isArray(proof)) {
    return ["Releasing a runtime records a structured reclamation proof."];
  }
  const defects = [];
  for (const field of RECLAMATION_FIELDS) {
    if (proof[field] === undefined) defects.push(`Reclamation proof is missing \`${field}\`.`);
  }
  if (runtimeId && proof.runtime_id !== runtimeId) {
    defects.push(
      `Reclamation proof names runtime ${proof.runtime_id ?? "nothing"}, not the released ${runtimeId}.`,
    );
  }
  if (!isNonEmptyString(proof.lease_slot)) {
    defects.push("Reclamation proof names the exact coordinator slot it released.");
  }
  if (proof.lease_released !== true) defects.push("The lease was not released.");
  if (proof.application_stopped !== true) defects.push("The application process was not stopped.");
  if (proof.slot_reusable !== true) defects.push("The slot is not reusable.");
  if (proof.reported_active !== false) {
    defects.push("Status still reports this runtime active; reclamation is not proved.");
  }
  if (proof.worktree_clean !== true) {
    defects.push(
      "The runtime's worktree is dirty. Nothing reclaims work that was never pushed; leave it and record the runtime abandoned instead.",
    );
  }
  if (!Number.isInteger(proof.unpushed_commits) || proof.unpushed_commits !== 0) {
    defects.push(
      `The runtime's branch holds ${proof.unpushed_commits ?? "an unknown number of"} unpushed commit(s); reclamation would destroy them.`,
    );
  }
  return defects;
}

/**
 * Prepare one review runtime.
 *
 * Everything that touches the machine arrives as an executor, so this function
 * is the same decision procedure in a rehearsal and in a real mission. A step
 * that throws leaves `provisioning-failed` with the partial resources named, so
 * the caller cleans exactly what was created and keeps the invocation retryable.
 */
/**
 * @param {{ invocationId: string, role: string, missionId: string, headSha: string,
 *   capabilities: string[], attempt?: number, registry: Record<string, any>,
 *   liveRuntimes?: string[], executors: Record<string, (input: any) => any> }} input
 */
export async function provisionReviewRuntime({
  invocationId,
  role,
  missionId,
  headSha,
  capabilities,
  attempt = 1,
  registry,
  liveRuntimes = [],
  executors,
}) {
  const runtimeId = newRuntimeId(invocationId, attempt);
  const capacity = capacityVerdict({ registry, missionId, liveRuntimes });
  if (capacity.state !== "ready") {
    return {
      runtime_id: runtimeId,
      invocation_id: invocationId,
      role,
      state: "waiting-for-capacity",
      reason: capacity.reason,
      health: null,
      completed_steps: [],
    };
  }

  const plan = provisionPlan(capabilities);
  const completed = [];
  const ready = new Set();
  try {
    for (const { step, provides } of plan) {
      const outcome = await executors[step]({
        runtimeId,
        invocationId,
        missionId,
        role,
        headSha,
        capabilities,
        implementationSlot: capacity.implementationSlot,
        ready: [...ready],
      });
      completed.push({ step, detail: outcome?.detail ?? null });
      for (const capability of provides) ready.add(capability);
      if (outcome?.health) {
        const defects = healthDefects(outcome.health, { capabilities, headSha });
        if (defects.length > 0) {
          return {
            runtime_id: runtimeId,
            invocation_id: invocationId,
            role,
            state: "unhealthy",
            reason: defects.join(" "),
            health: outcome.health,
            completed_steps: completed,
          };
        }
        return {
          runtime_id: runtimeId,
          invocation_id: invocationId,
          role,
          state: "ready",
          reason: null,
          health: outcome.health,
          completed_steps: completed,
        };
      }
    }
    return {
      runtime_id: runtimeId,
      invocation_id: invocationId,
      role,
      state: "provisioning-failed",
      reason: "The provisioning plan finished without a health receipt.",
      health: null,
      completed_steps: completed,
    };
  } catch (error) {
    return {
      runtime_id: runtimeId,
      invocation_id: invocationId,
      role,
      state: "provisioning-failed",
      reason: error.message,
      health: null,
      completed_steps: completed,
    };
  }
}

/**
 * Give one runtime back, and prove it.
 *
 * Refuses before it acts when the runtime still has a live owning invocation or
 * its worktree holds work that was never pushed — the two cases where automatic
 * reclamation would destroy something rather than tidy it.
 */
/**
 * @param {{ runtime: Record<string, any>, invocation?: Record<string, any> | null,
 *   executors: Record<string, (input: any) => any> }} input
 */
export async function releaseReviewRuntime({ runtime, invocation = null, executors }) {
  if (invocation && !["completed", "abandoned", "blocked"].includes(invocation.disposition ?? "")) {
    throw new Error(
      `Runtime ${runtime.runtime_id} still has a live owning invocation (${invocation.invocation_id}); cleanup never reclaims a runtime somebody is using.`,
    );
  }
  const worktree = await executors["inspect-worktree"]({ runtimeId: runtime.runtime_id });
  if (worktree.dirty || worktree.unpushedCommits > 0) {
    throw new Error(
      `Runtime ${runtime.runtime_id} holds ${worktree.dirty ? "uncommitted changes" : `${worktree.unpushedCommits} unpushed commit(s)`}; refusing to reclaim work that would be destroyed.`,
    );
  }
  await executors["stop-application"]({ runtimeId: runtime.runtime_id });
  const lease = await executors["release-lease"]({ runtimeId: runtime.runtime_id });
  await executors["remove-worktree"]({ runtimeId: runtime.runtime_id });
  const reported = await executors["read-status"]({ runtimeId: runtime.runtime_id });
  return {
    runtime_id: runtime.runtime_id,
    lease_slot: lease.slot,
    lease_released: true,
    application_stopped: true,
    worktree_clean: true,
    unpushed_commits: 0,
    slot_reusable: true,
    reported_active: Boolean(reported?.active),
  };
}
