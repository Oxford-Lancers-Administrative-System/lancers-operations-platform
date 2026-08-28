// Subject-product coverage for a mission intake ledger.
//
// Decision coverage proves that every decision already present in a controlling
// source has one home. It cannot prove that intake found the subject's missing
// pages, administration, failure paths or cross-mission seams. Version 3 ledgers
// therefore carry a second, owner-approved map: the product areas discovered by
// the intake and the honest disposition of each one.

export const SUBJECT_DISPOSITIONS = [
  "owned_workflow",
  "owned_invariant",
  "shared_cross_mission",
  "retained_existing",
  "modified_existing",
  "other_mission",
  "provisional_handoff",
  "excluded",
  "unresolved",
];

const MISSION_ID = /^M-[A-Za-z0-9][A-Za-z0-9-]*$/;
const WORKFLOW_ID = /^W[1-9][0-9]*$/;
const AREA_ID = /^S[1-9][0-9]*$/;
const AMENDMENT_ID = /^A[1-9][0-9]*$/;

const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";
const approved = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  nonEmpty(value.words) &&
  /^\d{4}-\d{2}-\d{2}$/.test(value.date ?? "");

const validMission = (value) => MISSION_ID.test(value ?? "");
const validWorkflow = (value, workflows) => WORKFLOW_ID.test(value ?? "") && workflows.has(value);

function validateCurrentHome(area, workflows) {
  const at = `${area.id} (${area.name})`;
  const workflow = validWorkflow(area.workflow, workflows);
  const invariant = nonEmpty(area.invariant);
  if (!workflow && !invariant) {
    return [`${at} must map this mission's side to one frozen workflow or owned invariant.`];
  }
  if (area.workflow !== undefined && !workflow) {
    return [`${at} names an unknown workflow ${JSON.stringify(area.workflow)}.`];
  }
  return [];
}

function validateNamedMissions(area, field, { missionId, includeCurrent, minimum = 1 }) {
  const at = `${area.id} (${area.name})`;
  const owners = area[field];
  if (!Array.isArray(owners) || owners.length < minimum) {
    return [`${at} ${field} must name at least ${minimum} mission${minimum === 1 ? "" : "s"}.`];
  }
  const errors = [];
  if (owners.some((owner) => !validMission(owner))) {
    errors.push(`${at} ${field} must contain only M-<slug> mission ids.`);
  }
  if (new Set(owners).size !== owners.length) errors.push(`${at} ${field} repeats a mission.`);
  if (includeCurrent && missionId && !owners.includes(missionId)) {
    errors.push(`${at} is shared but does not name this mission ${missionId}.`);
  }
  return errors;
}

/**
 * Validate the subject map against the frozen workflow inventory. This proves
 * that every area the intake discovered has a usable disposition. Brian's
 * approvals remain the semantic completeness gate: code cannot prove that the
 * intake discovered every area belonging to the subject.
 */
