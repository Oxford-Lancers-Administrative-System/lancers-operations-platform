/**
 * The guarded autonomous merge gate for mission work.
 *
 * Two layers share this module. The Mission Lead runs the full gate locally,
 * where the journal is ground truth: review receipts, visual approval, open
 * owner questions, risk class and migration ownership are all read from
 * durable mission state (`journalConjuncts`). The mission-merge workflow then
 * re-derives every server-verifiable conjunct from evidence
 * (`evaluateMissionGate`): base branch, fork, mergeability, the prohibited-
 * path scan of the real diff, required checks green at the exact head SHA,
 * and the coherence of the receipt the Lead published into the PR body.
 *
 * The shape is the fast-lane gate's, deliberately: `merge` starts as nothing
 * and is returned as `reasons.length === 0`, never assigned true, so a
 * condition nobody wrote cannot be the one that lets a merge through. Where
 * this gate differs from the fast lane — trusting a Lead-authored receipt for
 * facts whose ground truth is machine-local — is a bounded, documented
 * decision (docs/adr/0027), and the tripwire below narrows it: a receipt that
 * claims nonvisual work while the diff touches a visual surface is refused on
 * evidence, not on trust.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { globToRegExp } from "../fast-lane/classify.mjs";
import { requiredChecksPassed } from "../fast-lane/gate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The checked-in rules. The workflow reads the base branch's copy. */
export const RULES_PATH = path.join(repoRoot, ".github", "mission-merge-rules.json");

export function loadRules(file = RULES_PATH) {
  return JSON.parse(readFileSync(file, "utf8"));
}

const matches = (glob, file) => globToRegExp(glob).test(file);

/**
 * Every prohibited path in the diff. A rename is judged on both names. An
 * empty diff is refused — there is nothing to merge, so nothing merges.
 */
export function prohibitedPaths(files, rules) {
  const reasons = [];
  if (!Array.isArray(files) || files.length === 0) {
    return ["The diff is empty. There is nothing to merge."];
  }
  for (const entry of files) {
    for (const candidate of [entry.previousPath, entry.path].filter(Boolean)) {
      for (const rule of rules.prohibited) {
        if (matches(rule.path, candidate)) {
          reasons.push(`${candidate}: prohibited surface (rule \`${rule.path}\`) — ${rule.reason}`);
        }
      }
    }
  }
  return reasons;
}

/** Whether any changed path is a visual surface the owner judges. */
export function touchesVisualSurface(files, rules) {
  return (files ?? []).some((entry) =>
    [entry.previousPath, entry.path]
      .filter(Boolean)
      .some((candidate) => rules.visualSurfaces.some((glob) => matches(glob, candidate))),
  );
}

/**
 * The mission-merge receipt the Lead publishes into the PR body: a fenced
 * block whose info string names it. Absent, duplicated ambiguously, or
 * unparseable all mean no receipt — and no receipt is a refusal.
 */
export function extractReceipt(body, rules) {
  const fence = new RegExp(
    "```" + rules.receiptBlockInfo + "\\s*\\n([\\s\\S]*?)\\n```",
    "g",
  );
  const found = [...(body ?? "").matchAll(fence)];
  if (found.length !== 1) return null;
  try {
    return JSON.parse(found[0][1]);
  } catch {
    return null;
  }
}

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

/** The receipt fields the workflow requires before it trusts anything else. */
export function receiptDefects(receipt) {
  const defects = [];
  if (!receipt) return ["No mission-merge receipt block was found in the pull request body."];
  if (!isNonEmptyString(receipt.mission_id)) defects.push("Receipt is missing mission_id.");
  if (!isNonEmptyString(receipt.package_id)) defects.push("Receipt is missing package_id.");
  if (!isNonEmptyString(receipt.linear_issue_id)) defects.push("Receipt is missing linear_issue_id.");
  if (!["low", "normal"].includes(receipt.risk_class)) {
    defects.push(
      `Receipt risk_class is "${receipt.risk_class ?? "absent"}". Only low and normal risk may travel this lane; highest risk is owner-merged in v1.`,
    );
  }
  if (receipt.review_mode !== "full" && receipt.review_mode !== "correction") {
    defects.push("Receipt review_mode must be full or correction.");
  }
  if (!/^[0-9a-f]{40}$/.test(receipt.full_review_sha ?? "")) {
    defects.push("Receipt full_review_sha must be a full 40-character SHA.");
  }
  if (!/^[0-9a-f]{40}$/.test(receipt.reviewed_head_sha ?? "")) {
    defects.push("Receipt reviewed_head_sha must be a full 40-character SHA.");
  }
  if (receipt.review_result !== "clear") {
    defects.push(`Receipt review_result is "${receipt.review_result ?? "absent"}", not "clear".`);
  }
  if (!["approved", "nonvisual"].includes(receipt.visual)) {
    defects.push('Receipt visual must be "approved" or "nonvisual".');
  }
  if (receipt.open_owner_questions !== 0) {
    defects.push("Receipt must state open_owner_questions: 0 for the affected package.");
  }
  return defects;
}

