/**
 * Drive the LAN-179 review-invocation lifecycle for a test that is about
 * something else.
 *
 * Since LAN-179 a review receipt or an integrated walk is refused unless the
 * harness opened an invocation, the broker proved a runtime, and a fresh
 * reviewer was dispatched against it. That fence has its own suite. Every other
 * mission test — concurrency, merges, epochs, approval carry-forward — needs a
 * package to reach `reviewed` without restating four events each time, so this
 * wraps `appendEvent` and performs those four events for real before letting the
 * receipt through.
 *
 * It performs the real events; it never bypasses the validator. When the
 * invocation itself is refused — a merged package, an epoch that permits no
 * evidence — the refusal is swallowed and the caller's own append produces the
 * refusal that test is asserting.
 */

import fs from "node:fs";
import path from "node:path";

import {
  buildPackageReviewContract,
  buildWalkerContract,
  contractHash,
} from "../../scripts/mission/lib/review-contract.mjs";
import { replayState } from "../../scripts/mission/lib/state.mjs";
import { deriveChangedFiles } from "../../scripts/mission/merge-gate.mjs";
import type { MissionState } from "../../scripts/mission/lib/state.mjs";
import type { ReviewContract, ContractJob } from "../../scripts/mission/lib/review-contract.mjs";

type Append<T> = (event: Record<string, unknown>) => Promise<T>;

export type { MissionState, ReviewContract, ContractJob };

const replay = (repo: string, missionId: string, env: NodeJS.ProcessEnv): MissionState =>
  replayState(repo, missionId, env);

type Receipt = Record<string, unknown> & {
  result?: string;
  round?: number;
  reviewed_head_sha?: string;
  findings?: unknown;
  blocking_finding_ids?: string[];
};

/**
 * The diff the harness will derive for this head, asked the same way
 * `prepareJournalEvent` asks. Since LAN-179 round 1 the journalled contract is
 * generated from the repository rather than from a declared list, so a helper
 * that guessed would simply produce a hash the validator refuses.
 */
function derivedDiff(repo: string, headSha: string) {
  return deriveChangedFiles(repo, headSha) as {
    files: { status: string; path: string }[];
    source: "derived" | "unknown";
  };
}

const VIEWPORTS = [
  { label: "desktop", measured_width: 1440, measured_height: 900, screenshot: "desktop.png" },
  { label: "phone375", measured_width: 375, measured_height: 812, screenshot: "phone375.png" },
];

/** One honest-looking result per contract job, so set equality is satisfied. */
export function jobResultsFor(contract: ReviewContract, blockedJobId: string | null = null) {
  return contract.jobs.map((job) => ({
    job_id: job.id,
    result: job.id === blockedJobId ? "block" : "pass",
    executed: `Ran ${job.id} in the brokered runtime.`,
    assertion_result:
      job.id === blockedJobId ? "The assertion did not hold." : "The assertion held.",
    evidence: `reviews/${job.id}.log`,
    evidence_kind: job.evidence,
    scenarios: ["synthetic-scenario-1"],
    ...(job.evidence === "rendered" ? { viewports: VIEWPORTS } : {}),
  }));
}

/**
 * Findings carry a stable id and the jobs they affect, because a targeted
 * re-walk is derived from exactly that lineage. Existing cases pass plain
 * strings, so those are normalized rather than rejected here.
 */
function structuredFindings(existing: unknown, blockedJobId: string | null, fallbackId: string) {
  const affected = blockedJobId ? [blockedJobId] : [];
  const entries: unknown[] =
    Array.isArray(existing) && existing.length > 0 ? existing : [fallbackId];
  return entries.map((entry, index) => {
    if (typeof entry === "string") return { id: entry, affected_jobs: affected };
    const record = (entry ?? {}) as Record<string, unknown>;
    return {
      id: (record.id as string) ?? `${fallbackId}-${index}`,
      ...record,
      affected_jobs: (record.affected_jobs as string[]) ?? affected,
    };
  });
}

