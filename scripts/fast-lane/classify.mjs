/**
 * Fast-lane eligibility, computed from the diff and nothing else.
 *
 * This module is the answer to the one question that decides whether the lane
 * is safe: what is the *evidence* that a pull request qualifies? It is the set
 * of changed paths and the patch itself — never a label, a title, a commit
 * trailer, a body, or any other artifact written by the agent that opened the
 * pull request. `classify()` is therefore given exactly two things, `files` and
 * `patch`, and has no parameter through which a claim could reach it.
 *
 * The merge workflow runs THIS file and THIS rules file from the base branch,
 * not from the pull request under evaluation, so a pull request cannot supply
 * the rules that judge it. The rules additionally mark this directory as
 * protected, so such a pull request would be refused as well as powerless.
 *
 * Everything here is pure: no network, no filesystem beyond reading the rules
 * once, no environment. See docs/fast-lane.md and docs/adr/0017.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Where the checked-in rules live. Read from the base branch by the workflow. */
export const RULES_PATH = path.join(repoRoot, ".github", "fast-lane-rules.json");

export function loadRules(file = RULES_PATH) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * Glob → anchored RegExp.
 *
 * `*` stops at a path separator, `**` crosses them, and `/**` at the end covers
 * the directory's whole subtree. Deliberately tiny: a dependency here would be
 * a dependency in the thing that decides what may merge without review.
 */
export function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const rest = glob.slice(i);
    if (rest.startsWith("/**/")) {
      source += "/(?:.*/)?";
      i += 3;
    } else if (rest.startsWith("**/") && i === 0) {
      source += "(?:.*/)?";
      i += 2;
    } else if (rest === "/**") {
      source += "(?:/.*)?";
      i += 2;
    } else if (rest.startsWith("**")) {
      source += ".*";
      i += 1;
    } else if (glob[i] === "*") {
      source += "[^/]*";
    } else if (glob[i] === "?") {
      source += "[^/]";
    } else {
      source += glob[i].replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

const matches = (glob, file) => globToRegExp(glob).test(file);

/**
 * Classify one path.
 *
 * Order is the whole safety argument: protected first, then the excluded set,
 * then the eligible classes, and anything left over is UNCLASSIFIED — which is
 * ineligible. Absence of a rule is never permission.
 */
export function classifyPath(file, rules) {
  for (const entry of rules.protected) {
    if (matches(entry.path, file)) {
      return {
        file,
        eligible: false,
        verdict: "protected",
        rule: entry.path,
        reason: entry.reason,
      };
    }
  }

  for (const entry of rules.ineligible) {
    if (!matches(entry.path, file)) continue;
    if ((entry.except ?? []).some((exception) => matches(exception, file))) continue;
    return { file, eligible: false, verdict: "excluded", rule: entry.path, reason: entry.reason };
  }

  for (const [name, definition] of Object.entries(rules.classes)) {
    if ((definition.include ?? []).some((glob) => matches(glob, file))) {
      return { file, eligible: true, verdict: "eligible", class: name };
    }
  }

  return {
    file,
    eligible: false,
    verdict: "unclassified",
    reason:
      "No rule classifies this path. The fast lane fails closed: an unclassifiable path goes to the normal lane.",
  };
}

/**
 * Parse `git diff --name-status -z`-style input already split into records.
 *
 * Accepts either an array of `{ status, path, previousPath }` or the plain text
 * of `git diff --name-status`, which is what the workflow captures.
 */
export function parseNameStatus(text) {
  const files = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = parts[0].trim();
    if (/^[RC]/.test(status) && parts.length >= 3) {
      files.push({ status: status[0], path: parts[2], previousPath: parts[1] });
    } else if (parts.length >= 2) {
      files.push({ status: status[0], path: parts[1] });
    }
  }
  return files;
}

/** Split a unified diff into `{ file, added: string[], removed: string[] }`. */
export function parsePatch(patch) {
  const perFile = new Map();
  let current = null;
  for (const line of (patch ?? "").split("\n")) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) {
      current = header[2];
      if (!perFile.has(current)) perFile.set(current, { file: current, added: [], removed: [] });
      continue;
    }
    if (!current) continue;
    // Only the real file headers, which git always writes as `--- a/…`,
    // `+++ b/…` or `/dev/null`. Matching a bare `---`/`+++` prefix would also
    // swallow *content* lines that begin `--` or `++` — and a column-zero `--`
    // is exactly what SQL inside a template literal produces, in a repository
    // whose tests are full of it. Those lines would then be invisible to the
    // net-negative guard below.
    if (/^--- ("?a\/|\/dev\/null)/.test(line) || /^\+\+\+ ("?b\/|\/dev\/null)/.test(line)) continue;
    if (line.startsWith("+")) perFile.get(current).added.push(line.slice(1));
    else if (line.startsWith("-")) perFile.get(current).removed.push(line.slice(1));
  }
  return [...perFile.values()];
}

