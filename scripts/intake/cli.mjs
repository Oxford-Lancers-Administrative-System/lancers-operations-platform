#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { renderDecisionCoverage } from "./lib/decisions.mjs";
import { replaceExact, writeGenerated } from "./lib/edit.mjs";
import { formatAs } from "./lib/format.mjs";
import { HUB_FILE, renderMockupHub } from "./lib/hub.mjs";
import { validateFinalPrPaths } from "./lib/pr.mjs";
import { shootScreen } from "./lib/shoot.mjs";
import { renderSubjectCoverage } from "./lib/subject.mjs";
import {
  DECISION_COVERAGE_FILE,
  SUBJECT_COVERAGE_FILE,
  findStateFile,
  gatesApply,
  readIntakeState,
  renderResumeBanner,
  subjectGatesApply,
  validateGeneratedArtifacts,
} from "./lib/state.mjs";

const USAGE = `Usage:
  npm run intake -- status [M-<mission-id>]
  npm run intake -- check [M-<mission-id>]
  npm run intake -- hub [M-<mission-id>] --write|--check
  npm run intake -- coverage [M-<mission-id>] --write|--check
  npm run intake -- subject [M-<mission-id>] --write|--check
  npm run intake -- pr-paths [M-<mission-id>] --diff <ref>
  npm run intake -- shoot [M-<mission-id>] --screen <Wn-nn> --route <path> \\
                          [--proposal <file.js>]
  npm run intake -- edit --file <path> (--find <text>|--find-file <path>) \\
                         (--replace <text>|--replace-file <path>) --expect <n>`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const argv = process.argv.slice(2);
const command = argv[0];

function parse(rest, { flags = [], values = [] }) {
  const parsed = { _: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (flags.includes(token)) parsed[token.replace(/^--/, "")] = true;
    else if (values.includes(token)) {
      const value = rest[index + 1];
      if (value === undefined) fail(`${token} needs a value.\n${USAGE}`);
      parsed[token.replace(/^--/, "")] = value;
      index += 1;
    } else if (token.startsWith("--")) fail(`Unknown option ${token}.\n${USAGE}`);
    else parsed._.push(token);
  }
  return parsed;
}

function missionArgument(positional) {
  if (positional.length > 1) fail(`Pass at most one mission id.\n${USAGE}`);
  const missionId = positional[0];
  if (missionId && !/^M-[A-Za-z0-9][A-Za-z0-9-]*$/.test(missionId)) {
    fail("Mission id must match M-<slug>.");
  }
  return missionId;
}

/** Read and fully validate the ledger, or exit with the fail-closed message. */
function load(missionId, options) {
  try {
    const file = findStateFile(process.cwd(), missionId);
    return { state: readIntakeState(file, options), root: path.dirname(file), file };
  } catch (error) {
    fail(`mission intake system not ready: ${error.message}`);
    return null;
  }
}

/**
 * The ledger a scripted edit touches, so that the reloaded artifact is checked
 * by the same validation the intake itself runs.
 */
function ledgerFor(file) {
  const parts = path.resolve(file).split(path.sep);
  const index = parts.lastIndexOf("intake");
  if (index < 1 || parts[index - 1] !== "missions" || index + 1 >= parts.length) return null;
  const root = parts.slice(0, index + 2).join(path.sep);
  return fs.existsSync(path.join(root, "state.json")) ? root : null;
}

function ledgerValidator(file) {
  const root = ledgerFor(file);
  if (!root) return undefined;
  return async () => {
    try {
      const state = readIntakeState(path.join(root, "state.json"));
      return await validateGeneratedArtifacts(state, root);
    } catch (error) {
      return [error.message];
    }
  };
}

async function assertNoDrift(state, root) {
  const errors = await validateGeneratedArtifacts(state, root);
  if (errors.length) fail(`mission intake system not ready:\n- ${errors.join("\n- ")}`);
}

