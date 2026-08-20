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

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  appendEvent,
  leadLeaseAvailable,
  missionPaths,
  nextActions,
  readJournal,
  replayState,
} from "./lib/state.mjs";
import { promoteRule, readRules } from "./lib/owner-rules.mjs";
import { evaluateMissionGate, journalConjuncts, loadRules } from "./merge-gate.mjs";
import { parseNameStatus } from "../fast-lane/classify.mjs";

const repoPath = process.cwd();
const leadId = process.env.LANCERS_MISSION_LEAD_ID;

function fail(message) {
  console.error(message);
  process.exit(1);
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

function openQuestions(state) {
  return Object.values(state.questions).filter((question) => question.status === "open");
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
      await append(missionId, { type: "mission-init", packet });
      await appendEvent(repoPath, missionId, {
        type: "lead-heartbeat",
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
      const { packages } = readJson(flags.packages);
      const state = await append(missionId, { type: "plan-recorded", packages });
      console.log(`Plan recorded: ${Object.keys(state.packages).length} package(s).`);
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
      if (!missionId || !packageId || !flags.worker || !flags.worktree || !flags.branch) {
        fail(
          "Usage: mission dispatch <mission-id> <package-id> --worker <id> --worktree <path> --branch <name>",
        );
      }
      await append(missionId, {
        type: "worker-dispatched",
        package_id: packageId,
        worker_id: flags.worker,
        worktree: flags.worktree,
        branch: flags.branch,
      });
      console.log(`Worker ${flags.worker} dispatched on ${packageId}.`);
      break;
    }

    case "receipt": {
      const [, packageId] = positional;
      if (!missionId || !packageId || !flags.worker || !flags.receipt) {
        fail("Usage: mission receipt <mission-id> <package-id> --worker <id> --receipt <file>");
      }
      await append(missionId, {
        type: "worker-receipt",
        package_id: packageId,
        worker_id: flags.worker,
        receipt: readJson(flags.receipt),
      });
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
      if (!missionId || !packageId || !flags.worker || !flags.findings) {
        fail(
          "Usage: mission correction <mission-id> <package-id> --worker <original-worker-id> --findings R-001,R-002",
        );
      }
      await append(missionId, {
        type: "correction-dispatched",
        package_id: packageId,
        worker_id: flags.worker,
        finding_ids: String(flags.findings).split(",").filter(Boolean),
      });
      console.log(`Original worker ${flags.worker} resumed on ${packageId} with review lineage.`);
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
        fail("Usage: mission review <mission-id> <package-id> --receipt <file>");
      }
      await append(missionId, {
        type: "review-receipt",
        package_id: packageId,
        receipt: readJson(flags.receipt),
      });
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
      });
      console.log(`Merge recorded for ${packageId} (${flags.route}).`);
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
      const local = journalConjuncts(state, packageId, pullRequest.headRefOid, {
        files,
        rules: loadRules(),
      });
      const server = evaluateMissionGate({
        pullRequest,
        checkRuns: readJson(flags["checks-json"]),
        files,
        rules: loadRules(),
      });
      const verdict = {
        merge: local.length === 0 && server.merge,
        journal_reasons: local,
        evidence_reasons: server.reasons,
      };
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
          "Usage: mission stop <mission-id> --reason usage-exhausted|owner-stop|blocked --detail <why>",
        );
      }
      const state = replayState(repoPath, missionId);
      await append(missionId, { type: "checkpoint", number: state.checkpoints + 1 });
      await append(missionId, {
        type: "mission-stopped",
        reason: flags.reason,
        detail: flags.detail,
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
      const resumed = state.stopped
        ? await append(missionId, {
            type: "mission-resumed",
            lead_id: leadId,
            pid: process.pid,
          })
        : await append(missionId, { type: "lead-heartbeat", lead_id: leadId, pid: process.pid });
      console.log(JSON.stringify({ state: resumed, next_actions: nextActions(resumed) }, null, 2));
      break;
    }

    case "status": {
      if (!missionId) fail("Usage: mission status <mission-id> [--json]");
      const state = replayState(repoPath, missionId);
      if (flags.json === true) {
        console.log(JSON.stringify({ state, next_actions: nextActions(state) }, null, 2));
        break;
      }
      console.log(`Mission ${missionId}: ${state.initialized ? "initialized" : "absent"}`);
      for (const pkg of Object.values(state.packages)) {
        console.log(
          `- ${pkg.id}: ${pkg.status}${pkg.linear_issue_id ? ` (${pkg.linear_issue_id})` : ""}`,
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
        `Unknown command "${command ?? ""}". Commands: validate, init, plan, preflight, sync-intent, sync-result, dispatch, receipt, abandon-worker, correction, pr, review, visual-approve, question, answer, apply-rule, promote-rule, rules, merge-record, checkpoint, heartbeat, stop, resume, status.`,
      );
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => fail(error.message));
}