export function healthFor(contract: ReviewContract, headSha: string) {
  return {
    head_sha: headSha,
    checked_at: new Date(1_700_000_000_000).toISOString(),
    url: "http://127.0.0.1:3101",
    database: true,
    auth: true,
    application: true,
    scenarios: ["synthetic-scenario-1"],
    capabilities_ready: contract.capabilities,
  };
}

/**
 * Wrap a fixture's `append` so review receipts and integrated walks carry a real
 * invocation. Returns the wrapped append; the caller keeps using it unchanged.
 */
export function withReviewInvocations<T>(
  repo: string,
  missionId: string,
  env: NodeJS.ProcessEnv,
  append: Append<T>,
): Append<T> {
  let sequence = 0;

  const openPackageInvocation = async (packageId: string, receipt: Receipt) => {
    const state = replay(repo, missionId, env);
    const pkg = state.packages?.[packageId];
    if (!pkg) return;
    const headSha = (receipt.reviewed_head_sha ?? pkg.head_sha) as string;
    const derived = derivedDiff(repo, headSha);
    const contract = buildPackageReviewContract({
      state,
      packageId,
      headSha,
      round: receipt.round ?? 1,
      files: derived.files,
      diffSource: derived.source,
    }) as ReviewContract;
    sequence += 1;
    const invocationId = `inv-${packageId}-${sequence}`;
    await append({
      type: "review-invocation-requested",
      invocation_id: invocationId,
      role: "package-reviewer",
      package_id: packageId,
      head_sha: headSha,
      round: receipt.round ?? 1,
      changed_files: derived.files,
      diff_source: derived.source,
      contract,
      contract_hash: contractHash(contract),
    });
    const runtimeId = `rt-${sequence.toString(16).padStart(6, "0")}`;
    await append({
      type: "review-runtime-ready",
      invocation_id: invocationId,
      role: "package-reviewer",
      package_id: packageId,
      runtime_id: runtimeId,
      state: "ready",
      lease_slot: `mission-review-${sequence}`,
      implementation_slot: "mission-implementation",
      health: healthFor(contract, headSha),
    });
    const agentId = `reviewer-${sequence}`;
    await append({
      type: "reviewer-dispatched",
      invocation_id: invocationId,
      package_id: packageId,
      agent_id: agentId,
      session_id: `session-${sequence}`,
    });
    const blockedJobId = receipt.result === "blocked" ? (contract.jobs[0]?.id ?? null) : null;
    Object.assign(receipt, {
      invocation_id: invocationId,
      runtime_id: runtimeId,
      agent_id: agentId,
      contract_hash: contractHash(contract),
      job_results: jobResultsFor(contract, blockedJobId),
      ...(receipt.result === "blocked"
        ? {
            findings: structuredFindings(
              receipt.findings ?? receipt.blocking_finding_ids,
              blockedJobId,
              "R-001",
            ),
          }
        : {}),
    });
  };

  const openWalkerInvocation = async (event: Record<string, unknown>) => {
    const state = replay(repo, missionId, env);
    const contract = buildWalkerContract({
      state,
      headSha: event.head_sha as string,
      affectedJobIds: null,
    }) as ReviewContract;
    sequence += 1;
    const invocationId = `inv-walk-${sequence}`;
    await append({
      type: "review-invocation-requested",
      invocation_id: invocationId,
      role: "workflow-walker",
      head_sha: event.head_sha,
      round: 1,
      contract,
      contract_hash: contractHash(contract),
    });
    const runtimeId = `rt-walk-${sequence.toString(16).padStart(4, "0")}`;
    await append({
      type: "review-runtime-ready",
      invocation_id: invocationId,
      role: "workflow-walker",
      runtime_id: runtimeId,
      state: "ready",
      lease_slot: `mission-walk-${sequence}`,
      implementation_slot: "mission-implementation",
      health: healthFor(contract, event.head_sha as string),
    });
    const agentId = `walker-${sequence}`;
    await append({
      type: "walker-dispatched",
      invocation_id: invocationId,
      agent_id: agentId,
      session_id: `session-walk-${sequence}`,
    });
    const blockedJobId = event.result === "blocked" ? (contract.jobs[0]?.id ?? null) : null;
    Object.assign(event, {
      invocation_id: invocationId,
      runtime_id: runtimeId,
      agent_id: agentId,
      contract_hash: contractHash(contract),
      job_results: jobResultsFor(contract, blockedJobId),
      ...(event.result === "blocked"
        ? { findings: structuredFindings(event.findings, blockedJobId, "W-001") }
        : {}),
    });
  };

  return async (event) => {
    const typed = event as Record<string, unknown> & { receipt?: Receipt };
    let opened: string | null = null;
    try {
      if (typed.type === "review-receipt" && typed.receipt && !typed.receipt.invocation_id) {
        await openPackageInvocation(typed.package_id as string, typed.receipt);
        opened = (typed.receipt.invocation_id as string) ?? null;
      } else if (
        typed.type === "integrated-review" &&
        typed.mode === "workflow-walker" &&
        !typed.invocation_id
      ) {
        await openWalkerInvocation(typed);
        opened = (typed.invocation_id as string) ?? null;
      }
    } catch {
      // The invocation itself was refused. Let the caller's append produce the
      // refusal the test is actually asserting.
    }
    try {
      return await append(event);
    } catch (error) {
      // The receipt was refused, so the invocation this helper opened for it
      // owes nothing. Abandon it rather than leaving a phantom dispatch that
      // would change the frontier the case goes on to assert.
      if (opened) {
        await append({
          type: "review-invocation-abandoned",
          invocation_id: opened,
          reason: "The receipt this invocation was opened for was refused.",
        }).catch(() => undefined);
      }
      throw error;
    }
  };
}

