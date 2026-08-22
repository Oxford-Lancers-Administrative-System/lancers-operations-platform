import fs from "node:fs";
import path from "node:path";
import { renderDecisionCoverage, validateDecisionCoverage } from "./decisions.mjs";
import { formatAs } from "./format.mjs";
import { HUB_FILE, renderMockupHub } from "./hub.mjs";

// Ledger schema version. Version 2 adds the gates LAN-149 proved necessary:
// source-scoped controlling-decision coverage, and a generated mockup hub that
// cannot drift. A version 1 ledger predates them and is accepted only as the
// closed historical record of an already-merged intake — no live intake can
// avoid the gates by omitting the field, because `merged` is the one stage a
// version 1 ledger may sit at.
export const LEDGER_VERSION = 2;

export const DECISION_COVERAGE_FILE = "decision-coverage.md";

export const INTAKE_STAGES = [
  "boundary",
  "overview",
  "inventory",
  "workflows",
  "assembly",
  "pr_open",
  "merged",
];

export const WORKFLOW_STATES = [
  "not_started",
  "spec_draft",
  "spec_approved",
  "mock_draft",
  "mock_approved",
  "done",
];

const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";
const approved = (value) =>
  value !== null &&
  typeof value === "object" &&
  nonEmpty(value.words) &&
  /^\d{4}-\d{2}-\d{2}$/.test(value.date ?? "");

const stateAtOrAfter = (state, threshold) =>
  WORKFLOW_STATES.indexOf(state) >= WORKFLOW_STATES.indexOf(threshold);

const stageAtOrAfter = (stage, threshold) =>
  INTAKE_STAGES.indexOf(stage) >= INTAKE_STAGES.indexOf(threshold);

/** The ledger's schema version; an unversioned ledger predates LAN-149. */
export const ledgerVersion = (state) => state?.ledger_version ?? 1;

/** Whether this ledger must satisfy the LAN-149 gates. */
export const gatesApply = (state) =>
  ledgerVersion(state) >= 2 && stageAtOrAfter(state?.stage, "workflows");

export function validateIntakeState(state) {
  const errors = [];
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return ["state.json must contain an object."];
  }
  if (!/^M-[A-Za-z0-9][A-Za-z0-9-]*$/.test(state.mission_id ?? "")) {
    errors.push("mission_id must match M-<slug>.");
  }
  if (!INTAKE_STAGES.includes(state.stage)) {
    errors.push(`stage must be one of ${INTAKE_STAGES.join(", ")}.`);
  }
  if (!nonEmpty(state.baseline?.branch) || !/^[0-9a-f]{40}$/.test(state.baseline?.commit ?? "")) {
    errors.push("baseline must name a branch and full 40-character commit SHA.");
  }
  if (!nonEmpty(state.next_action)) errors.push("next_action is required.");
  if (!Array.isArray(state.workflows)) errors.push("workflows must be an array.");
  if (state.ledger_version !== undefined && ![1, LEDGER_VERSION].includes(state.ledger_version)) {
    errors.push(`ledger_version must be 1 or ${LEDGER_VERSION}.`);
  }
  if (ledgerVersion(state) === 1 && state.stage !== "merged") {
    errors.push(
      `a version 1 ledger is a closed historical record; a live intake must set ledger_version ${LEDGER_VERSION} and carry decision coverage and a generated mockup hub.`,
    );
  }
  if (INTAKE_STAGES.indexOf(state.stage) >= INTAKE_STAGES.indexOf("overview")) {
    if (!approved(state.approvals?.boundary)) {
      errors.push("approvals.boundary must retain Brian's words and approval date.");
    }
  }
  if (INTAKE_STAGES.indexOf(state.stage) >= INTAKE_STAGES.indexOf("inventory")) {
    if (!approved(state.approvals?.overview)) {
      errors.push("approvals.overview must retain Brian's words and approval date.");
    }
  }
  if (INTAKE_STAGES.indexOf(state.stage) >= INTAKE_STAGES.indexOf("workflows")) {
    if (!approved(state.approvals?.inventory)) {
      errors.push("approvals.inventory must retain Brian's words and approval date.");
    }
  }

  const ids = new Set();
  for (const [index, workflow] of (state.workflows ?? []).entries()) {
    const where = `workflows[${index}]`;
    if (!/^W[1-9][0-9]*$/.test(workflow?.id ?? "")) {
      errors.push(`${where}.id must match W<number>.`);
    } else if (ids.has(workflow.id)) {
      errors.push(`${where}.id is duplicated.`);
    } else {
      ids.add(workflow.id);
    }
    if (!nonEmpty(workflow?.name)) errors.push(`${where}.name is required.`);
    if (!WORKFLOW_STATES.includes(workflow?.state)) {
      errors.push(`${where}.state must be one of ${WORKFLOW_STATES.join(", ")}.`);
    }
    if (typeof workflow?.stale !== "boolean") errors.push(`${where}.stale must be boolean.`);
    if (!Array.isArray(workflow?.feedback)) errors.push(`${where}.feedback must be an array.`);
    if (stateAtOrAfter(workflow?.state, "spec_approved") && !approved(workflow?.approvals?.spec)) {
      errors.push(`${where}.approvals.spec must retain Brian's words and approval date.`);
    }
    if (stateAtOrAfter(workflow?.state, "mock_approved") && !approved(workflow?.approvals?.mock)) {
      errors.push(`${where}.approvals.mock must retain Brian's words and approval date.`);
    }
    for (const feedback of workflow?.feedback ?? []) {
      if (!new RegExp(`^${workflow.id}-[0-9]{2}$`).test(feedback?.screen_id ?? "")) {
        errors.push(`${where}.feedback screen_id must belong to ${workflow.id}.`);
      }
      if (!nonEmpty(feedback?.text)) errors.push(`${where}.feedback text is required.`);
    }
  }

  if (["workflows", "assembly", "pr_open", "merged"].includes(state.stage)) {
    if (state.workflows.length === 0) errors.push("a frozen inventory must contain workflows.");
    state.workflows.forEach((workflow, index) => {
      if (workflow.id !== `W${index + 1}`) {
        errors.push("the frozen inventory must be ordered and consecutively numbered from W1.");
      }
    });
  }
  if (["assembly", "pr_open", "merged"].includes(state.stage)) {
    if (state.workflows.some((workflow) => workflow.state !== "done")) {
      errors.push(`${state.stage} requires every frozen workflow to be done.`);
    }
  }

  let priorWorkflowDone = true;
  for (const workflow of state.workflows ?? []) {
    if (!priorWorkflowDone && ["spec_approved", "mock_approved", "done"].includes(workflow.state)) {
      errors.push(`${workflow.id} cannot be approved before every earlier workflow is done.`);
    }
    if (workflow.state === "done" && workflow.stale)
      errors.push(`${workflow.id} cannot be stale after completion.`);
    if (workflow.state === "done" && workflow.feedback.length > 0) {
      errors.push(`${workflow.id} cannot be done with open feedback.`);
    }
    priorWorkflowDone = priorWorkflowDone && workflow.state === "done";
  }

  if (gatesApply(state)) {
    if (state.decision_coverage === undefined) {
      errors.push(
        "decision_coverage is required before the workflow stage: inventory the source's controlling decisions and give each one exactly one disposition.",
      );
    } else {
      errors.push(
        ...validateDecisionCoverage(state.decision_coverage, {
          workflowIds: (state.workflows ?? []).map((workflow) => workflow.id),
          missionId: state.mission_id,
        }),
      );
    }
    errors.push(...validateMockupHubDeclaration(state));
  }

  return errors;
}

