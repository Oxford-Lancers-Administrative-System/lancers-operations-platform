#!/usr/bin/env node
/**
 * The mission control-plane CLI: the only way state changes.
 *
 * Every subcommand validates against the replayed journal and appends one
 * event, so a Mission Lead cannot hold mission memory in chat — dispatching,
 * receipts, questions, answers, merges and stops all pass through the same
 * validate-then-append path in scripts/mission/lib/state.mjs, and every
 * refusal prints its reasons and exits 1. `status --json` is the resume
 * entry: a fresh Lead reconstructs the mission and its executable frontier
 * from durable state alone.
 *
 * Usage: npm run mission -- <command> [arguments]
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

import {
  appendEvent,
  currentExecutionEpoch,
  dependencyUsable,
  leadLeaseAvailable,
  missionPaths,
  nextActions,
  packageLifecycle,
  liveReviewRuntimes,
  readJournal,
  replayState,
  reviewQueue,
  validateEvent,
} from "./lib/state.mjs";
import { promoteRule, readRules } from "./lib/owner-rules.mjs";
import {
  buildPackageReviewContract,
  buildWalkerContract,
  contractHash,
} from "./lib/review-contract.mjs";
import { provisionReviewRuntime, releaseReviewRuntime } from "./lib/runtime-broker.mjs";
import {
  relinquishImplementationPreflight,
  repositoryExecutors,
} from "./runtime-broker-executors.mjs";
import { deriveChangedFiles, evaluateDraftLift, loadRules } from "./merge-gate.mjs";
import { parseNameStatus } from "../merge/paths.mjs";
import { coordinatorStatus, implementationRecord } from "../lib/local-supabase-coordinator.mjs";

const repoPath = process.cwd();
const finishMissionScript = import.meta.url.startsWith("file:")
  ? path.join(path.dirname(fileURLToPath(import.meta.url)), "finish-mission.mjs")
  : path.join(repoPath, "scripts", "mission", "finish-mission.mjs");
const leadId = process.env.LANCERS_MISSION_LEAD_ID;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function requireNonEmptyFile(file, label) {
  let contents;
  try {
    contents = fs.readFileSync(path.resolve(file), "utf8");
  } catch (error) {
    fail(`${label} file could not be read: ${error.message}`);
  }
  if (!contents.trim()) fail(`${label} file is empty.`);
  return contents;
}

/** `--flag value` pairs and positionals, tiny on purpose. */
function parseArguments(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const name = token.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[name] = true;
      } else {
        flags[name] = next;
        index += 1;
      }
    } else {
      positional.push(token);
    }
  }
  return { flags, positional };
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/** The migration head the coordinator allocates against: how many exist. */
function migrationHeadCount() {
  try {
    return fs
      .readdirSync(path.join(repoPath, "supabase", "migrations"))
      .filter((entry) => entry.endsWith(".sql")).length;
  } catch {
    return 0;
  }
}

/** The coordinator slot the broker just took for this runtime, read back. */
function currentReviewSlot(runtimeId) {
  const record = Object.values(coordinatorStatus(repoPath).slots).find(
    (candidate) => candidate.runtimeId === runtimeId,
  );
  return record?.slot;
}

async function append(missionId, event) {
  try {
    if (event.type !== "mission-init") {
      if (!leadId) fail("LANCERS_MISSION_LEAD_ID must hold this Lead session's stable UUID.");
      const current = replayState(repoPath, missionId);
      if (!leadLeaseAvailable(current, { leadId, pid: process.pid })) {
        fail(`Mission ${missionId} is fenced to another live Lead (${current.lead.lead_id}).`);
      }
    }
    return await appendEvent(repoPath, missionId, event);
  } catch (error) {
    fail(error.message);
    throw error;
  }
}

/** The planned issue group every owner-facing surface prints the same way. */
function renderEpoch(view) {
  if (!view) return ["Execution epoch: none"];
  return [
    `Execution epoch ${view.id}: ${view.complete ? "complete — checkpoint and stop" : "active"}`,
    `- Packages: ${view.package_ids.join(", ")}`,
    `- Complete: ${view.completed_packages.length}/${view.package_ids.length}`,
  ];
}

function openQuestions(state) {
  return Object.values(state.questions).filter((question) => question.status === "open");
}

function checkWithoutAppending(missionId, event, label) {
  const state = replayState(repoPath, missionId);
  const errors = validateEvent({ at: new Date().toISOString(), ...event }, state);
  if (errors.length > 0) fail(`Refused ${event.type}:\n- ${errors.join("\n- ")}`);
  console.log(`${label} is valid; journal unchanged.`);
}

function resourceLine() {
  const leases = Object.values(coordinatorStatus(repoPath).slots).filter(
    (record) => !["released", "stale"].includes(record.state),
  );
  let worktrees = "unknown";
  try {
    worktrees = String(
      execFileSync("git", ["worktree", "list", "--porcelain"], {
        cwd: repoPath,
        encoding: "utf8",
      })
        .split("\n")
        .filter((line) => line.startsWith("worktree ")).length,
    );
  } catch {
    // Reporting remains useful even when this checkout cannot enumerate worktrees.
  }
  const load = os
    .loadavg()
    .map((value) => value.toFixed(1))
    .join("/");
  const slots = leases.map((record) => `${record.slot}:${record.state}`).join(", ") || "none";
  return `- Active stacks: ${leases.length}; leases: ${slots}; worktrees: ${worktrees}; load (1/5/15m): ${load}`;
}

