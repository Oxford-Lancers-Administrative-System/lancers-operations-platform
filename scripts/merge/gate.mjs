/**
 * What may reach main, and what must be looked at first (LAN-523, ADR 0041).
 *
 * There are no pull requests. A branch reaches `main` in one push, after every
 * check has passed locally. Two path lists in `.github/merge-rules.json` decide
 * how much human or reviewer attention that push needs, and both are read from
 * the real diff of the branch against `origin/main` — never from anything the
 * branch says about itself:
 *
 * - `reviewRequired`: a branch that touches any of these gets one
 *   `code-reviewer` pass at its final head before the push. Everything else
 *   is pushed with no review.
 * - `ownerOnly`: a branch that touches any of these is pushed by Brian alone.
 *   Today that is the approved mission packet, whose landing on main IS his
 *   approval of that exact version.
 *
 * Both functions return reasons, never a boolean assigned true, so a condition
 * nobody wrote cannot be the one that waves a change through.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { globToRegExp } from "./paths.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The checked-in rules. */
export const RULES_PATH = path.join(repoRoot, ".github", "merge-rules.json");

export function loadRules(file = RULES_PATH) {
  return JSON.parse(readFileSync(file, "utf8"));
}

const matches = (glob, file) => globToRegExp(glob).test(file);

function matchedRules(files, list) {
  const reasons = [];
  for (const entry of files ?? []) {
    for (const candidate of [entry.previousPath, entry.path].filter(Boolean)) {
      for (const rule of list ?? []) {
        if (matches(rule.path, candidate)) {
          reasons.push(`${candidate} (rule \`${rule.path}\`) — ${rule.reason}`);
        }
      }
    }
  }
  return reasons;
}

/**
 * Every changed path that makes an independent review mandatory. A rename is
 * judged on both names, so moving a protected file out of its protected path is
 * not a way to stop it being protected. An empty list means no review is
 * required.
 */
export function reviewRequiredPaths(files, rules) {
  return matchedRules(files, rules.reviewRequired);
}

/** Every changed path that only Brian may push. */
export function ownerOnlyPaths(files, rules) {
  return matchedRules(files, rules.ownerOnly);
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
