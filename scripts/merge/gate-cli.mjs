#!/usr/bin/env node
/**
 * The merge workflow's entry point to the rule.
 *
 * Reads the evidence the workflow gathered — the pull request JSON and the
 * `git diff --name-status` output — runs the same `evaluateMergeRule` the
 * tests prove, and writes the verdict to `merge-verdict.json`, a summary
 * table, and `$GITHUB_OUTPUT`.
 *
 * Exit status is always 0: a refusal is the normal outcome of asking, not an
 * infrastructure failure. Only being unable to evaluate at all is an error.
 */

import fs from "node:fs";
import process from "node:process";

import { parseNameStatus } from "./paths.mjs";
import { evaluateMergeRule, loadRules, prohibitedPaths } from "./gate.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || !process.argv[index + 1]) {
    console.error(`Missing --${name}`);
    process.exit(1);
  }
  return process.argv[index + 1];
}

const pullRequest = JSON.parse(fs.readFileSync(argument("pr"), "utf8"));
const files = parseNameStatus(fs.readFileSync(argument("files"), "utf8"));
const rules = loadRules();

const verdict = evaluateMergeRule({ pullRequest, files, rules });
// Whether Brian is the only one who may merge this is a different question from
// whether auto-merge may be enabled right now: a draft refuses for a reason
// that resolves itself, a prohibited path never does. The workflow comments
// only on the second.
const prohibited = prohibitedPaths(files, rules);

fs.writeFileSync("merge-verdict.json", `${JSON.stringify({ ...verdict, prohibited }, null, 2)}\n`);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `auto_merge=${verdict.autoMerge}`,
      `prohibited=${prohibited.length > 0}`,
      `head_sha=${pullRequest.headRefOid ?? ""}`,
      "",
    ].join("\n"),
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    "### Merge rule",
    "",
    "| Fact | Value |",
    "| --- | --- |",
    `| Auto-merge | ${verdict.autoMerge ? "enabled" : "not enabled"} |`,
    `| Prohibited path | ${prohibited.length > 0 ? "yes — Brian merges this" : "no"} |`,
    `| Head | \`${pullRequest.headRefOid ?? "unknown"}\` |`,
    "",
  ];
  if (!verdict.autoMerge) {
    lines.push("Reasons:", "", ...verdict.reasons.map((reason) => `- ${reason}`), "");
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
}

console.log(JSON.stringify({ ...verdict, prohibited }, null, 2));
