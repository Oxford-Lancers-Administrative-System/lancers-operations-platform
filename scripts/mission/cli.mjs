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
  EPOCH_LIMITS,
  appendEvent,
  dependencyUsable,
  deriveEpochDefinition,
  epochView,
  leadLeaseAvailable,
  missionPaths,
  nextActions,
  packageLifecycle,
  readJournal,
  replayState,
  resumeDossier,
  validateEvent,
} from "./lib/state.mjs";
import { EPOCH_EVENT_TYPES } from "./lib/epochs.mjs";
import { promoteRule, readRules } from "./lib/owner-rules.mjs";
import { deriveGitVisualFiles, evaluateProspectiveMissionGate, loadRules } from "./merge-gate.mjs";
import { parseNameStatus } from "../fast-lane/classify.mjs";
import { coordinatorStatus } from "../lib/local-supabase-coordinator.mjs";

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

/**
 * The events a mission that has never adopted a Lead epoch may still record:
 * reading, heartbeating, writing down what Brian decided, and giving resources
 * back. Everything else waits for an epoch, so an existing journal keeps
 * replaying untouched but cannot quietly carry on executing without one.
 */
const EPOCH_EXEMPT_COMMANDS = new Set([
  "mission-init",
  "lead-heartbeat",
  "checkpoint",
  "owner-question",
  "owner-answer",
  "journal-annotation",
  "mission-stopped",
  "mission-resumed",
  "package-reclaimed",
  "mission-finalized",
  "mission-abandoned",
  ...EPOCH_EVENT_TYPES,
]);

async function append(missionId, event) {
  try {
    if (event.type !== "mission-init") {
      if (!leadId) fail("LANCERS_MISSION_LEAD_ID must hold this Lead session's stable UUID.");
      const current = replayState(repoPath, missionId);
      if (!leadLeaseAvailable(current, { leadId, pid: process.pid })) {
        fail(`Mission ${missionId} is fenced to another live Lead (${current.lead.lead_id}).`);
      }
      if (current.initialized && !current.epoch && !EPOCH_EXEMPT_COMMANDS.has(event.type)) {
        fail(
          `Mission ${missionId} has no Lead epoch, so nothing bounds what this Lead may do. An epoch is opened from durable state before mission work: npm run mission -- resume ${missionId}`,
        );
      }
    }
    return await appendEvent(repoPath, missionId, event);
  } catch (error) {
    fail(error.message);
    throw error;
  }
}

/**
 * The host session identity, and an honest label for what it proves.
 *
 * A trustworthy host-provided session UUID is used when one exists. When none
 * does, the fallback is the fresh `LANCERS_MISSION_LEAD_ID` contract plus the
 * one-use token — harness-level fencing and a user-started handshake. A pid is
 * never offered as evidence of a fresh model context, because it is not.
 */
function sessionIdentity() {
  const hosted = process.env.CLAUDE_SESSION_ID || process.env.LANCERS_LEAD_SESSION_ID;
  return hosted
    ? { source: "host-session-id", value: hosted }
    : {
        source: "lead-id-fallback",
        value: leadId,
        proves:
          "A different recorded Lead identity presented a token issued once. This is harness-level fencing plus a user-started fresh-session handshake, not proof of a fresh model context.",
      };
}

function currentHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // A checkout that cannot name its head still opens an epoch; the opening
    // head is evidence when it exists, never a precondition.
    return null;
  }
}

