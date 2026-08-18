/**
 * The Owner Rule Registry: reusable product and UX decisions Brian has made.
 *
 * A rule exists so the same class of question is never asked twice. It is
 * cross-mission state — one registry per repository identity, beside the
 * mission journals — and promotion is approval-gated: an answer becomes a
 * rule only when Brian explicitly approved reuse, and the promotion records
 * that evidence. An instance-specific answer stays in its mission journal.
 *
 * Notion remains authoritative for product intent; a rule records provenance
 * (source, date, evidence) rather than silently replacing that authority.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { missionPaths, withLock } from "./state.mjs";

export const RULE_ID_PATTERN = /^RULE-[A-Z]+-\d{3}$/;

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

function emptyRegistry() {
  return { version: 1, rules: [] };
}

export function readRules(repoPath, env = process.env) {
  const paths = missionPaths(repoPath, null, env);
  try {
    return JSON.parse(fs.readFileSync(paths.ownerRules, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return emptyRegistry();
    throw error;
  }
}

function writeRules(paths, registry) {
  fs.mkdirSync(path.dirname(paths.ownerRules), { recursive: true, mode: 0o700 });
  const temporary = `${paths.ownerRules}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, paths.ownerRules);
}

/** Every defect in a candidate rule. Valid only when the list is empty. */
export function validateRule(rule) {
  const errors = [];
  if (rule === null || typeof rule !== "object" || Array.isArray(rule)) {
    return ["The rule is not an object."];
  }
  if (!isNonEmptyString(rule.id) || !RULE_ID_PATTERN.test(rule.id)) {
    errors.push("A rule id must match RULE-<AREA>-<nnn> (for example RULE-UI-007).");
  }
  if (!isNonEmptyString(rule.scope)) errors.push("scope is required.");
  if (!isNonEmptyString(rule.rule)) errors.push("rule text is required.");
  if (!Array.isArray(rule.exceptions) || !rule.exceptions.every(isNonEmptyString)) {
    errors.push("exceptions must be an array of strings (it may be empty).");
  }
  if (!isNonEmptyString(rule.source)) errors.push("source is required (who decided).");
  if (!isNonEmptyString(rule.date) || !/^\d{4}-\d{2}-\d{2}$/.test(rule.date)) {
    errors.push("date must be an ISO date (YYYY-MM-DD).");
  }
  if (rule.status !== "approved") {
    errors.push('Only an "approved" rule may enter the registry.');
  }
  if (!isNonEmptyString(rule.approval_evidence)) {
    errors.push(
      "approval_evidence must record where Brian explicitly approved reuse — an answer to one case is not a rule until he promotes it.",
    );
  }
  if (!isNonEmptyString(rule.source_mission)) {
    errors.push("source_mission records the mission whose question produced the rule.");
  }
  return errors;
}

/**
 * Promote one approved rule into the registry. Refuses an invalid rule and a
 * duplicate id. Returns the stored rule.
 */
export async function promoteRule(repoPath, rule, env = process.env) {
  const paths = missionPaths(repoPath, null, env);
  const errors = validateRule(rule);
  if (errors.length > 0) {
    const error = new Error(`Refused rule promotion:\n- ${errors.join("\n- ")}`);
    error.refusals = errors;
    throw error;
  }
  return withLock(paths.ownerRulesLock, () => {
    const registry = readRules(repoPath, env);
    if (registry.rules.some((existing) => existing.id === rule.id)) {
      throw new Error(`Rule ${rule.id} already exists; a rule is recorded once and reused.`);
    }
    registry.rules.push(rule);
    writeRules(paths, registry);
    return rule;
  });
}