type Run = (...args: string[]) => { status: number | null; stdout: string; stderr: string };

/**
 * The same lifecycle, driven through the real CLI.
 *
 * `provision --outcome` files a broker outcome the caller supplies, which is
 * how a rehearsal proves the runtime decisions without starting Docker. The
 * request, the dispatch and the receipt all go through the ordinary commands.
 */
export function cliReviewFlow(
  run: Run,
  repo: string,
  missionId: string,
  packageId: string,
  headSha: string,
  options: {
    visual?: string;
    round?: number;
    sequence?: number;
    agentId?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const sequence = options.sequence ?? 1;
  const requested = run(
    "review",
    "request",
    missionId,
    packageId,
    "--head",
    headSha,
    "--round",
    String(options.round ?? 1),
  );
  if (requested.status !== 0) throw new Error(requested.stderr || requested.stdout);
  const invocationId = JSON.parse(requested.stdout).invocation_id as string;

  const state = replay(repo, missionId, options.env ?? process.env);
  const contract = state.reviewInvocations[invocationId].contract as ReviewContract;
  const runtimeId = `rt-cli${sequence.toString(16).padStart(6, "0")}`;
  const outcomePath = path.join(repo, `broker-outcome-${sequence}.json`);
  fs.writeFileSync(
    outcomePath,
    JSON.stringify({
      runtime_id: runtimeId,
      invocation_id: invocationId,
      role: "package-reviewer",
      state: "ready",
      reason: null,
      health: healthFor(contract, headSha),
      lease_slot: `mission-review-${sequence}`,
      implementation_slot: "mission-implementation",
    }),
  );
  const provisioned = run(
    "review",
    "provision",
    missionId,
    "--invocation",
    invocationId,
    "--outcome",
    outcomePath,
  );
  if (provisioned.status !== 0) throw new Error(provisioned.stderr || provisioned.stdout);

  const agentId = options.agentId ?? `reviewer-cli-${sequence}`;
  const dispatched = run(
    "review",
    "dispatch",
    missionId,
    "--invocation",
    invocationId,
    "--agent",
    agentId,
    "--session",
    `session-cli-${sequence}`,
  );
  if (dispatched.status !== 0) throw new Error(dispatched.stderr || dispatched.stdout);

  return {
    invocation_id: invocationId,
    runtime_id: runtimeId,
    agent_id: agentId,
    contract_hash: contractHash(contract),
    contract,
    job_results: jobResultsFor(contract),
  };
}