export function validateSubjectCoverage(coverage, options = {}) {
  const { workflowIds = [], missionId = "" } = options;
  if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)) {
    return ["subject_coverage must be an object."];
  }
  if (!Array.isArray(coverage.areas) || coverage.areas.length === 0) {
    return ["subject_coverage.areas must inventory at least one product area."];
  }

  const errors = [];
  const ids = new Set();
  const workflows = new Set(workflowIds);
  for (const [index, area] of coverage.areas.entries()) {
    const where = `subject_coverage.areas[${index}]`;
    if (!AREA_ID.test(area?.id ?? "")) {
      errors.push(`${where}.id must match S<number>.`);
      continue;
    }
    if (ids.has(area.id)) errors.push(`${where}.id ${area.id} is duplicated.`);
    ids.add(area.id);
    if (!nonEmpty(area.name)) errors.push(`${area.id}.name is required.`);
    if (!nonEmpty(area.belongs)) {
      errors.push(`${area.id}.belongs must explain why this area belongs in the subject sweep.`);
    }
    if (!SUBJECT_DISPOSITIONS.includes(area.disposition)) {
      errors.push(`${area.id}.disposition must be one of ${SUBJECT_DISPOSITIONS.join(", ")}.`);
      continue;
    }
    if (!nonEmpty(area.reason)) {
      errors.push(`${area.id} requires a reason for its ${area.disposition} disposition.`);
    }

    const at = `${area.id} (${area.name || "unnamed"})`;
    switch (area.disposition) {
      case "owned_workflow":
        if (!validWorkflow(area.workflow, workflows)) {
          errors.push(`${at} is owned_workflow and must name one frozen workflow.`);
        }
        break;
      case "owned_invariant":
        if (!nonEmpty(area.invariant)) {
          errors.push(`${at} is owned_invariant and must state the binding invariant.`);
        }
        break;
      case "retained_existing":
      case "modified_existing":
        if (!validWorkflow(area.workflow, workflows)) {
          errors.push(`${at} is ${area.disposition} and must map to one frozen workflow.`);
        }
        if (!nonEmpty(area.baseline)) {
          errors.push(
            `${at} is ${area.disposition} and must cite the implemented main baseline it retains or changes.`,
          );
        }
        break;
      case "shared_cross_mission":
        errors.push(
          ...validateNamedMissions(area, "shared_owners", {
            missionId,
            includeCurrent: true,
            minimum: 2,
          }),
        );
        if (!nonEmpty(area.current_side)) {
          errors.push(`${at} must state this mission's side of the shared contract.`);
        }
        errors.push(...validateCurrentHome(area, workflows));
        if (!nonEmpty(area.seam) || !nonEmpty(area.evidence)) {
          errors.push(`${at} must record the shared seam and its evidence.`);
        }
        break;
      case "other_mission":
        if (!validMission(area.other_mission) || area.other_mission === missionId) {
          errors.push(`${at} must name a different owning mission as M-<slug>.`);
        }
        if (!nonEmpty(area.seam) || !nonEmpty(area.evidence)) {
          errors.push(`${at} must record the other-mission seam and its evidence.`);
        }
        break;
      case "provisional_handoff":
        if (!validMission(area.other_mission) || area.other_mission === missionId) {
          errors.push(`${at} must name the future owning mission as M-<slug>.`);
        }
        if (!nonEmpty(area.seam) || !nonEmpty(area.evidence)) {
          errors.push(`${at} must record the provisional seam and its evidence.`);
        }
        errors.push(...validateCurrentHome(area, workflows));
        if (typeof area.blocking !== "boolean") {
          errors.push(`${at}.blocking must be true or false.`);
        } else if (area.blocking) {
          errors.push(
            `${at} is a blocking provisional handoff; the mission is not ready for the workflow stage.`,
          );
        } else if (!nonEmpty(area.independent_outcome)) {
          errors.push(
            `${at} is nonblocking only when independent_outcome explains how this mission remains walkable and acceptable without the future mission.`,
          );
        }
        break;
      case "excluded":
        if (!nonEmpty(area.evidence) || !approved(area.approval)) {
          errors.push(`${at} is excluded and requires evidence plus Brian's words and date.`);
        }
        break;
      case "unresolved":
        errors.push(`${at} is unresolved; settle or route it before freezing workflows.`);
        break;
    }
  }
  return errors;
}