const count = (lines, token) =>
  lines.reduce((total, line) => total + line.split(token).length - 1, 0);

/**
 * An assertion whose subject is a bare literal proves nothing:
 * `expect(true).toBe(true)` and `expect(1).toBe(1)` type-check, pass, and
 * assert about the language rather than about this repository. They are not
 * counted as added coverage, so two real assertions cannot be replaced by two
 * tautologies while the count stays level.
 */
const TAUTOLOGY =
  /expect\(\s*(?:true|false|null|undefined|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|`[^`]*`)\s*\)/g;

const countMeaningful = (lines, token) =>
  count(
    lines.map((l) => l.replace(TAUTOLOGY, "")),
    token,
  );

/**
 * Coverage may be added or strengthened, never removed or weakened.
 *
 * Applied **per file**, not across the batch. Batch-wide netting is what would
 * let a new file full of trivial assertions pay for gutting a real one: ten
 * added and ten removed nets to zero and merges unreviewed. Comparing within
 * each file removes that trade. The cost is that a legitimate net-negative
 * refactor now falls out of the lane into the normal one, which is the safe
 * direction.
 */
export function applyTestGuards(testFiles, patch, rules) {
  const guards = rules.testGuards;
  const failures = [];
  const changes = parsePatch(patch).filter((change) => testFiles.includes(change.file));

  for (const change of changes) {
    if (guards.forbidNetNegativeTestLines && change.removed.length > change.added.length) {
      failures.push(
        `${change.file} is net-negative (${change.added.length} added, ${change.removed.length} removed). Removing test lines may be correct, but it is not something this lane merges unreviewed.`,
      );
    }

    if (guards.forbidNetRemovedAssertions) {
      for (const token of guards.assertionTokens) {
        const addedAssertions = countMeaningful(change.added, token);
        const removedAssertions = count(change.removed, token);
        if (removedAssertions > addedAssertions) {
          failures.push(
            `${change.file}: test changes remove more \`${token}\` assertions than they add (${addedAssertions} added that assert something, ${removedAssertions} removed).`,
          );
        }
      }
    }
  }

  for (const change of changes) {
    for (const token of guards.forbidAddedTokens) {
      if (change.added.some((line) => line.includes(token))) {
        failures.push(
          `${change.file} introduces \`${token}\`, which narrows or disables coverage.`,
        );
      }
    }
  }

  return failures;
}

/**
 * The whole batch.
 *
 * @param {{ files: Array<{status: string, path: string, previousPath?: string}>, patch?: string }} diff
 *   The changed files and the unified patch, both derived from git. There is no
 *   third parameter, and adding one that carries a claim about the pull request
 *   would be the defect this design exists to prevent.
 */
export function classify(diff, rules) {
  const files = diff.files ?? [];
  const reasons = [];
  const perFile = [];

  if (files.length === 0) {
    return {
      eligible: false,
      files: [],
      classes: [],
      reasons: ["The diff is empty. There is nothing to classify, so there is nothing to merge."],
    };
  }

  for (const entry of files) {
    if (!rules.allowedChangeStatuses.includes(entry.status)) {
      reasons.push(
        `${entry.path}: change status "${entry.status}" is not one of ${rules.allowedChangeStatuses.join(", ")}. Deletions, renames and copies go to the normal lane.`,
      );
    }
    // A rename is judged on both names, so neither side can smuggle a path in.
    for (const candidate of [entry.previousPath, entry.path].filter(Boolean)) {
      const result = classifyPath(candidate, rules);
      perFile.push(result);
      if (!result.eligible) {
        reasons.push(
          `${candidate}: ${result.verdict}${result.rule ? ` (rule \`${result.rule}\`)` : ""} — ${result.reason}`,
        );
      }
    }
  }

  const classes = [...new Set(perFile.filter((r) => r.eligible).map((r) => r.class))].sort();

  if (classes.includes("test")) {
    const testFiles = perFile.filter((r) => r.class === "test").map((r) => r.file);
    reasons.push(...applyTestGuards(testFiles, diff.patch, rules));
  }

  return { eligible: reasons.length === 0, files: perFile, classes, reasons };
}
