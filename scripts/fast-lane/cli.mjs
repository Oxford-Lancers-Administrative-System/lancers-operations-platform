/**
 * The workflow's entry point: read what git and the GitHub API reported, run
 * the classifier and the gate, write the audit trail, and emit a single
 * `merge=true|false` output.
 *
 * It executes from a checkout of the BASE branch. The pull request's own copy
 * of these rules, this classifier and this gate is fetched as git objects and
 * diffed, never run. That is what stops a pull request from supplying the rules
 * that judge it.
 *
 * Usage (all paths, all required):
 *   node scripts/fast-lane/cli.mjs --pr pr.json --files files.txt \
 *        --patch patch.diff --checks checks.json
 *
 * Exit status is always 0. A refusal is a normal outcome — the pull request
 * simply stays in the normal lane — and a non-zero exit would turn every
 * ineligible pull request into a red workflow run.
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

import { classify, loadRules, parseNameStatus } from "./classify.mjs";
import { evaluateGate } from "./gate.mjs";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required argument --${name}`);
  }
  return process.argv[index + 1];
}

const rules = loadRules();
const pullRequest = JSON.parse(readFileSync(arg("pr"), "utf8"));
const files = parseNameStatus(readFileSync(arg("files"), "utf8"));
const patch = readFileSync(arg("patch"), "utf8");
const rawChecks = JSON.parse(readFileSync(arg("checks"), "utf8"));
const checkRuns = Array.isArray(rawChecks) ? rawChecks : (rawChecks.check_runs ?? []);

const verdict = classify({ files, patch }, rules);
const gate = evaluateGate({ verdict, pullRequest, checkRuns, rules });

const report = {
  pullRequest: pullRequest.number,
  headRefOid: pullRequest.headRefOid,
  merge: gate.merge,
  classes: verdict.classes,
  issues: gate.issues,
  files: verdict.files,
  reasons: gate.reasons,
};
writeFileSync("fast-lane-verdict.json", `${JSON.stringify(report, null, 2)}\n`);

const lines = [
  "### Fast-lane evaluation",
  "",
  `**Pull request:** #${pullRequest.number} at \`${pullRequest.headRefOid}\``,
  `**Classification:** ${verdict.classes.length ? verdict.classes.join(", ") : "none"}`,
  `**Linear issues named:** ${gate.issues.length ? gate.issues.join(", ") : "none"}`,
  `**Required checks:** ${rules.requiredChecks.join(", ")}`,
  `**Decision:** ${gate.merge ? "MERGE — every rule and every required check is satisfied." : "REFUSED — this pull request stays in the normal lane."}`,
  "",
  "| File | Verdict | Class or rule |",
  "| --- | --- | --- |",
  ...verdict.files.map(
    (entry) =>
      `| \`${entry.file}\` | ${entry.verdict} | ${entry.class ?? (entry.rule ? `\`${entry.rule}\`` : "—")} |`,
  ),
];

if (gate.reasons.length) {
  lines.push("", "**Why it was refused**", "", ...gate.reasons.map((reason) => `- ${reason}`));
}

const summary = `${lines.join("\n")}\n`;
process.stdout.write(summary);

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `merge=${gate.merge}`,
      `head_sha=${pullRequest.headRefOid ?? ""}`,
      `issues=${gate.issues.join(" ")}`,
      `classes=${verdict.classes.join(" ")}`,
      "",
    ].join("\n"),
  );
}
