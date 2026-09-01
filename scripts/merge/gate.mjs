/**
 * The one universal merge rule (LAN-209).
 *
 * A pull request leaves draft exactly once, as the last act of the work, and
 * that act is the authorization to merge it. GitHub already knows how to hold
 * a draft: it refuses to merge one, and its auto-merge waits for the draft to
 * lift. Everything this module does sits on top of that single fact.
 *
 * There is exactly one thing left for us to decide, and it is decided from the
 * real diff rather than from anything a pull request says about itself: does
 * this change touch a prohibited path? If it does, nothing is enabled and
 * Brian merges it by hand. If it does not, GitHub's own auto-merge is enabled
 * and GitHub merges it when the required checks are green.
 *
 * The shape is the deleted lanes' shape, deliberately: `autoMerge` starts as
 * nothing and is returned as `reasons.length === 0`, never assigned true, so a
 * condition nobody wrote cannot be the one that lets a merge through.
 *
 * `.github/merge-rules.json` is read from the BASE branch by the workflow —
 * `main`, already reviewed and merged — and applied to the pull request's real
 * diff. The pull request's objects are fetched and diffed; they are never
 * checked out and never executed.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { globToRegExp } from "./paths.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The checked-in rules. The workflow reads the base branch's copy. */
export const RULES_PATH = path.join(repoRoot, ".github", "merge-rules.json");

export function loadRules(file = RULES_PATH) {
  return JSON.parse(readFileSync(file, "utf8"));
}

const matches = (glob, file) => globToRegExp(glob).test(file);

/**
 * Every prohibited path in the diff. A rename is judged on both names, so
 * moving a protected file out of its protected path is not a way to stop it
 * being protected. An empty diff is refused — there is nothing to merge, so
 * nothing merges.
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
 * The shared visual-surface classifier. The Mission Lead's journal carry-forward
 * calls this, so a Lead cannot use a looser definition of "non-rendered" than
 * the checked-in rules define.
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
 * Whether GitHub's auto-merge may be enabled on this pull request.
 *
 * Deliberately narrow. This does not judge review, visual approval, CI, or
 * whether anyone read the change — a draft is what says nobody has, and the
 * draft is not lifted here or by any workflow. It judges one thing: whether
 * the diff reaches a surface that only Brian may merge.
 *
 * @param {{ pullRequest: object|null, files: Array<{status: string, path: string, previousPath?: string}>, rules: object }} input
 * @returns {{ autoMerge: boolean, reasons: string[] }}
 */
export function evaluateMergeRule({ pullRequest: pr, files, rules }) {
  const reasons = [];
  if (!pr) return { autoMerge: false, reasons: ["No pull request was resolved."] };

  if (pr.isDraft) {
    reasons.push(
      "Pull request is a draft. Draft state is the readiness gate; nothing is enabled until the work lifts it.",
    );
  }
  if ((pr.state ?? "").toUpperCase() !== "OPEN") {
    reasons.push(`Pull request is ${pr.state}, not OPEN.`);
  }
  if (pr.baseRefName !== rules.baseBranch) {
    reasons.push(`Pull request targets ${pr.baseRefName}, not ${rules.baseBranch}.`);
  }
  if (pr.isCrossRepository) {
    reasons.push("Pull request comes from a fork. Automatic merges are same-repository only.");
  }
  if (!pr.headRefOid) {
    reasons.push("Pull request head commit is unknown, so nothing can be tied to it.");
  }

  reasons.push(...prohibitedPaths(files, rules));

  return { autoMerge: reasons.length === 0, reasons };
}