async function generate(command, missionId, options) {
  // A generator has to be able to create the artifact it is asked for, so the
  // existence requirement is suspended for this read alone; drift is still
  // asserted against the written result before the command reports success.
  const { state, root } = load(missionId, { requireGenerated: false });
  if (!gatesApply(state)) {
    fail(
      `mission intake system not ready: ${state.mission_id} is a version 1 ledger before the workflow stage and generates no ${command}.`,
    );
  }
  if (command === "subject" && !subjectGatesApply(state)) {
    fail(
      `mission intake system not ready: ${state.mission_id} is a version ${state.ledger_version ?? 1} ledger and generates no subject coverage.`,
    );
  }
  const isHub = command === "hub";
  if (isHub && state.mockup_hub !== "generated") {
    fail(
      `mission intake system not ready: ${state.mission_id} declares mockup_hub not_applicable.`,
    );
  }
  const isSubject = command === "subject";
  const file = isHub ? HUB_FILE : isSubject ? SUBJECT_COVERAGE_FILE : DECISION_COVERAGE_FILE;
  const content = isHub
    ? renderMockupHub(state, root)
    : isSubject
      ? renderSubjectCoverage(state)
      : renderDecisionCoverage(state);
  const target = path.join(root, file);
  const expected = await formatAs(content, file);

  if (options.check || !options.write) {
    if (!fs.existsSync(target)) fail(`${file} is missing; write it with --write.`);
    if (fs.readFileSync(target, "utf8") !== expected) {
      fail(
        `${file} differs from the ledger it is generated from; regenerate it with --write rather than editing it.`,
      );
    }
    console.log(`${file} matches the ledger.`);
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  await writeGenerated({
    file: target,
    content,
    // Read-back: the bytes on disk after formatting must be exactly what this
    // ledger generates, or the write is rolled back.
    validate: (reloaded) => (reloaded === expected ? [] : [`${file} did not survive formatting.`]),
  });
  console.log(`Wrote ${path.relative(process.cwd(), target)} from ${state.mission_id}.`);
}

async function main() {
  switch (command) {
    case "status": {
      const missionId = missionArgument(parse(argv.slice(1), {})._);
      const { state, root } = load(missionId);
      await assertNoDrift(state, root);
      console.log(renderResumeBanner(state));
      return;
    }
    case "check": {
      const missionId = missionArgument(parse(argv.slice(1), {})._);
      const { state, root } = load(missionId);
      await assertNoDrift(state, root);
      console.log(`${state.mission_id} ledger, stage ${state.stage}: consistent.`);
      return;
    }
    case "hub":
    case "coverage":
    case "subject": {
      const options = parse(argv.slice(1), { flags: ["--write", "--check"] });
      if (options.write && options.check) fail(`Pass --write or --check, not both.\n${USAGE}`);
      await generate(command, missionArgument(options._), options);
      return;
    }
    case "pr-paths": {
      const options = parse(argv.slice(1), { values: ["--diff"] });
      const missionId = missionArgument(options._);
      const { state } = load(missionId);
      const base = options.diff ?? "main";
      const diff = spawnSync("git", ["diff", "--name-only", `${base}...HEAD`], {
        encoding: "utf8",
      });
      if (diff.status !== 0) fail(`git diff against ${base} failed: ${diff.stderr.trim()}`);
      const paths = diff.stdout.split("\n").filter(Boolean);
      const errors = validateFinalPrPaths(state.mission_id, paths);
      if (errors.length)
        fail(`This is not an intake-artifacts-only diff:\n- ${errors.join("\n- ")}`);
      console.log(
        `${paths.length} changed file(s) against ${base}: exactly ${state.mission_id}'s ledger and packet.`,
      );
      return;
    }
    case "shoot": {
      const options = parse(argv.slice(1), { values: ["--screen", "--route", "--proposal"] });
      const { root } = load(missionArgument(options._), { requireGenerated: false });
      if (!options.screen || !options.route) fail(`shoot needs --screen and --route.\n${USAGE}`);
      const proposalFile = options.proposal ?? null;
      const proposal = proposalFile ? fs.readFileSync(proposalFile, "utf8") : null;
      try {
        const record = await shootScreen({
          repoPath: process.cwd(),
          ledgerRoot: root,
          screenId: options.screen,
          route: options.route,
          mutate: proposal,
          mutateFile: proposalFile,
        });
        for (const capture of record.captures) {
          console.log(
            `${record.id} ${capture.side} ${capture.viewport}: browser context measured ${capture.measuredWidth}px → ${capture.file}`,
          );
        }
        if (!proposal) {
          // The whole failure this command exists to prevent: a photograph of
          // the current build set beside a drawing of the proposal, so every
          // difference in rendering reads as a proposal.
          console.log(
            `Current side only. A screen that changes an existing surface needs --proposal too; do not pair this photograph with a drawing.`,
          );
        }
      } catch (error) {
        fail(error.message);
      }
      return;
    }
    case "edit": {
      const options = parse(argv.slice(1), {
        values: ["--file", "--find", "--find-file", "--replace", "--replace-file", "--expect"],
      });
      if (options._.length) fail(`Unexpected argument ${options._[0]}.\n${USAGE}`);
      if (!options.file) fail(`edit needs --file.\n${USAGE}`);
      const find = options["find-file"]
        ? fs.readFileSync(options["find-file"], "utf8")
        : options.find;
      const replace = options["replace-file"]
        ? fs.readFileSync(options["replace-file"], "utf8")
        : options.replace;
      if (find === undefined || replace === undefined) {
        fail(`edit needs --find/--find-file and --replace/--replace-file.\n${USAGE}`);
      }
      const expected = Number(options.expect);
      try {
        const result = await replaceExact({
          file: options.file,
          find,
          replace,
          expect: expected,
          validate: ledgerValidator(options.file),
        });
        console.log(
          `${result.file}: changed ${result.targets.length} target(s) at ${result.targets
            .map((target) => `${target.line}:${target.column}`)
            .join(", ")}`,
        );
        for (const target of result.targets) console.log(`  ${target.line}: ${target.context}`);
      } catch (error) {
        fail(error.message);
      }
      return;
    }
    default:
      fail(USAGE);
  }
}

await main();
