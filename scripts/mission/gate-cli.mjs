#!/usr/bin/env node
/**
 * The mission-merge workflow's entry point to the gate.
 *
 * Reads the evidence the workflow gathered — the pull request JSON, the
 * `git diff --name-status` output, and the check runs for the head commit —
 * runs the same `evaluateMissionGate` the tests prove, writes the verdict to
 * `mission-merge-verdict.json`, a summary table, and `$GITHUB_OUTPUT`.
 *
 * Exit status is always 0: a refusal is the normal outcome of asking, not an
 * infrastructure failure. Only being unable to evaluate at all is an error.
 */

import fs from "node:fs";
import process from "node:process";

import { parseNameStatus } from "../fast-lane/classify.mjs";
import {
  deriveGitVisualFiles,
  evaluateMissionGate,
  linkedIssue,
  loadRules,
} from "./merge-gate.mjs";

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
const checkRuns = JSON.parse(fs.readFileSync(argument("checks"), "utf8"));
const rules = loadRules();

const verdict = evaluateMissionGate({
  pullRequest,
  checkRuns,
  files,
  rules,
  deriveVisualFiles: (fromSha, toSha, currentHead) =>
    deriveGitVisualFiles(process.cwd(), fromSha, toSha, currentHead),
});

fs.writeFileSync("mission-merge-verdict.json", `${JSON.stringify(verdict, null, 2)}\n`);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `merge=${verdict.merge}`,
      `head_sha=${pullRequest.headRefOid ?? ""}`,
      `package=${verdict.receipt?.package_id ?? ""}`,
      `issue=${verdict.receipt?.linear_issue_id ?? linkedIssue(pullRequest, rules) ?? ""}`,
      "",
    ].join("\n"),
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    "### Mission merge gate",
    "",
    `| Fact | Value |`,
    `| --- | --- |`,
    `| Verdict | ${verdict.merge ? "merge" : "refused"} |`,
    `| Package | ${verdict.receipt?.package_id ?? "—"} |`,
    `| Head | \`${pullRequest.headRefOid ?? "unknown"}\` |`,
    "",
  ];
  if (!verdict.merge) {
    lines.push("Refusals:", "", ...verdict.reasons.map((reason) => `- ${reason}`), "");
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
}

console.log(JSON.stringify(verdict, null, 2));