/**
 * A mission that produces mockups must publish the generated hub. A mission
 * that genuinely produces none says so explicitly, with a reason; silence is
 * never the not-applicable answer.
 */
function validateMockupHubDeclaration(state) {
  const declaration = state.mockup_hub;
  const producesMockups = (state.workflows ?? []).some((workflow) =>
    stateAtOrAfter(workflow?.state, "mock_draft"),
  );
  if (declaration === "generated") return [];
  if (
    declaration !== null &&
    typeof declaration === "object" &&
    !Array.isArray(declaration) &&
    Object.keys(declaration).length === 1 &&
    nonEmpty(declaration.not_applicable)
  ) {
    return producesMockups
      ? [
          "mockup_hub is not_applicable but workflows have mockups; a mission that produces mockups publishes the generated hub.",
        ]
      : [];
  }
  return [
    'mockup_hub must be "generated", or {"not_applicable": "<reason>"} for a mission that produces no mockups.',
  ];
}

const oneMatch = (directory, expression) =>
  fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => expression.test(name)) : [];

export function validateIntakeLedger(state, ledgerRoot, { requireGenerated = true } = {}) {
  const errors = [];
  const requiredByStage = [
    ["overview", "00-boundary.md"],
    ["inventory", "01-overview.md"],
    ["workflows", "02-workflows.md"],
  ];
  for (const [stage, file] of requiredByStage) {
    if (INTAKE_STAGES.indexOf(state.stage) >= INTAKE_STAGES.indexOf(stage)) {
      const target = path.join(ledgerRoot, file);
      if (!fs.existsSync(target) || fs.readFileSync(target, "utf8").trim() === "") {
        errors.push(`${file} is required for stage ${state.stage}.`);
      }
    }
  }

  if (INTAKE_STAGES.indexOf(state.stage) >= INTAKE_STAGES.indexOf("workflows")) {
    const inventoryFile = path.join(ledgerRoot, "02-workflows.md");
    if (fs.existsSync(inventoryFile)) {
      const inventory = fs.readFileSync(inventoryFile, "utf8");
      const inventoryIds = [...inventory.matchAll(/^\s*\d+\.\s+`(W[1-9][0-9]*)`\s+—/gm)].map(
        (match) => match[1],
      );
      const stateIds = state.workflows.map((workflow) => workflow.id);
      if (
        inventoryIds.length !== stateIds.length ||
        inventoryIds.some((id, index) => id !== stateIds[index])
      ) {
        errors.push("02-workflows.md must match state.json workflow ids and order exactly.");
      }
    }
  }

  for (const workflow of state.workflows) {
    const specs = oneMatch(
      path.join(ledgerRoot, "workflows"),
      new RegExp(`^${workflow.id}-.+\\.md$`),
    );
    if (stateAtOrAfter(workflow.state, "spec_draft") && specs.length !== 1) {
      errors.push(`${workflow.id} ${workflow.state} requires exactly one workflow specification.`);
    }
    const mocks = oneMatch(
      path.join(ledgerRoot, "mockups"),
      new RegExp(`^${workflow.id}-.+\\.html$`),
    );
    if (stateAtOrAfter(workflow.state, "mock_draft") && mocks.length !== 1) {
      errors.push(`${workflow.id} ${workflow.state} requires exactly one workflow mockup.`);
    }
    const acceptance = path.join(ledgerRoot, "acceptance", `${workflow.id}.md`);
    if (workflow.state === "done" && !fs.existsSync(acceptance)) {
      errors.push(`${workflow.id} done requires acceptance/${workflow.id}.md.`);
    }
    if (workflow.stale && ["spec_approved", "mock_approved", "done"].includes(workflow.state)) {
      errors.push(`${workflow.id} cannot retain an approved state while stale.`);
    }
  }

  if (requireGenerated && gatesApply(state)) {
    for (const file of requiredGeneratedFiles(state)) {
      if (!fs.existsSync(path.join(ledgerRoot, file))) {
        errors.push(
          `${file} is required and is generated by npm run intake -- ${generatorFor(file)}.`,
        );
      }
    }
  }
  return errors;
}