/** Validate the collected, owner-approved append-only amendment batch. */
export function validateAmendmentPlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return ["amendment_plan must be an object."];
  }
  if (!Array.isArray(plan.items)) return ["amendment_plan.items must be an array."];

  const errors = [];
  const ids = new Set();
  let applied = false;
  for (const [index, item] of plan.items.entries()) {
    const where = `amendment_plan.items[${index}]`;
    if (!AMENDMENT_ID.test(item?.id ?? "")) {
      errors.push(`${where}.id must match A<number>.`);
      continue;
    }
    if (ids.has(item.id)) errors.push(`${where}.id ${item.id} is duplicated.`);
    ids.add(item.id);
    if (!nonEmpty(item.target)) errors.push(`${item.id}.target is required.`);
    if (!nonEmpty(item.change)) errors.push(`${item.id}.change is required.`);
    if (!nonEmpty(item.reason)) errors.push(`${item.id}.reason is required.`);
    if (!["proposed", "applied_verified"].includes(item.status)) {
      errors.push(`${item.id}.status must be proposed or applied_verified.`);
    }
    if (item.status === "applied_verified") {
      applied = true;
      if (
        !item.verification ||
        typeof item.verification !== "object" ||
        Array.isArray(item.verification) ||
        Number.isNaN(Date.parse(item.verification.refetched_at ?? "")) ||
        !nonEmpty(item.verification.evidence)
      ) {
        errors.push(
          `${item.id} is applied_verified and must record refetched_at plus verification evidence.`,
        );
      }
    }
  }
  if (applied && !approved(plan.approval)) {
    errors.push(
      "amendment_plan contains applied changes without Brian's approval of the collected plan.",
    );
  }
  if (plan.approval !== null && plan.approval !== undefined && !approved(plan.approval)) {
    errors.push("amendment_plan.approval must retain Brian's exact words and approval date.");
  }
  return errors;
}

function destination(area) {
  switch (area.disposition) {
    case "owned_workflow":
      return area.workflow;
    case "owned_invariant":
      return area.invariant;
    case "retained_existing":
    case "modified_existing":
      return `${area.workflow} · ${area.baseline}`;
    case "shared_cross_mission":
      return `${area.shared_owners.join(", ")} · ${area.workflow ?? area.invariant}`;
    case "other_mission":
      return area.other_mission;
    case "provisional_handoff":
      return `${area.other_mission} · ${area.blocking ? "blocking" : "nonblocking"} · ${area.workflow ?? area.invariant}`;
    case "excluded":
      return `Brian ${area.approval.date}`;
    case "unresolved":
      return "must resolve";
  }
}

const cell = (value) =>
  String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ");

/** Render the owner-readable subject and amendment map from canonical state. */
export function renderSubjectCoverage(state) {
  const areas = state.subject_coverage.areas;
  const totals = new Map(SUBJECT_DISPOSITIONS.map((name) => [name, 0]));
  for (const area of areas) totals.set(area.disposition, totals.get(area.disposition) + 1);
  const lines = [
    `# Subject-product coverage — ${state.mission_id}`,
    "",
    "Generated by `npm run intake -- subject --write` from `state.json`. Do not",
    "hand-edit. This proves a disposition for every area intake discovered; Brian's",
    "boundary and inventory approvals—not this validator—judge subject completeness.",
    "",
    "## Coverage summary",
    "",
    "| Disposition | Count |",
    "| --- | ---: |",
  ];
  for (const disposition of SUBJECT_DISPOSITIONS) {
    lines.push(`| \`${disposition}\` | ${totals.get(disposition)} |`);
  }
  lines.push(
    "",
    "## Product areas",
    "",
    "| ID | Area | Disposition | Home | Why and seam |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const area of areas) {
    const seam = [area.belongs, area.reason, area.seam, area.current_side, area.independent_outcome]
      .filter(nonEmpty)
      .join(" ");
    lines.push(
      `| \`${area.id}\` | ${cell(area.name)} | \`${area.disposition}\` | ${cell(destination(area))} | ${cell(seam)} |`,
    );
  }

  const plan = state.amendment_plan;
  lines.push("", "## Batched append-only amendment plan", "");
  if (plan.items.length === 0) {
    lines.push("No cross-record amendments discovered.");
  } else {
    lines.push(
      "| ID | Target | Proposed append-only change | Status |",
      "| --- | --- | --- | --- |",
    );
    for (const item of plan.items) {
      lines.push(
        `| \`${item.id}\` | ${cell(item.target)} | ${cell(item.change)} | \`${item.status}\` |`,
      );
    }
  }
  lines.push(
    "",
    plan.approval
      ? `Collected-plan approval — Brian ${plan.approval.date}: “${plan.approval.words}”`
      : "Collected-plan approval — not yet requested.",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}
