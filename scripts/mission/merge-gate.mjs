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
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { globToRegExp, parseNameStatus } from "../fast-lane/classify.mjs";
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
 * The shared visual-surface classifier. Journal carry-forward and the hosted
 * merge gate both call this function, so a Lead cannot use a looser definition
 * of "non-rendered" than the workflow uses for its coherence tripwire.
 */
export function classifyVisualDelta(files, rules) {
  return {
    verdict: touchesVisualSurface(files, rules) ? "rendered" : "non-rendered",
    files: (files ?? []).map(({ status, path: file, previousPath }) => ({
      status,
      path: file,
      ...(previousPath ? { previousPath } : {}),
    })),
  };
}

/**
 * Re-derive one carry-forward link from Git objects without checking out or
 * executing either commit. Both endpoints must be on the current head's
 * ancestry chain; a receipt cannot cite an unrelated benign diff.
 */
export function deriveGitVisualFiles(repoPath, fromSha, toSha, currentHead) {
  for (const [label, sha] of Object.entries({ fromSha, toSha, currentHead })) {
    if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error(`${label} is not a full SHA.`);
  }
  execFileSync("git", ["merge-base", "--is-ancestor", fromSha, toSha], {
    cwd: repoPath,
    stdio: "ignore",
  });
  execFileSync("git", ["merge-base", "--is-ancestor", toSha, currentHead], {
    cwd: repoPath,
    stdio: "ignore",
  });
  return parseNameStatus(
    execFileSync("git", ["diff", "--name-status", fromSha, toSha, "--"], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
}

function canonicalFiles(files) {
  return [...(files ?? [])]
    .map(({ status, path: file, previousPath }) => ({
      status,
      path: file,
      ...(previousPath ? { previousPath } : {}),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function visualCarryForwardDefects(evidence, currentHead, rules, deriveVisualFiles) {
  if (evidence === undefined) return [];
  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
    return ["Receipt visual_evidence must be an object when approval is carried forward."];
  }
  const defects = [];
  const approved = evidence.approved_sha;
  const chain = evidence.carry_forward_chain;
  if (!/^[0-9a-f]{40}$/.test(approved ?? "")) {
    defects.push("Receipt visual_evidence.approved_sha must be a full 40-character SHA.");
  }
  if (!Array.isArray(chain) || chain.length === 0) {
    defects.push("Receipt visual_evidence carries a non-empty carry_forward_chain.");
    return defects;
  }
  if (typeof deriveVisualFiles !== "function") {
    defects.push(
      "Receipt visual carry-forward requires Git-derived evidence for every link; receipt-supplied file lists are not proof.",
    );
  }
  let expected = approved;
  for (const [index, link] of chain.entries()) {
    const label = `Receipt visual carry-forward link ${index + 1}`;
    if (link?.from_sha !== expected) {
      defects.push(`${label} starts at ${link?.from_sha ?? "no SHA"}, not ${expected}.`);
    }
    if (!/^[0-9a-f]{40}$/.test(link?.to_sha ?? "")) {
      defects.push(`${label} has no full to_sha.`);
    }
    if (link?.verdict !== "non-rendered") {
      defects.push(`${label} is ${link?.verdict ?? "unclassified"}, not non-rendered.`);
    }
    if (!Array.isArray(link?.files)) {
      defects.push(`${label} has no classifier file list.`);
    } else if (classifyVisualDelta(link.files, rules).verdict !== "non-rendered") {
      defects.push(`${label}'s file list touches a rendered surface.`);
    }
    if (typeof deriveVisualFiles === "function") {
      try {
        const derived = deriveVisualFiles(link?.from_sha, link?.to_sha, currentHead);
        if (classifyVisualDelta(derived, rules).verdict !== "non-rendered") {
          defects.push(`${label}'s Git-derived diff touches a rendered surface.`);
        }
        if (
          JSON.stringify(canonicalFiles(derived)) !== JSON.stringify(canonicalFiles(link?.files))
        ) {
          defects.push(`${label}'s file list does not match its Git-derived diff.`);
        }
      } catch {
        defects.push(`${label} could not be derived as an ancestor link to the current head.`);
      }
    }
    if (link?.fact !== `carried-forward-from ${link?.from_sha}`) {
      defects.push(`${label} does not record its carried-forward-from fact.`);
    }
    expected = link?.to_sha;
  }
  if (expected !== currentHead) {
    defects.push(
      `Receipt visual carry-forward chain ends at ${expected ?? "no SHA"}, not current head ${currentHead}.`,
    );
  }
  return defects;
}

/**
 * Whether any changed path is a checkpoint-approval surface — the middle
 * tier (Brian, 2026-08-18): auth and delivery code that workers may change
 * and the lane may merge, but never silently. Detection is evidence-derived
 * from the real diff; the required owner answer is checked against the
 * journal locally and cited in the receipt for the workflow.
 */
export function touchesOwnerApprovalSurface(files, rules) {
  return (files ?? []).some((entry) =>
    [entry.previousPath, entry.path]
      .filter(Boolean)
      .some((candidate) =>
        (rules.ownerApprovalSurfaces ?? []).some((rule) => matches(rule.path, candidate)),
      ),
  );
}

/**
 * The mission-merge receipt the Lead publishes into the PR body: a fenced
 * block whose info string names it. Absent, duplicated ambiguously, or
 * unparseable all mean no receipt — and no receipt is a refusal.
 */
export function extractReceipt(body, rules) {
  const fence = new RegExp("```" + rules.receiptBlockInfo + "\\s*\\n([\\s\\S]*?)\\n```", "g");
  const found = [...(body ?? "").matchAll(fence)];
  if (found.length !== 1) return null;
  try {
    return JSON.parse(found[0][1]);
  } catch {
    return null;
  }
}

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

/** An answered owner question naming this package: the durable record that
 * Brian heard about it at the hour. */
export function answeredQuestionNames(state, packageId) {
  return Object.values(state?.questions ?? {}).some(
    (question) => question.status === "answered" && question.affected_packages.includes(packageId),
  );
}

/** An owner_decision block that actually names an answered checkpoint question. */
export function ownerDecisionCited(receipt) {
  const decision = receipt?.owner_decision;
  return Boolean(
    decision &&
    /^Q-[A-Za-z0-9-]+$/.test(decision.question_id ?? "") &&
    isNonEmptyString(decision.answered_by) &&
    /^\d{4}-\d{2}-\d{2}$/.test(decision.date ?? ""),
  );
}

/** The receipt fields the workflow requires before it trusts anything else. */
export function receiptDefects(receipt) {
  const defects = [];
  if (!receipt) return ["No mission-merge receipt block was found in the pull request body."];
  if (!isNonEmptyString(receipt.mission_id)) defects.push("Receipt is missing mission_id.");
  if (!isNonEmptyString(receipt.package_id)) defects.push("Receipt is missing package_id.");
  if (!isNonEmptyString(receipt.linear_issue_id))
    defects.push("Receipt is missing linear_issue_id.");
  if (!["low", "normal", "highest"].includes(receipt.risk_class)) {
    defects.push(`Receipt risk_class is "${receipt.risk_class ?? "absent"}".`);
  }
  // LAN-148 §F. Review grade says how rigorously a change was reviewed; it does
  // not by itself decide the route. Highest-risk work may travel the lane, but
  // only when it cites the answered owner checkpoint that named it — the same
  // evidence the checkpoint-approval surfaces require, for the same reason.
  // What stays Brian's is decided from the diff by the prohibited-path scan,
  // which no receipt can talk its way past.
  if (receipt.risk_class === "highest" && !ownerDecisionCited(receipt)) {
    defects.push(
      "Receipt risk_class is highest. It may travel this lane only when it cites the answered owner question (owner_decision: question_id, answered_by, date) recorded at Brian's checkpoint.",
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
  if (receipt.visual !== "approved" && receipt.visual_evidence !== undefined) {
    defects.push("Only an approved visual receipt may carry visual_evidence.");
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
 * @param {{ pullRequest: object|null, checkRuns: object[], files: Array<{status: string, path: string, previousPath?: string}>, rules: object, deriveVisualFiles?: (fromSha: string, toSha: string, currentHead: string) => Array<{status: string, path: string, previousPath?: string}> }} input
 * @returns {{ merge: boolean, reasons: string[], receipt: Record<string, any>|null }}
 */
export function evaluateMissionGate({
  pullRequest: pr,
  checkRuns,
  files,
  rules,
  deriveVisualFiles,
}) {
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
    reasons.push(`GitHub reports mergeable=${pr.mergeable ?? "UNKNOWN"}. Only MERGEABLE proceeds.`);
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
    if (receipt.visual === "approved") {
      reasons.push(
        ...visualCarryForwardDefects(
          receipt.visual_evidence,
          pr.headRefOid,
          rules,
          deriveVisualFiles,
        ),
      );
    }
    // The checkpoint-approval tier: an auth or delivery diff is detected from
    // evidence, and merges only with a cited, answered owner question. The
    // ask happens at Brian's hourly checkpoint; it cannot be skipped, only
    // affirmatively falsified — a durable, auditable lie in mission state.
    if (touchesOwnerApprovalSurface(files, rules)) {
      if (!ownerDecisionCited(receipt)) {
        reasons.push(
          "The diff touches a checkpoint-approval surface (auth or delivery). The receipt must cite the answered owner question (owner_decision: question_id, answered_by, date) recorded at Brian's checkpoint before this can merge.",
        );
      }
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
export function journalConjuncts(state, packageId, headSha, options = {}) {
  const reasons = [];
  const pkg = state.packages?.[packageId];
  if (!pkg) return [`No planned package ${packageId} in mission state.`];
  // When the caller supplies the real diff and rules (the local gate does),
  // a checkpoint-approval surface requires an ANSWERED owner question naming
  // this package — the durable record that Brian heard about it at the hour.
  if (options.files && options.rules && touchesOwnerApprovalSurface(options.files, options.rules)) {
    if (!answeredQuestionNames(state, packageId)) {
      reasons.push(
        `${packageId} touches a checkpoint-approval surface (auth or delivery) and no answered owner question names it. Queue the question for Brian's checkpoint; the answer is persisted before this merges.`,
      );
    }
  }

  if (state.stopped) {
    reasons.push(`The mission is stopped (${state.stopped.reason}); nothing merges.`);
  }
  if (pkg.risk_class === "highest" && !answeredQuestionNames(state, packageId)) {
    reasons.push(
      `${packageId} is highest risk and no answered owner question names it. Queue the question for Brian's checkpoint; highest-risk work travels this lane only once he has heard about it.`,
    );
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
  if (pkg.visual !== "nonvisual" && (!pkg.visual_approved || pkg.visual_evidence_pending)) {
    reasons.push(`${packageId} is visual work without Brian's recorded visual approval.`);
  }
  for (const question of Object.values(state.questions ?? {})) {
    if (question.status === "open" && question.affected_packages.includes(packageId)) {
      reasons.push(`Unresolved owner question ${question.id} affects ${packageId}.`);
    }
  }
  return reasons;
}