/**
 * The hourly checkpoint, rendered from durable state only. Routine technical
 * status stays in the journal; Brian sees completed work, running work, a
 * numbered owner-question queue, newly learned rules, and the next hour.
 */
export function renderCheckpoint(state, events, options = {}) {
  const since = state.lastCheckpointIndex;
  const window = events.slice(since + 1);
  const lines = [];
  lines.push(`# Mission checkpoint ${state.checkpoints + 1} — ${state.packet.mission_id}`);

  lines.push("", "## Completed since last checkpoint");
  const merged = window.filter((event) => event.type === "merge-recorded");
  const implemented = window.filter(
    (event) => event.type === "worker-receipt" && event.receipt.result === "completed",
  );
  if (merged.length === 0 && implemented.length === 0) lines.push("- None");
  for (const event of merged) {
    lines.push(`- ${event.package_id} merged (${event.route}) at ${event.sha.slice(0, 12)}`);
  }
  for (const event of implemented) {
    lines.push(`- ${event.package_id} implemented and awaiting review/merge`);
  }

  lines.push("", "## Currently running");
  if (state.activeWorkers.length === 0) lines.push("- No active workers");
  for (const worker of state.activeWorkers) {
    lines.push(`- ${worker.package_id} (${worker.kind}, ${worker.worker_id})`);
  }

  lines.push("", "## Need from Brian");
  const queue = openQuestions(state).sort((a, b) =>
    a.classification === b.classification ? 0 : a.classification === "immediate" ? -1 : 1,
  );
  if (queue.length === 0) lines.push("- Nothing — no open owner questions");
  queue.forEach((question, index) => {
    lines.push(
      `${index + 1}. [${question.classification}] ${question.id}: ${question.text} (affects: ${
        question.affected_packages.join(", ") || "none"
      })`,
    );
  });

  lines.push("", "## Rules learned");
  const reusable = window.filter((event) => event.type === "owner-answer" && event.reusable);
  const applied = window.filter((event) => event.type === "rule-applied");
  if (reusable.length === 0 && applied.length === 0) lines.push("- None");
  for (const event of reusable) {
    lines.push(
      `- Answer to ${event.question_id} proposed as a reusable rule — promote it with \`mission promote-rule\` once Brian approves reuse`,
    );
  }
  for (const event of applied) {
    lines.push(`- ${event.rule_id} answered a question without asking (${event.context})`);
  }

  lines.push("", "## Execution epoch");
  if (options.epoch) {
    const epoch = options.epoch;
    lines.push(
      `- ${epoch.id} — ${epoch.complete ? "complete; checkpoint and stop" : "active"}`,
      `- Packages: ${epoch.package_ids.join(", ")}; complete: ${epoch.completed_packages.length}/${epoch.package_ids.length}`,
    );
  } else {
    lines.push("- None");
  }

  lines.push("", "## Next hour");
  const actions = nextActions(state);
  if (actions.length === 0) lines.push("- Nothing executable — mission may be complete");
  for (const action of actions.slice(0, 8)) {
    lines.push(
      `- ${action.action}${action.package_id ? ` ${action.package_id}` : ""}: ${action.detail}`,
    );
  }

  lines.push("", "## Deploy drift");
  if (options.mainCommit && options.deployedCommit) {
    lines.push(
      options.mainCommit === options.deployedCommit
        ? `- Production serves main (${options.deployedCommit.slice(0, 12)})`
        : `- main is at ${options.mainCommit.slice(0, 12)}; production serves ${options.deployedCommit.slice(0, 12)}. Deploy with: gh workflow run deploy.yml`,
    );
  } else {
    lines.push(
      "- Unknown — compare git rev-parse origin/main with the commit reported by /api/health, and deploy with: gh workflow run deploy.yml",
    );
  }

  lines.push(
    "",
    "## Resources",
    options.resourceLine ??
      "- Active stacks: unknown; leases: unknown; worktrees: unknown; load (1/5/15m): unknown",
  );

  return lines.join("\n");
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseArguments(rest);
  // `review`, `walker` and `runtime` lead with a subcommand, so they reassign
  // this from their own argument list.
  let missionId = positional[0];

  switch (command) {
    case "init": {
      if (!missionId || !flags.packet) fail("Usage: mission init <mission-id> --packet <file>");
      if (!leadId) fail("LANCERS_MISSION_LEAD_ID must hold this Lead session's stable UUID.");
      const packet = readJson(flags.packet);
      if (packet.mission_id !== missionId) {
        fail(`The packet is for ${packet.mission_id}, not ${missionId}.`);
      }
      // The fence is part of initialization; no separate heartbeat is needed
      // to establish it (LAN-148).
      await append(missionId, {
        type: "mission-init",
        packet,
        lead_id: leadId,
        pid: process.pid,
      });
      console.log(`Mission ${missionId} initialized from its approved packet.`);
      break;
    }

    case "validate": {
      if (!flags.packet) fail("Usage: mission validate --packet <file>");
      const { validatePacket, validateWorkflowInventory } = await import("./lib/packet.mjs");
      const packet = readJson(flags.packet);
      const defects = validatePacket(packet);
      if (flags.inventory) {
        const inventoryText = fs.readFileSync(flags.inventory, "utf8");
        const inventoryIds = [...inventoryText.matchAll(/^\s*\d+\.\s+`(W[1-9][0-9]*)`\s+—/gm)].map(
          (match) => match[1],
        );
        defects.push(...validateWorkflowInventory(packet, inventoryIds));
      }
      if (defects.length > 0) {
        fail(`Invalid packet:\n- ${defects.join("\n- ")}`);
      }
      if (packet.status !== "approved") {
        fail(
          `The packet is valid but its status is "${packet.status}". A draft or not_ready packet cannot initialize execution; Brian approves it by merging its packet PR.`,
        );
      }
      console.log(
        `Packet ${packet.mission_id} v${packet.packet_version} is valid and approved (baseline ${packet.baseline.commit.slice(0, 12)}).${flags.inventory ? " Frozen workflow inventory matches." : ""} No state was written.`,
      );
      break;
    }

    case "plan": {
      if (!missionId || !flags.packages) fail("Usage: mission plan <mission-id> --packages <file>");
      const { packages, decomposition, removals } = readJson(flags.packages);
      const state = await append(missionId, {
        type: "plan-recorded",
        packages,
        decomposition,
        ...(removals ? { removals } : {}),
      });
      const live = Object.values(state.packages).filter((pkg) => pkg.status !== "removed");
      console.log(
        `Plan recorded: ${live.length} package(s). Nothing durable is created until the decomposition is approved — \`mission approve-plan ${missionId} --by <who> --evidence <where>\`.`,
      );
      break;
    }

    case "approve-plan": {
      if (!missionId || !flags.by || !flags.evidence) {
        fail("Usage: mission approve-plan <mission-id> --by <who> --evidence <where presented>");
      }
      await append(missionId, {
        type: "plan-approved",
        approved_by: flags.by,
        evidence: flags.evidence,
      });
      console.log("Plan approved; Linear synchronization may proceed.");
      break;
    }

    case "defer-dispatch": {
      if (!missionId || !positional[1] || !flags.reason) {
        fail("Usage: mission defer-dispatch <mission-id> <package-id> --reason <why>");
      }
      await append(missionId, {
        type: "dispatch-deferred",
        package_id: positional[1],
        reason: flags.reason,
      });
      console.log(`Recorded why ${positional[1]} waits for a merge the evidence does not require.`);
      break;
    }

    case "preflight": {
      if (!missionId || !flags.detail)
        fail("Usage: mission preflight <mission-id> --detail <what answered>");
      await append(missionId, {
        type: "linear-preflight",
        result: "reachable",
        detail: flags.detail,
      });
      console.log("Linear connectivity preflight recorded.");
      break;
    }

    case "sync-intent": {
      const [, packageId] = positional;
      if (!missionId || !packageId) fail("Usage: mission sync-intent <mission-id> <package-id>");
      await append(missionId, { type: "linear-sync-intent", package_id: packageId });
      console.log(
        `Sync intent recorded for ${packageId}. Create or reconcile the Linear issue, then record the result.`,
      );
      break;
    }

    case "sync-result": {
      const [, packageId, issueId] = positional;
      if (!missionId || !packageId || !issueId) {
        fail("Usage: mission sync-result <mission-id> <package-id> <issue-id>");
      }
      await append(missionId, {
        type: "linear-sync-result",
        package_id: packageId,
        issue_id: issueId,
      });
      console.log(`${packageId} synchronized to ${issueId}.`);
      break;
    }

    case "dispatch": {
      const [, packageId] = positional;
      if (
        !missionId ||
        !packageId ||
        !flags.worker ||
        !flags.worktree ||
        !flags.branch ||
        !flags.brief
      ) {
        fail(
          "Usage: mission dispatch <mission-id> <package-id> --worker <id> --worktree <path> --branch <name> --brief <brief.md>",
        );
      }
      requireNonEmptyFile(flags.brief, "Worker brief");
      // A dependency that is reviewed clean at exactly its recorded head is a
      // usable base — the whole point of LAN-148 §F. The state machine asks the
      // dispatch to record that basis, pinned to the commit it relies on, and
      // without this the Lead's only interface could never satisfy it and every
      // such dispatch waited on Brian's merge after all. Derived from state by
      // default; --dependency-basis <file> overrides for an unusual case.
      const current = replayState(repoPath, missionId);
      const pkg = current.packages[packageId];
      const basis = flags["dependency-basis"]
        ? readJson(flags["dependency-basis"])
        : (pkg?.depends_on ?? [])
            .map((dep) => ({ dep, verdict: dependencyUsable(current, dep) }))
            .filter(({ verdict }) => verdict.usable && verdict.basis === "reviewed-at-head")
            .map(({ dep, verdict }) => ({ package_id: dep, head_sha: verdict.head_sha }));

      await append(missionId, {
        type: "worker-dispatched",
        package_id: packageId,
        worker_id: flags.worker,
        worktree: flags.worktree,
        branch: flags.branch,
        brief_file: path.resolve(flags.brief),
        ...(basis.length > 0 ? { dependency_basis: basis } : {}),
      });
      const standing = basis.map((entry) => `${entry.package_id} at ${entry.head_sha}`).join(", ");
      console.log(
        standing
          ? `Worker ${flags.worker} dispatched on ${packageId}, standing on reviewed ${standing}.`
          : `Worker ${flags.worker} dispatched on ${packageId}.`,
      );
      break;
    }

    case "receipt": {
      const [, packageId] = positional;
      if (!missionId || !packageId || !flags.worker || !flags.receipt) {
        fail(
          "Usage: mission receipt <mission-id> <package-id> --worker <id> --receipt <file> [--check]",
        );
      }
      const event = {
        type: "worker-receipt",
        package_id: packageId,
        worker_id: flags.worker,
        receipt: readJson(flags.receipt),
      };
      if (flags.check === true) {
        checkWithoutAppending(missionId, event, `Receipt for ${packageId}`);
        break;
      }
      await append(missionId, event);
      console.log(`Receipt recorded for ${packageId}.`);
      break;
    }

    case "abandon-worker": {
      const [, packageId] = positional;
      if (!missionId || !packageId || !flags.reason) {
        fail("Usage: mission abandon-worker <mission-id> <package-id> --reason <why>");
      }
      await append(missionId, {
        type: "worker-abandoned",
        package_id: packageId,
        reason: flags.reason,
      });
      console.log(
        `Abandoned worker cleared from ${packageId}; the package may be dispatched again.`,
      );
      break;
    }

    case "correction": {
      const [, packageId] = positional;
      if (!missionId || !packageId || !flags.worker || (!flags.findings && !flags["record-only"])) {
        fail(
          "Usage: mission correction <mission-id> <package-id> --worker <original-worker-id> [--findings R-001,R-002] [--record-only R-003]",
        );
      }
      await append(missionId, {
        type: "correction-dispatched",
        package_id: packageId,
        worker_id: flags.worker,
        finding_ids: flags.findings ? String(flags.findings).split(",").filter(Boolean) : [],
        record_only_finding_ids: flags["record-only"]
          ? String(flags["record-only"]).split(",").filter(Boolean)
          : [],
      });
      console.log(
        `Original worker ${flags.worker} resumed or re-scoped on ${packageId} with review lineage.`,
      );
      break;
    }

    case "pr": {
      const [, packageId, prNumber, headSha] = positional;
      if (!missionId || !packageId || !prNumber || !headSha) {
        fail("Usage: mission pr <mission-id> <package-id> <pr-number> <head-sha>");
      }
      await append(missionId, {
        type: "pr-opened",
        package_id: packageId,
        pr_number: Number(prNumber),
        head_sha: headSha,
      });
      console.log(`PR #${prNumber} recorded for ${packageId} at ${headSha.slice(0, 12)}.`);
      break;
    }

    /**
     * The review invocation surface (LAN-179).
     *
     * `request` classifies and generates; `provision` brokers a runtime;
     * `dispatch` binds a fresh reviewer identity; `receipt` files what that
     * reviewer returned. The Lead never names a port, a lease or a slot, and
     * the legacy `mission review <mission> <package> --receipt` form still
     * works because a package id can never be one of these subcommands.
     */
    case "review":
    case "walker": {
      const walker = command === "walker";
      // `mission review request M-... WP-...` leads with its subcommand, while
      // the original `mission review M-... WP-... --receipt <file>` leads with
      // the mission. Both are accepted: a subcommand name can never be a
      // mission id, so the discrimination is exact.
      const SUBCOMMANDS = ["request", "provision", "dispatch", "status", "abandon", "receipt"];
      const subcommand = SUBCOMMANDS.includes(positional[0])
        ? positional[0]
        : walker
          ? null
          : "receipt";
      const args = SUBCOMMANDS.includes(positional[0]) ? positional.slice(1) : positional;
      missionId = args[0];
      if (!missionId) fail(`Usage: mission ${command} <subcommand> <mission-id> ...`);

      if (subcommand === "request") {
        const state = replayState(repoPath, missionId);
        const head = flags.head;
        if (!/^[0-9a-f]{40}$/.test(head ?? "")) {
          fail(
            `Usage: mission ${command} request <mission-id>${walker ? "" : " <package-id>"} --head <40-char sha> ...`,
          );
        }
        const invocationId = flags.invocation ?? `inv-${crypto.randomUUID().slice(0, 12)}`;
        let event;
        if (walker) {
          const affected = flags.affected
            ? String(flags.affected).split(",").filter(Boolean)
            : undefined;
          const contract = buildWalkerContract({
            state,
            headSha: head,
            affectedJobIds: affected ?? null,
          });
          event = {
            type: "review-invocation-requested",
            invocation_id: invocationId,
            role: "workflow-walker",
            head_sha: head,
            round: contract.round,
            ...(affected ? { affected_job_ids: affected } : {}),
            contract,
            contract_hash: contractHash(contract),
          };
        } else {
          const packageId = args[1];
          if (!packageId) {
            fail(
              "Usage: mission review request <mission-id> <package-id> --head <sha> [--round N] [--finding-ids R-001,R-002]",
            );
          }
          // The diff is read from the repository, never declared. An
          // underivable one classifies as unknown, which produces the maximal
          // contract rather than the emptiest.
          const derived = deriveChangedFiles(repoPath, head);
          const findingIds = flags["finding-ids"]
            ? String(flags["finding-ids"]).split(",").filter(Boolean)
            : [];
          const round = Number(flags.round ?? 1);
          const contract = buildPackageReviewContract({
            state,
            packageId,
            headSha: head,
            round,
            files: derived.files,
            diffSource: derived.source,
            rules: loadRules(),
            findingIds,
          });
          event = {
            type: "review-invocation-requested",
            invocation_id: invocationId,
            role: "package-reviewer",
            package_id: packageId,
            head_sha: head,
            round,
            changed_files: derived.files,
            diff_source: derived.source,
            diff_basis: derived.detail,
            ...(findingIds.length > 0 ? { finding_ids: findingIds } : {}),
            contract,
            contract_hash: contractHash(contract),
          };
        }
        if (flags.check === true) {
          checkWithoutAppending(missionId, event, `Review request ${invocationId}`);
          break;
        }
        await append(missionId, event);
        console.log(
          JSON.stringify(
            {
              invocation_id: invocationId,
              role: event.role,
              diff_source: event.diff_source ?? "n/a",
              capabilities: event.contract.capabilities,
              jobs: event.contract.jobs.map((entry) => entry.id),
              reviewer_required: event.contract.reviewer_required,
              contract_hash: event.contract_hash,
            },
            null,
            2,
          ),
        );
        break;
      }

      if (subcommand === "provision") {
        if (!flags.invocation)
          fail(`Usage: mission ${command} provision <mission-id> --invocation <id> [--attempt N]`);
        const state = replayState(repoPath, missionId);
        const invocation = state.reviewInvocations[flags.invocation];
        if (!invocation) fail(`No invocation ${flags.invocation}.`);
        const pkg = invocation.package_id ? state.packages[invocation.package_id] : null;
        if (!flags.outcome && pkg && pkg.visual !== "nonvisual") {
          await relinquishImplementationPreflight({
            repoPath,
            missionId,
            packageWorktree: pkg.worktree,
            packageIssueId: pkg.linear_issue_id,
            activeImplementationWorkers: state.activeWorkers.length > 0,
          });
        }
        const registry = coordinatorStatus(repoPath);
        const stack = implementationRecord(registry, missionId);
        // `--outcome` records a broker run that already happened. It is how a
        // rehearsal proves these decisions without Docker, and how a retry
        // files an outcome the broker produced in a previous invocation of this
        // command. The health receipt is validated either way.
        const outcome = flags.outcome
          ? readJson(flags.outcome)
          : await provisionReviewRuntime({
              invocationId: invocation.invocation_id,
              role: invocation.role,
              missionId,
              headSha: invocation.head_sha,
              capabilities: invocation.contract.capabilities,
              attempt: Number(flags.attempt ?? 1),
              registry,
              liveRuntimes: liveReviewRuntimes(state).map((runtime) => runtime.runtime_id),
              executors: repositoryExecutors({
                repoPath,
                missionId,
                baseCommit: invocation.head_sha,
                migrationHead: migrationHeadCount(),
              }),
            });
        await append(missionId, {
          type: "review-runtime-ready",
          invocation_id: invocation.invocation_id,
          role: invocation.role,
          ...(invocation.package_id ? { package_id: invocation.package_id } : {}),
          runtime_id: outcome.runtime_id,
          state: outcome.state,
          reason: outcome.reason,
          health: outcome.health,
          lease_slot: outcome.lease_slot ?? currentReviewSlot(outcome.runtime_id),
          implementation_slot: outcome.implementation_slot ?? stack?.slot ?? null,
        });
        console.log(JSON.stringify(outcome, null, 2));
        if (outcome.state !== "ready") process.exitCode = 2;
        break;
      }

      if (subcommand === "dispatch") {
        if (!flags.invocation || !flags.agent || !flags.session) {
          fail(
            `Usage: mission ${command} dispatch <mission-id> --invocation <id> --agent <fresh agent id> --session <session id> [--deterministic]`,
          );
        }
        const dispatching = replayState(repoPath, missionId).reviewInvocations[flags.invocation];
        await append(missionId, {
          type: walker ? "walker-dispatched" : "reviewer-dispatched",
          invocation_id: flags.invocation,
          ...(dispatching?.package_id ? { package_id: dispatching.package_id } : {}),
          agent_id: flags.agent,
          session_id: flags.session,
          ...(flags.deterministic === true ? { deterministic: true } : {}),
        });
        console.log(
          `${walker ? "Walker" : "Reviewer"} ${flags.agent} dispatched against ${flags.invocation}.`,
        );
        break;
      }

      if (subcommand === "abandon") {
        if (!flags.invocation || !flags.reason) {
          fail(`Usage: mission ${command} abandon <mission-id> --invocation <id> --reason <why>`);
        }
        await append(missionId, {
          type: "review-invocation-abandoned",
          invocation_id: flags.invocation,
          reason: flags.reason,
        });
        console.log(`Invocation ${flags.invocation} abandoned; a fresh one may be requested.`);
        break;
      }

      if (subcommand === "status") {
        const state = replayState(repoPath, missionId);
        const invocations = flags.invocation
          ? [state.reviewInvocations[flags.invocation]].filter(Boolean)
          : Object.values(state.reviewInvocations);
        console.log(
          JSON.stringify(
            {
              invocations,
              queue: reviewQueue(state),
              runtimes: Object.values(state.reviewRuntimes),
              owner_environments: Object.values(state.ownerEnvironments),
            },
            null,
            2,
          ),
        );
        break;
      }

      if (walker) {
        // `mission walker receipt` files the integrated review the dispatched
        // walker returned. The complete job set lives in the receipt; there is
        // no prose substitute for it.
        const file = flags.file ?? flags.receipt;
        if (!file)
          fail("Usage: mission walker receipt <mission-id> --file <integrated-review.json>");
        const payload = readJson(file);
        requireNonEmptyFile(payload.report, "Integrated review report");
        const event = { ...payload, type: "integrated-review", mode: "workflow-walker" };
        if (flags.check === true) {
          checkWithoutAppending(missionId, event, "Integrated walk");
          break;
        }
        await append(missionId, event);
        console.log(`Integrated walk recorded at ${payload.head_sha}: ${payload.result}.`);
        break;
      }

      const packageId = args[1];
      const file = flags.file ?? flags.receipt;
      if (!packageId || !file) {
        fail(
          "Usage: mission review receipt <mission-id> <package-id> --file <review.json> [--check]",
        );
      }
      const receipt = readJson(file);
      if (["security-tier", "package-gate"].includes(receipt.review_mode)) {
        requireNonEmptyFile(receipt.report, "Package-gate review report");
      }
      const event = { type: "review-receipt", package_id: packageId, receipt };
      if (flags.check === true) {
        checkWithoutAppending(missionId, event, `Review receipt for ${packageId}`);
        break;
      }
      await append(missionId, event);
      console.log(`Review receipt recorded for ${packageId}.`);
      break;
    }

    /**
     * Runtime ownership belongs to the broker, not to the Lead's memory.
     * `cleanup-stale` is the path that runs without anybody remembering: it
     * releases every runtime whose invocation is finished and refuses any whose
     * checkout holds work that was never pushed.
     */
    case "runtime": {
      const [subcommand, runtimeMissionId] = positional;
      missionId = runtimeMissionId;
      if (!missionId)
        fail("Usage: mission runtime <mission-id> <status|release|cleanup-stale|promote>");
      const state = replayState(repoPath, missionId);

      if (subcommand === "promote") {
        for (const required of ["invocation", "environment", "url", "identity", "states"]) {
          if (!flags[required]) {
            fail(
              "Usage: mission runtime promote <mission-id> --invocation <id> --environment <id> --url <url> --identity <fixed review account> --states <manifest file>",
            );
          }
        }
        const invocation = state.reviewInvocations[flags.invocation];
        await append(missionId, {
          type: "review-runtime-promoted",
          invocation_id: flags.invocation,
          package_id: invocation?.package_id,
          environment_id: flags.environment,
          url: flags.url,
          review_identity: flags.identity,
          head_sha: invocation?.head_sha,
          owner_commands: 0,
          state_manifest: readJson(flags.states),
        });
        console.log(
          `${flags.environment} is owner-ready at ${flags.url}. Brian runs no commands; the broker keeps it alive and releases it on his disposition.`,
        );
        break;
      }

      const targets =
        subcommand === "release"
          ? [state.reviewRuntimes[flags.runtime]].filter(Boolean)
          : subcommand === "cleanup-stale"
            ? Object.values(state.reviewRuntimes).filter((runtime) => {
                if (runtime.state === "released") return false;
                const owner = state.reviewInvocations[runtime.invocation_id];
                return !owner || !["requested", "dispatched"].includes(owner.disposition);
              })
            : null;

      if (targets === null) {
        console.log(
          JSON.stringify(
            {
              runtimes: Object.values(state.reviewRuntimes),
              queue: reviewQueue(state),
              live: liveReviewRuntimes(state).map((runtime) => runtime.runtime_id),
              owner_environments: Object.values(state.ownerEnvironments),
            },
            null,
            2,
          ),
        );
        break;
      }
      if (subcommand === "release" && targets.length === 0) {
        fail(`No brokered runtime ${flags.runtime ?? "(unnamed)"}.`);
      }
      const executors = repositoryExecutors({
        repoPath,
        missionId,
        baseCommit: state.packet?.baseline?.commit ?? "0".repeat(40),
        migrationHead: migrationHeadCount(),
      });
      for (const runtime of targets) {
        try {
          const reclamation = await releaseReviewRuntime({
            runtime,
            invocation: state.reviewInvocations[runtime.invocation_id] ?? null,
            executors,
          });
          await append(missionId, {
            type: "review-runtime-released",
            runtime_id: runtime.runtime_id,
            reclamation,
          });
          console.log(`${runtime.runtime_id} released ${reclamation.lease_slot}.`);
        } catch (error) {
          console.warn(`${runtime.runtime_id} was left alone: ${error.message}`);
          process.exitCode = 2;
        }
      }
      break;
    }

    case "visual-approve": {
      const [, packageId] = positional;
      if (!missionId || !packageId || !flags.by || !flags.evidence) {
        fail(
          "Usage: mission visual-approve <mission-id> <package-id> --by Brian --evidence <where>",
        );
      }
      await append(missionId, {
        type: "visual-approval",
        package_id: packageId,
        approved_by: flags.by,
        evidence: flags.evidence,
      });
      console.log(`Visual approval recorded for ${packageId}.`);
      break;
    }

    case "question": {
      if (!missionId || !flags.id || !flags.class || !flags.text || !flags.source) {
        fail(
          "Usage: mission question <mission-id> --id Q-1 --class immediate|hourly --text <t> --source <s> [--affects WP-a,WP-b]",
        );
      }
      await append(missionId, {
        type: "owner-question",
        id: flags.id,
        classification: flags.class,
        text: flags.text,
        source: flags.source,
        affected_packages: flags.affects ? String(flags.affects).split(",").filter(Boolean) : [],
      });
      console.log(`Question ${flags.id} queued (${flags.class}).`);
      break;
    }

    case "answer": {
      const [, questionId] = positional;
      if (!missionId || !questionId || !flags.answer || !flags.by) {
        fail(
          "Usage: mission answer <mission-id> <question-id> --answer <text> --by Brian [--reusable]",
        );
      }
      await append(missionId, {
        type: "owner-answer",
        question_id: questionId,
        answer: flags.answer,
        answered_by: flags.by,
        reusable: flags.reusable === true,
      });
      console.log(
        `Answer persisted for ${questionId}${flags.reusable === true ? " (proposed reusable)" : ""}.`,
      );
      break;
    }

    case "apply-rule": {
      const [, ruleId] = positional;
      if (!missionId || !ruleId || !flags.context) {
        fail("Usage: mission apply-rule <mission-id> <rule-id> --context <what it answered>");
      }
      const registry = readRules(repoPath);
      if (!registry.rules.some((rule) => rule.id === ruleId)) {
        fail(`No approved rule ${ruleId} in the registry.`);
      }
      await append(missionId, { type: "rule-applied", rule_id: ruleId, context: flags.context });
      console.log(`${ruleId} applied without asking Brian.`);
      break;
    }

    case "promote-rule": {
      if (!flags.rule) fail("Usage: mission promote-rule --rule <file>");
      try {
        const rule = await promoteRule(repoPath, readJson(flags.rule));
        console.log(`Rule ${rule.id} recorded in the owner rule registry.`);
      } catch (error) {
        fail(error.message);
      }
      break;
    }

    case "annotate": {
      if (!missionId || flags.event === undefined || !flags.disposition || !flags.reason) {
        fail(
          "Usage: mission annotate <mission-id> --event <zero-based-index> --disposition disputed|corrected --reason <why> [--correction <truth>]",
        );
      }
      await append(missionId, {
        type: "journal-annotation",
        target_event: Number(flags.event),
        disposition: flags.disposition,
        reason: flags.reason,
        ...(flags.correction ? { correction: flags.correction } : {}),
      });
      console.log(
        `Journal event ${flags.event} annotated ${flags.disposition}; the original entry remains append-only.`,
      );
      break;
    }

    case "rules": {
      console.log(JSON.stringify(readRules(repoPath), null, 2));
      break;
    }

    case "merge-record": {
      const [, packageId, prNumber, sha] = positional;
      if (!missionId || !packageId || !prNumber || !sha || !flags.route) {
        fail(
          "Usage: mission merge-record <mission-id> <package-id> <pr-number> <sha> --route guarded-auto|owner",
        );
      }
      await append(missionId, {
        type: "merge-recorded",
        package_id: packageId,
        pr_number: Number(prNumber),
        sha,
        route: flags.route,
        // The validator counts an owner merge the guarded lane could have taken
        // as a harness defect and demands the reason in writing. Without this
        // the reason could not be supplied, so every such merge was unrecordable
        // and the package stayed open in state forever.
        ...(flags.reason ? { owner_route_reason: flags.reason } : {}),
      });
      console.log(`Merge recorded for ${packageId} (${flags.route}).`);
      const reclamation = spawnSync(
        process.execPath,
        [finishMissionScript, missionId, "--package", packageId, "--reclaim-only"],
        { cwd: repoPath, env: process.env, encoding: "utf8" },
      );
      if (reclamation.stdout.trim()) console.log(reclamation.stdout.trim());
      if (reclamation.status !== 0) {
        console.warn(
          reclamation.stderr.trim() ||
            `Automatic reclamation for ${packageId} exited ${reclamation.status}; the package was left alone.`,
        );
      }
      break;
    }

    case "integrated-review": {
      if (!missionId || !flags.mode || !flags.head || !flags.result || !flags.report) {
        fail(
          "Usage: mission integrated-review <mission-id> --mode workflow-walker --head <sha> --result clear|blocked --report <file> --jobs <completed jobs> [--findings <file>]",
        );
      }
      requireNonEmptyFile(flags.report, "Integrated review report");
      await append(missionId, {
        type: "integrated-review",
        mode: flags.mode,
        head_sha: flags.head,
        package_heads: flags["package-heads"] ? readJson(flags["package-heads"]) : undefined,
        result: flags.result,
        ...(flags.jobs ? { jobs_completed: flags.jobs } : {}),
        ...(flags.findings ? { findings: readJson(flags.findings) } : {}),
        ...(flags["sensitive-paths"]
          ? { sensitive_paths: readJson(flags["sensitive-paths"]) }
          : {}),
        report: path.resolve(flags.report),
      });
      console.log(`Integrated ${flags.mode} review recorded at ${flags.head}: ${flags.result}.`);
      break;
    }

    case "closeout": {
      if (!missionId || !flags.payload) {
        fail("Usage: mission closeout <mission-id> --payload <file>");
      }
      const payload = readJson(flags.payload);
      // Spread first: a payload carrying its own `type` or `at` must not
      // decide what event this is.
      const state = await append(missionId, { ...payload, type: "mission-closeout" });
      console.log(
        `Mission ${missionId} closed as ${state.closeout.outcome}. Write this into ${state.closeout.notion_record} — it extends that record; it never creates a Linear planning document or a deferred-findings issue.`,
      );
      break;
    }

    case "checkpoint": {
      if (!missionId)
        fail(
          "Usage: mission checkpoint <mission-id> [--main-commit <sha> --deployed-commit <sha>]",
        );
      const state = replayState(repoPath, missionId);
      const events = readJournal(missionPaths(repoPath, missionId).journal);
      const report = renderCheckpoint(state, events, {
        mainCommit: flags["main-commit"],
        deployedCommit: flags["deployed-commit"],
        resourceLine: resourceLine(),
        epoch: currentExecutionEpoch(state),
      });
      await append(missionId, { type: "checkpoint", number: state.checkpoints + 1 });
      console.log(report);
      break;
    }

    /**
     * May the Lead lift this package's draft? Un-drafting is the last act of
     * the work and the authorization to merge it (LAN-209), so this is the
     * command that decides it: the rule's three conditions, plus green checks
     * at the exact head. The Lead runs `gh pr ready` only on a pass.
     */
    case "gate": {
      const [, packageId] = positional;
      if (!missionId || !packageId || !flags["pr-json"] || !flags["checks-json"] || !flags.files) {
        fail(
          "Usage: mission gate <mission-id> <package-id> --pr-json <file> --checks-json <file> --files <git name-status file>",
        );
      }
      const state = replayState(repoPath, missionId);
      const pullRequest = readJson(flags["pr-json"]);
      const files = parseNameStatus(fs.readFileSync(flags.files, "utf8"));
      const verdict = evaluateDraftLift({
        state,
        packageId,
        pullRequest,
        checkRuns: readJson(flags["checks-json"]),
        files,
        rules: loadRules(),
      });
      if (
        verdict.lift &&
        state.packages[packageId]?.gate_passed?.head_sha !== pullRequest.headRefOid
      ) {
        await append(missionId, {
          type: "package-gate-passed",
          package_id: packageId,
          head_sha: pullRequest.headRefOid,
        });
      } else if (
        !verdict.lift &&
        state.packages[packageId]?.gate_passed?.head_sha === pullRequest.headRefOid
      ) {
        await append(missionId, {
          type: "package-gate-invalidated",
          package_id: packageId,
          head_sha: pullRequest.headRefOid,
          reasons: [...verdict.journal_reasons, ...verdict.evidence_reasons],
        });
      }
      console.log(JSON.stringify(verdict, null, 2));
      break;
    }

    case "heartbeat": {
      if (!missionId) fail("Usage: mission heartbeat <mission-id>");
      await append(missionId, { type: "lead-heartbeat", lead_id: leadId, pid: process.pid });
      console.log("Lead heartbeat recorded.");
      break;
    }

    case "stop": {
      if (!missionId || !flags.reason || !flags.detail) {
        fail(
          "Usage: mission stop <mission-id> --reason usage-exhausted|owner-stop|blocked|phase-boundary --detail <why> [--phase plan-approved]",
        );
      }
      const state = replayState(repoPath, missionId);
      await append(missionId, { type: "checkpoint", number: state.checkpoints + 1 });
      await append(missionId, {
        type: "mission-stopped",
        reason: flags.reason,
        detail: flags.detail,
        ...(flags.phase ? { phase: flags.phase } : {}),
      });
      console.log(
        "Checkpointed and stopped. A fresh Mission Lead resumes with: mission resume " + missionId,
      );
      break;
    }

    case "resume": {
      if (!missionId) fail("Usage: mission resume <mission-id>");
      const state = replayState(repoPath, missionId);
      if (!state.initialized) fail(`No mission ${missionId} exists here.`);
      if (!leadId) fail("LANCERS_MISSION_LEAD_ID must hold this Lead session's stable UUID.");
      if (!leadLeaseAvailable(state, { leadId, pid: process.pid })) {
        fail(
          `Mission Lead pid ${state.lead.pid} still holds this mission (heartbeat ${state.lead.at}). A second live Lead is refused.`,
        );
      }
      const resumed = await append(missionId, {
        type: state.stopped ? "mission-resumed" : "lead-heartbeat",
        lead_id: leadId,
        pid: process.pid,
      });
      const epoch = currentExecutionEpoch(resumed);
      console.error(renderEpoch(epoch).join("\n"));
      const lifecycle = Object.fromEntries(
        Object.values(resumed.packages)
          .map((pkg) => [pkg.id, packageLifecycle(resumed, pkg)])
          .filter(([, status]) => status !== null),
      );
      console.log(
        JSON.stringify(
          { lifecycle, epoch, state: resumed, next_actions: nextActions(resumed) },
          null,
          2,
        ),
      );
      break;
    }

    case "status": {
      if (!missionId) fail("Usage: mission status <mission-id> [--json]");
      const state = replayState(repoPath, missionId);
      const lifecycle = Object.fromEntries(
        Object.values(state.packages)
          .map((pkg) => [pkg.id, packageLifecycle(state, pkg)])
          .filter(([, status]) => status !== null),
      );
      const view = state.initialized ? currentExecutionEpoch(state) : null;
      if (flags.json === true) {
        console.log(
          JSON.stringify(
            { lifecycle, epoch: view, state, next_actions: nextActions(state) },
            null,
            2,
          ),
        );
        break;
      }
      console.log(`Mission ${missionId}: ${state.initialized ? "initialized" : "absent"}`);
      if (state.initialized) console.log(renderEpoch(view).join("\n"));
      for (const pkg of Object.values(state.packages).filter(
        (candidate) => lifecycle[candidate.id],
      )) {
        console.log(
          `- ${pkg.id}: ${lifecycle[pkg.id]}${pkg.linear_issue_id ? ` (${pkg.linear_issue_id})` : ""}`,
        );
      }
      console.log(
        `Open questions: ${openQuestions(state).length}; active workers: ${state.activeWorkers.length}`,
      );
      for (const action of nextActions(state)) {
        console.log(
          `next: ${action.action}${action.package_id ? ` ${action.package_id}` : ""} — ${action.detail}`,
        );
      }
      break;
    }

    default:
      fail(
        `Unknown command "${command ?? ""}". Commands: validate, init, plan, approve-plan, defer-dispatch, integrated-review, closeout, preflight, sync-intent, sync-result, dispatch, receipt, abandon-worker, correction, pr, review, visual-approve, question, answer, apply-rule, promote-rule, annotate, rules, merge-record, checkpoint, review, walker, runtime, heartbeat, stop, resume, status.`,
      );
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => fail(error.message));
}
