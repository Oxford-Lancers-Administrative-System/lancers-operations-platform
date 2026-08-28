// Decision coverage maps known source decisions. Subject coverage maps the
// areas intake discovered, including gaps and mission seams.

export const SUBJECT_DISPOSITIONS = [
  "workflow",
  "invariant",
  "shared_cross_mission",
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

function validateSharedOwners(area, missionId) {
  const at = `${area.id} (${area.name})`;
  const owners = area.shared_owners;
  if (!Array.isArray(owners) || owners.length < 2) {
    return [`${at} shared_owners must name at least 2 missions.`];
  }
  const errors = [];
  if (owners.some((owner) => !validMission(owner))) {
    errors.push(`${at} shared_owners must contain only M-<slug> ids.`);
  }
  if (new Set(owners).size !== owners.length) errors.push(`${at} repeats a shared owner.`);
  if (missionId && !owners.includes(missionId)) {
    errors.push(`${at} must include this mission ${missionId}.`);
  }
  return errors;
}

/** Validate each discovered area's home; owner approvals judge completeness. */
export function validateSubjectCoverage(coverage, options = {}) {
  const { workflowIds = [], missionId = "" } = options;
  if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)) {
    return ["subject_coverage must be an object."];
  }
  if (!Array.isArray(coverage.areas) || coverage.areas.length === 0) {
    return ["subject_coverage.areas must inventory at least one subject area."];
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
      errors.push(`${area.id}.belongs must explain why the area belongs to this subject.`);
    }
    if (!SUBJECT_DISPOSITIONS.includes(area.disposition)) {
      errors.push(`${area.id}.disposition must be one of ${SUBJECT_DISPOSITIONS.join(", ")}.`);
      continue;
    }
    if (!nonEmpty(area.reason)) {
      errors.push(`${area.id}.reason must explain its ${area.disposition} disposition.`);
    }

    const at = `${area.id} (${area.name || "unnamed"})`;
    switch (area.disposition) {
      case "workflow":
        if (!validWorkflow(area.workflow, workflows)) {
          errors.push(`${at} must name one frozen workflow.`);
        }
        if (!["new", "retained", "modified"].includes(area.implementation)) {
          errors.push(`${at}.implementation must be new, retained or modified.`);
        }
        if (["retained", "modified"].includes(area.implementation) && !nonEmpty(area.baseline)) {
          errors.push(
            `${at} is ${area.implementation} and must cite the implemented main baseline.`,
          );
        }
        break;
      case "invariant":
        if (!nonEmpty(area.invariant)) errors.push(`${at} must state the binding invariant.`);
        break;
      case "shared_cross_mission":
        errors.push(...validateSharedOwners(area, missionId));
        if (!nonEmpty(area.current_side)) {
          errors.push(`${at} must state this mission's side.`);
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
            `${at}.independent_outcome must show the mission is walkable and acceptable alone.`,
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
    errors.push("applied amendments require Brian's approval of the collected plan.");
  }
  if (plan.approval !== null && plan.approval !== undefined && !approved(plan.approval)) {
    errors.push("amendment_plan.approval must retain Brian's exact words and approval date.");
  }
  return errors;
}

function destination(area) {
  switch (area.disposition) {
    case "workflow":
      return [area.workflow, area.implementation, area.baseline].filter(nonEmpty).join(" · ");
    case "invariant":
      return area.invariant;
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
    `# Subject coverage — ${state.mission_id}`,
    "",
    "Generated from `state.json` by `npm run intake -- subject --write`. Do not hand-edit.",
    "The map proves dispositions; Brian's approvals judge subject completeness.",
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
    "## Subject areas",
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
