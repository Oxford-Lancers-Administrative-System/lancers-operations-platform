/**
 * What the Mission Lead must be able to say before it lifts a draft.
 *
 * LAN-209 removed the receipt. There used to be a second, machine-readable
 * story published into the pull-request body, because the workflow could not
 * see the journal and had to be told what it said. It no longer needs telling:
 * the workflow decides one thing from the real diff, and the act that
 * authorizes a merge is the Lead lifting the draft — which is a thing the Lead
 * does locally, where the journal IS visible.
 *
 * So `journalConjuncts` is unchanged in what it checks and changed in what it
 * decides. It used to answer "may the Lead publish a receipt". It now answers
 * "may the Lead lift the draft": clear review at exactly this head, Brian's
 * recorded visual approval for visual work at that same head, no open owner
 * question, no stop, no drift, a synchronized issue. The other two conditions
 * of the rule — no prohibited path, and the required checks green at the exact
 * head — are `scripts/merge/gate.mjs` and `scripts/merge/checks.mjs`, checked
 * by the same `mission gate` command.
 *
 * The prohibited-path scan and the visual-surface classifier live in
 * `scripts/merge/gate.mjs` now, because they are repository-wide rather than
 * mission-specific. They are re-exported here so the mission code has one
 * import to reason about.
 */

import { execFileSync } from "node:child_process";

import { globToRegExp, parseNameStatus } from "../merge/paths.mjs";
import { requiredChecksPassed } from "../merge/checks.mjs";
import { loadRules, prohibitedPaths } from "../merge/gate.mjs";

export {
  RULES_PATH,
  classifyVisualDelta,
  loadRules,
  prohibitedPaths,
  touchesVisualSurface,
} from "../merge/gate.mjs";

/**
 * The real diff a package's head introduces, read from the repository.
 *
 * LAN-179 round 1, R-001. The review contract is generated from this list, so
 * where the list comes from decides whether "the Lead cannot remove a generated
 * capability or job" is true. A Lead-supplied `--files` argument made the
 * re-derivation prove only that the journaled contract was a faithful function
 * of whatever list was declared — an understated list produced a self-consistent
 * but weaker contract, which is the Mission 4 shape the ticket exists to close.
 *
 * Three dots on purpose: the package's own changes since it left the base
 * branch, not everything that landed on the base branch since.
 *
 * Returns the source alongside the files. `unknown` is not an error and not an
 * empty diff — it is the honest answer when this checkout cannot resolve the
 * head or the base, and the caller fails closed on it.
 *
 * @param {string} repoPath
 * @param {string} headSha
 * @param {string} [baseBranch]
 * @returns {{ files: Array<{status: string, path: string, previousPath?: string}>,
 *   source: "derived" | "unknown", detail: string | null }}
 */