/**
 * The server-verifiable gate, run by the mission-merge workflow from the base
 * branch against evidence it gathered itself.
 *
 * @param {{ pullRequest: object|null, checkRuns: object[], files: Array<{status: string, path: string, previousPath?: string}>, rules: object }} input
 * @returns {{ merge: boolean, reasons: string[], receipt: object|null }}
 */
export function evaluateMissionGate({ pullRequest: pr, checkRuns, files, rules }) {
  const reasons = [];
  if (!pr) return { merge: false, reasons: ["No pull request was resolved."], receipt: null };

  if ((pr.state ?? "").toUpperCase() !== "OPEN") {
    reasons.push(`Pull request is ${pr.state}, not OPEN.`);
  }
  if (pr.baseRefName !== rules.baseBranch) {
    reasons.push(`Pull request targets ${pr.baseRefName}, not ${rules.baseBranch}.`);
  }
  if (pr.isCrossRepository) {
    reasons.push("Pull request comes from a fork. Mission merges are same-repository only.");
  }
  const labels = (pr.labels ?? []).map((label) => (typeof label === "string" ? label : label.name));
  if (!labels.includes(rules.optInLabel)) {
    reasons.push(
      `Pull request is not labelled \`${rules.optInLabel}\`, so no Mission Lead asked for this merge.`,
    );
  }
  if ((pr.mergeable ?? "").toUpperCase() !== "MERGEABLE") {
    reasons.push(
      `GitHub reports mergeable=${pr.mergeable ?? "UNKNOWN"}. Only MERGEABLE proceeds.`,
    );
  }
  if (!pr.headRefOid) {
    reasons.push("Pull request head commit is unknown, so nothing can be tied to it.");
  }

  reasons.push(...prohibitedPaths(files, rules));

  const receipt = extractReceipt(pr.body, rules);
  const defects = receiptDefects(receipt);
  reasons.push(...defects);

  if (defects.length === 0) {
    if (receipt.reviewed_head_sha !== pr.headRefOid) {
      reasons.push(
        `Receipt reviewed_head_sha ${receipt.reviewed_head_sha} does not match the current head ${pr.headRefOid}. The head moved after review; the review is stale.`,
      );
    }
    // The coherence tripwire: the visual claim is checked against the diff,
    // not taken on trust. Mislabelling UI work "nonvisual" is the likely
    // honest failure, and it is caught here mechanically.
    if (receipt.visual === "nonvisual" && touchesVisualSurface(files, rules)) {
      reasons.push(
        "Receipt claims nonvisual work, but the diff touches a visual surface. Visual work merges only with Brian's recorded approval.",
      );
    }
  }

  reasons.push(...requiredChecksPassed(checkRuns, pr.headRefOid, rules));

  return { merge: reasons.length === 0, reasons, receipt };
}

/**
 * The journal-side conjuncts the Mission Lead must satisfy before it may
 * publish a receipt and label the pull request at all. Ground truth for
 * these facts is machine-local durable state; the workflow cannot see it,
 * which is exactly why the Lead checks it first and records what it found.
 */
export function journalConjuncts(state, packageId, headSha) {
  const reasons = [];
  const pkg = state.packages?.[packageId];
  if (!pkg) return [`No planned package ${packageId} in mission state.`];

  if (state.stopped) {
    reasons.push(`The mission is stopped (${state.stopped.reason}); nothing merges.`);
  }
  if (pkg.risk_class === "highest") {
    reasons.push("Highest-risk work cannot autonomous-merge in v1.");
  }
  if (pkg.migration_owner) {
    reasons.push("A migration-owning package is owner-merged, never autonomous.");
  }
  if (pkg.driftStopped) {
    reasons.push(`${packageId} is stopped by source drift; a revised approved packet is required.`);
  }
  if (!pkg.linear_issue_id) {
    reasons.push(`${packageId} has no synchronized Linear issue.`);
  }
  if (!pkg.review || pkg.review.result !== "clear") {
    reasons.push(`${packageId} has no clear review receipt in mission state.`);
  } else if (pkg.review.reviewed_head_sha !== headSha) {
    reasons.push(
      `The clear review in mission state covers ${pkg.review.reviewed_head_sha}, not ${headSha}.`,
    );
  }
  if (pkg.visual !== "nonvisual" && !pkg.visual_approved) {
    reasons.push(`${packageId} is visual work without Brian's recorded visual approval.`);
  }
  for (const question of Object.values(state.questions ?? {})) {
    if (question.status === "open" && question.affected_packages.includes(packageId)) {
      reasons.push(`Unresolved owner question ${question.id} affects ${packageId}.`);
    }
  }
  return reasons;
}