/** The generated artifacts this ledger must publish at its current stage. */
export function requiredGeneratedFiles(state) {
  const files = [DECISION_COVERAGE_FILE];
  if (state.mockup_hub === "generated") files.push(HUB_FILE);
  return files;
}

const generatorFor = (file) => (file === HUB_FILE ? "hub --write" : "coverage --write");

/**
 * Compare every generated ledger artifact with what the ledger would generate
 * now. A hand-edited or stale hub is drift, and drift fails.
 */
export async function validateGeneratedArtifacts(state, ledgerRoot) {
  const errors = [];
  if (!gatesApply(state)) return errors;
  const expected = new Map([[DECISION_COVERAGE_FILE, renderDecisionCoverage(state)]]);
  if (state.mockup_hub === "generated") {
    expected.set(HUB_FILE, renderMockupHub(state, ledgerRoot));
  }
  for (const [file, content] of expected) {
    const target = path.join(ledgerRoot, file);
    if (!fs.existsSync(target)) {
      errors.push(
        `${file} is missing; regenerate it with npm run intake -- ${generatorFor(file)}.`,
      );
      continue;
    }
    if (fs.readFileSync(target, "utf8") !== (await formatAs(content, file))) {
      errors.push(
        `${file} differs from the ledger it is generated from; regenerate it with npm run intake -- ${generatorFor(file)} rather than editing it.`,
      );
    }
  }
  return errors;
}

export function findStateFile(repoRoot, missionId) {
  const intakeRoot = path.join(repoRoot, "missions", "intake");
  if (missionId) return path.join(intakeRoot, missionId, "state.json");
  if (!fs.existsSync(intakeRoot)) throw new Error("No intake ledger exists in missions/intake/.");
  const matches = fs
    .readdirSync(intakeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(intakeRoot, entry.name, "state.json"))
    .filter((file) => fs.existsSync(file));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one intake state.json, found ${matches.length}; pass a mission id.`,
    );
  }
  return matches[0];
}

export function readIntakeState(file, { requireGenerated = true } = {}) {
  if (!fs.existsSync(file)) throw new Error(`Missing intake state: ${file}`);
  let state;
  try {
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}: ${error.message}`);
  }
  const errors = validateIntakeState(state);
  errors.push(...validateIntakeLedger(state, path.dirname(file), { requireGenerated }));
  if (errors.length) throw new Error(`Inconsistent intake state:\n- ${errors.join("\n- ")}`);
  return state;
}

export function renderResumeBanner(state) {
  const lines = [`Mission intake resume — ${state.mission_id}`, `Stage: ${state.stage}`];
  if (state.workflows.length === 0) lines.push("Workflows: inventory not frozen");
  for (const workflow of state.workflows) {
    lines.push(
      `${workflow.id} · ${workflow.name}: ${workflow.state}${workflow.stale ? " · STALE" : ""}`,
    );
  }
  lines.push(`Next action: ${state.next_action}`);
  return lines.join("\n");
}