export function deriveChangedFiles(repoPath, headSha, baseBranch = loadRules().baseBranch) {
  if (!/^[0-9a-f]{40}$/.test(headSha ?? "")) {
    return { files: [], source: "unknown", detail: "the head is not a full 40-character SHA" };
  }
  for (const base of [`origin/${baseBranch}`, baseBranch]) {
    try {
      const output = execFileSync("git", ["diff", "--name-status", `${base}...${headSha}`, "--"], {
        cwd: repoPath,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return { files: parseNameStatus(output), source: "derived", detail: base };
    } catch {
      // Try the local branch name next; report unknown only when neither answers.
    }
  }
  return {
    files: [],
    source: "unknown",
    detail: `this checkout cannot diff ${headSha} against ${baseBranch}`,
  };
}

const matches = (glob, file) => globToRegExp(glob).test(file);

/**
 * The surfaces Brian hears about before a draft is lifted.
 *
 * LAN-209 deleted the `ownerApprovalSurfaces` data block along with the receipt
 * that used to cite an answered owner question for it. The requirement it
 * carried is not the receipt: ADR 0033 §4 records that auth and delivery work
 * may travel the automatic path only once an answered owner checkpoint names
 * the package, and LAN-209 keeps `journalConjuncts` on the same conditions with
 * a new consumer. So the conjunct survives, and it reads the surviving
 * `reviewContract` lists instead of the deleted block.
 *
 * Those lists are the right source rather than a convenient one: every path in
 * them already forces a fresh reviewer or the transport seam, so "this needs an
 * independent look" and "Brian should have heard about it" are the same
 * judgment. Most of `sensitiveSurfaces` is also on the prohibited list, where a
 * draft is never lifted at all, so what this actually reaches is auth, the
 * remaining database routing, the public answer-token surface, delivery and the
 * provider webhook.
 */
export function touchesCheckpointSurface(files, rules) {
  const globs = [
    ...(rules?.reviewContract?.sensitiveSurfaces ?? []),
    ...(rules?.reviewContract?.transportSurfaces ?? []),
  ];
  return (files ?? []).some((entry) =>
    [entry.previousPath, entry.path]
      .filter(Boolean)
      .some((candidate) => globs.some((glob) => matches(glob, candidate))),
  );
}

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

const clearUxConformance = (review) =>
  review?.ux_conformance?.result === "clear" &&
  Array.isArray(review.ux_conformance.mockup_states) &&
  review.ux_conformance.mockup_states.length > 0 &&
  review.ux_conformance.mockup_states.every(isNonEmptyString) &&
  isNonEmptyString(review.ux_conformance.comparison_method);

/** An answered owner question naming this package: the durable record that
 * Brian heard about it at the hour. */
export function answeredQuestionNames(state, packageId) {
  return Object.values(state?.questions ?? {}).some(
    (question) => question.status === "answered" && question.affected_packages.includes(packageId),
  );
}

/**
 * Why the Mission Lead may not lift this package's draft yet, from mission
 * state alone.
 *
 * Ground truth for these facts is machine-local durable state that no workflow
 * can see. That is exactly why the Lead checks them, and why the act it takes
 * afterwards — lifting the draft — is the authorization the workflow then
 * honours without needing to re-derive any of it.
 */
export function journalConjuncts(state, packageId, headSha, options = {}) {
  const reasons = [];
  const pkg = state.packages?.[packageId];
  if (!pkg) return [`No planned package ${packageId} in mission state.`];

  // When the caller supplies the real diff and rules (the local gate does), a
  // checkpoint surface requires an ANSWERED owner question naming this package
  // — the durable record that Brian heard about it at the hour. A declared
  // `risk_class` cannot stand in for this: the grade is a plan attribute, and
  // nothing forces it to follow the paths a package turns out to touch.
  if (options.files && options.rules && touchesCheckpointSurface(options.files, options.rules)) {
    if (!answeredQuestionNames(state, packageId)) {
      reasons.push(
        `${packageId} touches a checkpoint surface (auth, database routing, public answer tokens, delivery or the provider webhook) and no answered owner question names it. Queue the question for Brian's checkpoint; the answer is persisted before the draft is lifted.`,
      );
    }
  }

  if (state.stopped) {
    reasons.push(`The mission is stopped (${state.stopped.reason}); no draft is lifted.`);
  }
  if (pkg.risk_class === "highest" && !answeredQuestionNames(state, packageId)) {
    reasons.push(
      `${packageId} is highest risk and no answered owner question names it. Queue the question for Brian's checkpoint; highest-risk work leaves draft only once he has heard about it.`,
    );
  }
  if (pkg.migration_owner) {
    reasons.push("A migration-owning package stays a draft; Brian merges it.");
  }
  if (pkg.driftStopped) {
    reasons.push(`${packageId} is stopped by source drift; a revised approved packet is required.`);
  }
  if (!pkg.linear_issue_id) {
    reasons.push(`${packageId} has no synchronized Linear issue.`);
  }
  const packageReviewCovers =
    pkg.review?.result === "clear" &&
    pkg.review.ci_state === "green" &&
    pkg.review.reviewed_head_sha === headSha &&
    (pkg.visual === "nonvisual" || clearUxConformance(pkg.review));
  const missionReviewCovers = (state.integratedReviews ?? []).some(
    (review) =>
      review.mode === "security-tier" &&
      review.result === "clear" &&
      review.package_heads?.[packageId] === headSha,
  );
  if (!packageReviewCovers && !(pkg.visual === "nonvisual" && missionReviewCovers)) {
    reasons.push(
      `${packageId} has no clear package review or mission-level security-tier review that covers ${headSha}.`,
    );
  }
  const missionVisualApprovalCovers = (state.missionVisualApprovals ?? []).some(
    (approval) => approval.package_heads?.[packageId] === headSha,
  );
  if (
    pkg.visual !== "nonvisual" &&
    (!pkg.visual_approved || pkg.visual_evidence_pending) &&
    !missionVisualApprovalCovers
  ) {
    reasons.push(`${packageId} is visual work without Brian's recorded visual approval.`);
  }
  for (const question of Object.values(state.questions ?? {})) {
    if (question.status === "open" && question.affected_packages.includes(packageId)) {
      reasons.push(`Unresolved owner question ${question.id} affects ${packageId}.`);
    }
  }
  return reasons;
}

/**
 * The complete answer to "may the Mission Lead lift this package's draft".
 *
 * The rule's three conditions, in one place: no prohibited path in the real
 * diff, review clear at this exact head, and — for visual work — Brian's
 * approval recorded against that same head. The required checks are green at
 * that head too, which is not one of the three but is what makes the first act
 * after un-drafting a merge rather than a wait.
 *
 * `lift` is returned as `reasons.length === 0` and never assigned true.
 *
 * @param {{ state: any, packageId: string, pullRequest: any, checkRuns: any[], files: Array<{status: string, path: string, previousPath?: string}>, rules: any }} input
 * @returns {{ lift: boolean, journal_reasons: string[], evidence_reasons: string[] }}
 */
export function evaluateDraftLift({ state, packageId, pullRequest, checkRuns, files, rules }) {
  const headSha = pullRequest?.headRefOid;
  const journalReasons = journalConjuncts(state, packageId, headSha, { files, rules });
  const evidenceReasons = [
    ...prohibitedPaths(files, rules),
    ...requiredChecksPassed(checkRuns, headSha, rules),
  ];
  if (!headSha) {
    evidenceReasons.push("Pull request head commit is unknown, so nothing can be tied to it.");
  }
  return {
    lift: journalReasons.length === 0 && evidenceReasons.length === 0,
    journal_reasons: journalReasons,
    evidence_reasons: evidenceReasons,
  };
}