/** Write the generated dossier beside the journal — never into the repository. */
function writeDossier(missionId, state, label) {
  const directory = path.join(missionPaths(repoPath, missionId).missionRoot, "dossiers");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${label}.json`);
  const dossier = resumeDossier(state);
  fs.writeFileSync(file, `${JSON.stringify(dossier, null, 2)}\n`, { mode: 0o600 });
  return { path: file, source_index: dossier.source_event_index, dossier };
}

async function openEpoch(missionId, state, { token, bootstrapped = false } = {}) {
  const derived = deriveEpochDefinition(state);
  const epochId = `E-${state.epochHistory.length + (state.epoch ? 1 : 0) + 1}`;
  const dossier = writeDossier(missionId, state, epochId);
  return append(missionId, {
    type: "lead-epoch-opened",
    epoch_id: epochId,
    mission_id: missionId,
    lead_id: leadId,
    pid: process.pid,
    session_identity: sessionIdentity(),
    opening_head: currentHead(),
    ...derived,
    ...(token === undefined ? {} : { resume_token: token }),
    ...(bootstrapped ? { bootstrapped: true } : {}),
    dossier: dossier.path,
    dossier_source_index: dossier.source_index,
  });
}

async function closeEpoch(missionId, state, reason) {
  const view = epochView(state);
  const dossier = writeDossier(missionId, state, `${view.epoch_id}-closed`);
  const token = crypto.randomUUID();
  const closed = await append(missionId, {
    type: "lead-epoch-closed",
    reason,
    resume_token: token,
    dossier: dossier.path,
    dossier_source_index: dossier.source_index,
  });
  return { state: closed, token, dossier: dossier.path };
}

/** The epoch block every owner-facing surface prints the same way. */
function renderEpoch(view) {
  if (!view) {
    return ["Lead epoch: none — the next mutating resume bootstraps one from durable state."];
  }
  const lines = [
    `Lead epoch ${view.epoch_id}: ${view.phase} (${view.status}), held by ${view.lead_id}`,
    `- Scope: ${view.scope?.packages?.length ? view.scope.packages.join(", ") : (view.scope?.gate ?? "none")}`,
    `- Exit condition: ${view.exit_condition}`,
    `- Health: ${view.health.color}${view.health.reasons.length > 0 ? ` — ${view.health.reasons.map((reason) => reason.code).join(", ")}` : ""}`,
  ];
  for (const reason of view.health.reasons) {
    lines.push(
      `  · ${reason.code}${reason.event_index === null ? "" : ` (event ${reason.event_index})`}: ${reason.detail}`,
    );
  }
  for (const entry of view.health.unknown) {
    lines.push(`  · ${entry.signal}: unknown — ${entry.detail}`);
  }
  if (view.boundary_reason) lines.push(`- Boundary: ${view.boundary_reason}`);
  if (view.extension) {
    lines.push(
      `- Owner extension by ${view.extension.approved_by} expires ${view.extension.expires_at}`,
    );
  }
  lines.push(`- Adjustments used: ${view.adjustments_used}/${view.adjustment_budget}`);
  if (view.status !== "open") {
    lines.push(
      `- Next derived epoch: ${view.next.phase}${view.next.scope?.packages?.length ? ` over ${view.next.scope.packages.join(", ")}` : ""}`,
    );
  }
  return lines;
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

  lines.push("", "## Lead epoch");
  if (options.epoch) {
    const epoch = options.epoch;
    lines.push(
      `- ${epoch.epoch_id} — ${epoch.phase} (${epoch.status}), health ${epoch.health.color}${epoch.health.reasons.length > 0 ? ` (${epoch.health.reasons.map((reason) => reason.code).join(", ")})` : ""}`,
      `- Scope: ${epoch.scope?.packages?.length ? epoch.scope.packages.join(", ") : (epoch.scope?.gate ?? "none")}; exit: ${epoch.exit_condition}`,
    );
    if (epoch.boundary_reason) lines.push(`- Boundary: ${epoch.boundary_reason}`);
  } else {
    lines.push("- None — the next mutating resume bootstraps one from durable state.");
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
  const missionId = positional[0];

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
      const initialized = await append(missionId, {
        type: "mission-init",
        packet,
        lead_id: leadId,
        pid: process.pid,
      });
      // Initialization opens the planning epoch in the same breath, so there is
      // never a window in which a Lead is unbounded (LAN-178).
      const opened = await openEpoch(missionId, initialized);
      console.log(`Mission ${missionId} initialized from its approved packet.`);
      console.log(renderEpoch(epochView(opened)).join("\n"));
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

    case "review": {
      const [, packageId] = positional;
      if (!missionId || !packageId || !flags.receipt) {
        fail("Usage: mission review <mission-id> <package-id> --receipt <file> [--check]");
      }
      const receipt = readJson(flags.receipt);
      if (["security-tier", "package-gate"].includes(receipt.review_mode)) {
        requireNonEmptyFile(receipt.report, "Package-gate review report");
      }
      const event = {
        type: "review-receipt",
        package_id: packageId,
        receipt,
      };
      if (flags.check === true) {
        checkWithoutAppending(missionId, event, `Review receipt for ${packageId}`);
        break;
      }
      await append(missionId, event);
      console.log(`Review receipt recorded for ${packageId}.`);
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
        epoch: epochView(state),
      });
      await append(missionId, { type: "checkpoint", number: state.checkpoints + 1 });
      console.log(report);
      break;
    }

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
      const verdict = evaluateProspectiveMissionGate({
        state,
        packageId,
        pullRequest,
        checkRuns: readJson(flags["checks-json"]),
        files,
        rules: loadRules(),
        deriveVisualFiles: (fromSha, toSha, currentHead) =>
          deriveGitVisualFiles(repoPath, fromSha, toSha, currentHead),
      });
      if (
        verdict.merge &&
        state.packages[packageId]?.gate_passed?.head_sha !== pullRequest.headRefOid
      ) {
        await append(missionId, {
          type: "package-gate-passed",
          package_id: packageId,
          head_sha: pullRequest.headRefOid,
          receipt: verdict.receipt,
        });
      } else if (
        !verdict.merge &&
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

    case "epoch": {
      const [subcommand, epochMission] = positional;
      if (!subcommand || !epochMission) {
        fail("Usage: mission epoch status|close|boundary|drain|adjust <mission-id> [options]");
      }
      const state = replayState(repoPath, epochMission);
      if (!state.initialized) fail(`No mission ${epochMission} exists here.`);
      const view = epochView(state);

      if (subcommand === "status") {
        if (flags.json === true) {
          console.log(JSON.stringify({ epoch: view, next_actions: nextActions(state) }, null, 2));
          break;
        }
        console.log(renderEpoch(view).join("\n"));
        for (const action of nextActions(state)) {
          console.log(
            `next: ${action.action}${action.package_id ? ` ${action.package_id}` : ""} — ${action.detail}`,
          );
        }
        break;
      }

      if (!view) {
        fail(
          `Mission ${epochMission} has no Lead epoch yet. npm run mission -- resume ${epochMission} bootstraps one from durable state.`,
        );
      }

      switch (subcommand) {
        case "boundary": {
          if (!flags.reason)
            fail("Usage: mission epoch boundary <mission-id> --reason <what was met>");
          await append(epochMission, {
            type: "lead-epoch-boundary-reached",
            reason: flags.reason,
          });
          console.log(
            `Lead epoch ${view.epoch_id} is at its boundary. It may drain already-active in-scope work; it starts nothing new.`,
          );
          break;
        }

        case "drain": {
          const packages = flags.packages
            ? String(flags.packages).split(",").filter(Boolean)
            : state.activeWorkers
                .map((worker) => worker.package_id)
                .filter((id) => (view.scope?.packages ?? []).includes(id));
          await append(epochMission, { type: "lead-epoch-draining", packages });
          console.log(
            `Draining ${packages.join(", ") || "no active work"}. Completion evidence for exactly that work is accepted; every new dispatch is refused.`,
          );
          break;
        }

        case "close": {
          const { token, dossier } = await closeEpoch(
            epochMission,
            state,
            flags.reason ||
              `The ${view.phase} epoch reached its boundary and handed the mission on.`,
          );
          console.log(
            [
              `Lead epoch ${view.epoch_id} is closed. It never reopens.`,
              `Resume dossier: ${dossier}`,
              "",
              "Start a NEW session, give it a fresh LANCERS_MISSION_LEAD_ID, and run:",
              `  npm run mission -- resume ${epochMission} --token ${token}`,
              "",
              "The token is one use. The same Lead identity cannot resume its own closed epoch.",
            ].join("\n"),
          );
          break;
        }

        case "adjust": {
          const extending = flags["extend-current"] === true;
          const recutting = flags["recut-future"] === true;
          if (extending === recutting) {
            fail(
              "Usage: mission epoch adjust <mission-id> --extend-current | --recut-future (exactly one)",
            );
          }
          if (!flags.by || !flags.authorization || !flags.reason) {
            fail(
              "An epoch adjustment records --by <who>, --authorization <Brian's own words or durable evidence> and --reason <why>. The agent may propose; only an explicit owner message authorizes filing.",
            );
          }
          const health = {
            color: view.health.color,
            reason_codes: view.health.reasons.map((reason) => reason.code),
          };
          if (extending) {
            if (!flags.package && !flags.correction) {
              fail(
                "extend-current adds one adjacent eligible package (--package WP-x) or finishes one already-active correction cycle (--correction WP-x).",
              );
            }
            const before = view.scope?.packages ?? [];
            const packages = flags.package ? [...before, String(flags.package)] : before;
            await append(epochMission, {
              type: "lead-epoch-adjusted",
              kind: "extend-current",
              source_epoch_id: view.epoch_id,
              target_epoch_id: view.epoch_id,
              old_scope: view.scope,
              new_scope: { ...view.scope, packages },
              old_exit_condition: view.exit_condition,
              new_exit_condition: flags.correction
                ? `The active correction cycle on ${flags.correction} is finished and ${packages.join(" and ")} ${packages.length === 1 ? "has" : "have"} merged to main.`
                : `${packages.join(" and ")} ${packages.length === 1 ? "has" : "have"} merged to main.`,
              health,
              accepted_reason_codes: flags["accept-risk"]
                ? String(flags["accept-risk"]).split(",").filter(Boolean)
                : [],
              approved_by: flags.by,
              authorization: flags.authorization,
              reason: flags.reason,
              limit: {
                added_packages: flags.package ? 1 : 0,
                correction_cycles: flags.correction ? 1 : 0,
                expires_after_hours: EPOCH_LIMITS.extensionMs / 3_600_000,
              },
              ...(flags.correction ? { correction_package_id: String(flags.correction) } : {}),
              expires_at: new Date(Date.now() + EPOCH_LIMITS.extensionMs).toISOString(),
            });
            console.log(
              `Epoch ${view.epoch_id} extended by ${flags.by} at ${health.color}. It expires when the named work stabilizes or in ${EPOCH_LIMITS.extensionMs / 3_600_000} hours, and this epoch has no further extension.`,
            );
            break;
          }
          if (!flags.waves) {
            fail(
              "recut-future takes --waves <file>, a JSON array of package-id arrays describing the proposed future waves.",
            );
          }
          await append(epochMission, {
            type: "lead-epoch-adjusted",
            kind: "recut-future",
            source_epoch_id: view.epoch_id,
            target_epoch_id: null,
            old_scope: view.scope,
            new_scope: view.scope,
            old_exit_condition: view.exit_condition,
            new_exit_condition: view.exit_condition,
            future_waves: readJson(flags.waves),
            health,
            approved_by: flags.by,
            authorization: flags.authorization,
            reason: flags.reason,
            limit: { future_grouping_only: true },
          });
          console.log(
            "Future waves re-cut. The current epoch is unchanged and keeps its extension budget; the approved packages, requirements, dependency DAG and acceptance criteria are untouched.",
          );
          break;
        }

        default:
          fail(
            `Unknown epoch subcommand "${subcommand}". Use status, close, boundary, drain or adjust.`,
          );
      }
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
      let resumed = state.stopped
        ? await append(missionId, {
            type: "mission-resumed",
            lead_id: leadId,
            pid: process.pid,
          })
        : state;
      const held = resumed.epoch ? epochView(resumed) : null;
      if (!held) {
        // An existing journal adopts epochs here, prospectively. Nothing in its
        // history is rewritten and no epoch is invented for work already done.
        resumed = await openEpoch(missionId, resumed, { bootstrapped: true });
      } else if (held.status === "closed") {
        if (!flags.token) {
          fail(
            `Lead epoch ${held.epoch_id} is closed. Present the one-use token it issued: npm run mission -- resume ${missionId} --token <token>`,
          );
        }
        resumed = await openEpoch(missionId, resumed, { token: String(flags.token) });
      } else if (held.lead_id === leadId) {
        resumed = await append(missionId, {
          type: "lead-heartbeat",
          lead_id: leadId,
          pid: process.pid,
        });
      } else {
        // A different Lead, and the lease checked out above: the recorded Lead
        // is gone. Its epoch closes as lost — not as finished — and the fresh
        // Lead opens the next one the harness derives.
        const { state: after } = await closeEpoch(
          missionId,
          resumed,
          `Lead ${held.lead_id} did not return; its lease expired and a fresh Lead resumed.`,
        );
        resumed = await openEpoch(missionId, after, { token: after.resumeToken.token });
      }
      const view = epochView(resumed);
      console.error(renderEpoch(view).join("\n"));
      if (view?.dossier) console.error(`- Resume dossier: ${view.dossier}`);
      const lifecycle = Object.fromEntries(
        Object.values(resumed.packages)
          .map((pkg) => [pkg.id, packageLifecycle(resumed, pkg)])
          .filter(([, status]) => status !== null),
      );
      console.log(
        JSON.stringify(
          { lifecycle, epoch: view, state: resumed, next_actions: nextActions(resumed) },
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
      const view = state.initialized ? epochView(state) : null;
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
        `Unknown command "${command ?? ""}". Commands: validate, init, plan, approve-plan, defer-dispatch, integrated-review, closeout, preflight, sync-intent, sync-result, dispatch, receipt, abandon-worker, correction, pr, review, visual-approve, question, answer, apply-rule, promote-rule, annotate, rules, merge-record, checkpoint, epoch, heartbeat, stop, resume, status.`,
      );
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => fail(error.message));
}
