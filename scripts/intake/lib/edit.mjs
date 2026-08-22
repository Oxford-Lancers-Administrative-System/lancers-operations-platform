// Write safety for intake-owned scripted edits and generated artifacts.
//
// During the first ledger-driven intake, scripted replacements silently matched
// nothing and the run continued as though they had applied. An edit that cannot
// prove what it changed is not an edit; these helpers assert the expected match
// count, name the targets they changed, reload the artifact after formatting,
// and re-validate the reloaded bytes.

import fs from "node:fs";
import { formatAs } from "./format.mjs";

/** Every occurrence of a literal needle, as 1-based line/column targets. */
export function findTargets(content, needle) {
  const targets = [];
  if (needle === "") return targets;
  let index = content.indexOf(needle);
  while (index !== -1) {
    const before = content.slice(0, index);
    const line = before.split("\n").length;
    const column = index - (before.lastIndexOf("\n") + 1) + 1;
    const lineText = content.split("\n")[line - 1] ?? "";
    targets.push({ line, column, context: lineText.trim().slice(0, 120) });
    index = content.indexOf(needle, index + needle.length);
  }
  return targets;
}

/**
 * Replace every occurrence of a literal string in one file, refusing anything
 * but the expected number of matches, then format the file and re-read it.
 *
 * `validate` receives the reloaded content and returns an array of errors; a
 * failing validation restores the original bytes, because a half-applied edit
 * to a ledger is worse than no edit.
 */
export async function replaceExact({ file, find, replace, expect: expected, validate = null }) {
  if (!Number.isInteger(expected) || expected < 1) {
    throw new Error("expect must be the positive number of matches the edit intends to change.");
  }
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
  const original = fs.readFileSync(file, "utf8");
  const targets = findTargets(original, find);
  if (targets.length !== expected) {
    throw new Error(
      targets.length === 0
        ? `Refusing a zero-match edit: ${JSON.stringify(find)} does not occur in ${file}.`
        : `Refusing an unexpected ${targets.length}-match edit: expected ${expected} occurrence(s) of ${JSON.stringify(find)} in ${file}, found ${targets.length} at ${targets.map((target) => `${target.line}:${target.column}`).join(", ")}.`,
    );
  }

  fs.writeFileSync(file, original.split(find).join(replace));
  return writeChecked({ file, validate, targets, original });
}

/** Write generated content over a file, format it, reload it, and validate it. */
export async function writeGenerated({ file, content, validate = null }) {
  const original = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  fs.writeFileSync(file, content);
  return writeChecked({ file, validate, targets: [], original });
}

async function writeChecked({ file, validate, targets, original }) {
  const formatted = await formatAs(fs.readFileSync(file, "utf8"), file);
  fs.writeFileSync(file, formatted);

  // Read back from disk rather than trusting the string we just wrote.
  const reloaded = fs.readFileSync(file, "utf8");
  const errors = validate ? await validate(reloaded) : [];
  if (errors.length) {
    if (original === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, original);
    throw new Error(
      `Reloaded ${file} is invalid, so the edit was rolled back:\n- ${errors.join("\n- ")}`,
    );
  }
  return { file, targets, changed: reloaded !== original };
}
