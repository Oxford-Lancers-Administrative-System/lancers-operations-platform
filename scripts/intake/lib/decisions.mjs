// Source-scoped controlling-decision coverage for a mission intake ledger.
//
// The first ledger-driven intake proved that sweeping surfaces and actions is
// not the same as proving every controlling decision has exactly one
// authoritative home: D42, D66, D67 and D68 were only found when Brian reopened
// W4. This module makes the ledger carry that proof, and refuses to let an
// intake enter the workflow stage without it.
//
// The canonical truth is `state.json.decision_coverage`. The human-readable
// `decision-coverage.md` is rendered from it, never maintained beside it.

export const DECISION_DISPOSITIONS = [
  "workflow",
  "excluded",
  "delegated_to_mission_lead",
  "other_mission",
  "shared_cross_mission",
  "superseded",
];

const MISSION_ID = /^M-[A-Za-z0-9][A-Za-z0-9-]*$/;
const WORKFLOW_ID = /^W[1-9][0-9]*$/;
const DECISION_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";
const approved = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  nonEmpty(value.words) &&
  /^\d{4}-\d{2}-\d{2}$/.test(value.date ?? "");

const key = (sourceId, decisionId) => `${sourceId}:${decisionId}`;

/**
 * Resolve a reference to another decision. A bare `D5` is only usable when
 * exactly one source declares it; otherwise the reference must be written
 * `SRC-id:D5`. An unqualified reference to an id declared by several sources is
 * the source-less ambiguous decision the validator has to refuse.
 */
function resolveReference(reference, byId, byKey) {
  if (!nonEmpty(reference)) return { error: "empty" };
  if (reference.includes(":")) {
    const decision = byKey.get(reference);
    return decision ? { decision } : { error: "unknown" };
  }
  const candidates = byId.get(reference) ?? [];
  if (candidates.length === 0) return { error: "unknown" };
  if (candidates.length > 1) return { error: "ambiguous" };
  return { decision: candidates[0] };
}

/**
 * Validate `state.decision_coverage` against the frozen workflow inventory.
 * `workflowIds` is the frozen inventory; `missionId` is this mission.
 * Returns an array of human-readable errors — empty means the coverage proves
 * exactly one authoritative disposition for every controlling decision.
 *
 * @param {any} coverage
 * @param {{ workflowIds?: string[], missionId?: string }} [options]
 * @returns {string[]}
 */
export function validateDecisionCoverage(coverage, options = {}) {
  const { workflowIds = [], missionId = "" } = options;
  const errors = [];
  if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)) {
    return ["decision_coverage must be an object."];
  }
  if (!Array.isArray(coverage.sources) || coverage.sources.length === 0) {
    errors.push("decision_coverage.sources must list at least one controlling source.");
  }
  if (!Array.isArray(coverage.decisions)) {
    errors.push("decision_coverage.decisions must be an array.");
  }
  if (errors.length) return errors;

  const declared = new Map(); // source id -> Set of decision ids
  const sourceIds = new Set();
  for (const [index, source] of coverage.sources.entries()) {
    const where = `decision_coverage.sources[${index}]`;
    if (!nonEmpty(source?.id)) {
      errors.push(`${where}.id is required.`);
      continue;
    }
    if (sourceIds.has(source.id)) errors.push(`${where}.id "${source.id}" is duplicated.`);
    sourceIds.add(source.id);
    if (!nonEmpty(source.ref)) errors.push(`${where}.ref must be a durable reference.`);
    if (!nonEmpty(source.version)) {
      errors.push(`${where}.version must pin the version, date or SHA read.`);
    }
    if (!Array.isArray(source.decision_ids) || source.decision_ids.length === 0) {
      errors.push(`${where}.decision_ids must inventory the source's controlling decisions.`);
      continue;
    }
    const ids = new Set();
    for (const id of source.decision_ids) {
      if (!DECISION_ID.test(id ?? "")) {
        errors.push(`${where}.decision_ids contains an invalid decision id ${JSON.stringify(id)}.`);
        continue;
      }
      if (ids.has(id)) errors.push(`${where}.decision_ids lists ${id} twice.`);
      ids.add(id);
    }
    declared.set(source.id, ids);
  }

  // Index the dispositions, refusing a decision that cannot be attributed to
  // exactly one source-scoped controlling decision.
  const byKey = new Map();
  const byId = new Map();
  const homes = new Map(); // source-scoped key -> count of authoritative homes

  // A bare decision id declared by more than one source cannot identify one
  // decision, so every reference to it has to name its source.
  const ambiguous = new Set();
  const declaringSources = new Map();
  for (const ids of declared.values()) {
    for (const id of ids) {
      declaringSources.set(id, (declaringSources.get(id) ?? 0) + 1);
      if (declaringSources.get(id) > 1) ambiguous.add(id);
    }
  }

  for (const [index, decision] of coverage.decisions.entries()) {
    const where = `decision_coverage.decisions[${index}]`;
    if (!DECISION_ID.test(decision?.id ?? "")) {
      errors.push(`${where}.id must be a decision id such as D42.`);
      continue;
    }
    if (!nonEmpty(decision.source_id)) {
      errors.push(
        ambiguous.has(decision.id)
          ? `${decision.id} is a source-less ambiguous decision ID: several sources declare it, so it must name its source_id.`
          : `${where} must name the source_id that declares ${decision.id}.`,
      );
      continue;
    }
    if (!sourceIds.has(decision.source_id)) {
      errors.push(`${where} names unknown source "${decision.source_id}".`);
      continue;
    }
    if (!declared.get(decision.source_id).has(decision.id)) {
      errors.push(
        `${decision.id} is not declared by source "${decision.source_id}"; add it to that source's decision_ids or correct the source.`,
      );
      continue;
    }
    const id = key(decision.source_id, decision.id);
    homes.set(id, (homes.get(id) ?? 0) + 1);
    if (homes.get(id) > 1) {
      errors.push(
        `${decision.id} (${decision.source_id}) has duplicate authoritative homes; exactly one disposition may own it.`,
      );
      continue;
    }
    byKey.set(id, decision);
    byId.set(decision.id, [...(byId.get(decision.id) ?? []), decision]);
  }

  // Every declared controlling decision must be mapped.
  for (const [sourceId, ids] of declared) {
    for (const id of ids) {
      if (!byKey.has(key(sourceId, id))) {
        errors.push(
          `${id} (${sourceId}) is an unmapped decision: give it one of ${DECISION_DISPOSITIONS.join(", ")}.`,
        );
      }
    }
  }

  const workflows = new Set(workflowIds);
  for (const decision of byKey.values()) {
    const at = `${decision.id} (${decision.source_id})`;
    const disposition = decision.disposition;
    if (!DECISION_DISPOSITIONS.includes(disposition)) {
      errors.push(`${at} disposition must be one of ${DECISION_DISPOSITIONS.join(", ")}.`);
      continue;
    }
    if (!nonEmpty(decision.reason)) {
      errors.push(`${at} requires a reason recording why ${disposition} is the honest answer.`);
    }
    if (disposition !== "workflow" && nonEmpty(decision.workflow)) {
      errors.push(
        `${at} is ${disposition} but names owning workflow ${decision.workflow}; only a workflow disposition owns a Wn.`,
      );
    }
    if (decision.also_referenced_by !== undefined) {
      if (!Array.isArray(decision.also_referenced_by)) {
        errors.push(`${at} also_referenced_by must be an array of workflow ids.`);
      } else {
        for (const reference of decision.also_referenced_by) {
          if (!WORKFLOW_ID.test(reference ?? "") || !workflows.has(reference)) {
            errors.push(
              `${at} also_referenced_by names unknown workflow ${JSON.stringify(reference)}.`,
            );
          } else if (reference === decision.workflow) {
            errors.push(
              `${at} lists its owning workflow ${reference} as an additional reference, which duplicates its authoritative home.`,
            );
          }
        }
      }
    }

    switch (disposition) {
      case "workflow": {
        if (!WORKFLOW_ID.test(decision.workflow ?? "")) {
          errors.push(`${at} is owned by a workflow and must name one owning Wn.`);
        } else if (!workflows.has(decision.workflow)) {
          errors.push(
            `${at} names unknown workflow ${decision.workflow}; the frozen inventory holds ${[...workflows].join(", ") || "no workflows"}.`,
          );
        }
        break;
      }
      case "excluded":
      case "delegated_to_mission_lead": {
        if (!nonEmpty(decision.evidence)) {
          errors.push(
            `${at} is an unsupported ${disposition} classification: cite the source's own exclusion, handoff or delegation as evidence.`,
          );
        }
        break;
      }
      case "other_mission": {
        if (!MISSION_ID.test(decision.other_mission ?? "")) {
          errors.push(
            `${at} is an unsupported other_mission classification: name the owning mission as M-<slug>.`,
          );
        } else if (decision.other_mission === missionId) {
          errors.push(`${at} names this mission as the other mission.`);
        }
        if (!nonEmpty(decision.evidence)) {
          errors.push(`${at} is an unsupported other_mission classification: cite the seam.`);
        }
        break;
      }
      case "shared_cross_mission": {
        const owners = decision.shared_owners;
        if (!Array.isArray(owners) || owners.length < 2) {
          errors.push(
            `${at} is an unsupported shared_cross_mission classification: shared_owners must name at least two missions.`,
          );
        } else {
          if (owners.some((owner) => !MISSION_ID.test(owner ?? ""))) {
            errors.push(`${at} shared_owners must all match M-<slug>.`);
          }
          if (new Set(owners).size !== owners.length) {
            errors.push(`${at} shared_owners repeats a mission.`);
          }
          if (missionId && !owners.includes(missionId)) {
            errors.push(`${at} is shared but does not list this mission ${missionId} as an owner.`);
          }
        }
        if (!nonEmpty(decision.evidence)) {
          errors.push(
            `${at} is an unsupported shared_cross_mission classification: cite the shared dependency.`,
          );
        }
        break;
      }
      case "superseded": {
        if (!approved(decision.approval)) {
          errors.push(
            `${at} is a supersession without approval evidence: record Brian's exact words and date in approval.`,
          );
        }
        const resolved = resolveReference(decision.superseded_by, byId, byKey);
        if (resolved.error === "empty") {
          errors.push(`${at} must name the superseding decision in superseded_by.`);
        } else if (resolved.error === "unknown") {
          errors.push(`${at} superseded_by names unknown decision ${decision.superseded_by}.`);
        } else if (resolved.error === "ambiguous") {
          errors.push(
            `${at} superseded_by ${decision.superseded_by} is a source-less ambiguous decision ID; qualify it as <source-id>:${decision.superseded_by}.`,
          );
        } else if (resolved.decision.disposition === "superseded") {
          errors.push(
            `${at} is superseded by ${resolved.decision.id}, which is itself superseded and cannot be current authority.`,
          );
        }
        break;
      }
    }
  }

  return errors;
}

/**
 * Render the human-readable decision coverage from the canonical state. The
 * output is deterministic: sources keep their declared order, decisions are
 * ordered by their source's declared decision_ids.
 */
export function renderDecisionCoverage(state) {
  const coverage = state.decision_coverage;
  const lines = [
    `# Controlling-decision coverage — ${state.mission_id}`,
    "",
    "Generated by `npm run intake -- coverage --write` from `state.json`. Do not",
    "hand-edit: the canonical truth is `state.json.decision_coverage`, and",
    "`npm run intake -- status` fails when this file drifts from it.",
    "",
    "Every controlling decision resolves exactly once. A `workflow` disposition",
    "names the single owning `Wn`; other workflows may reference a decision",
    "without becoming additional owners.",
    "",
  ];

  const byKey = new Map();
  for (const decision of coverage.decisions) {
    byKey.set(`${decision.source_id}:${decision.id}`, decision);
  }

  const totals = new Map(DECISION_DISPOSITIONS.map((name) => [name, 0]));
  for (const decision of coverage.decisions) {
    totals.set(decision.disposition, (totals.get(decision.disposition) ?? 0) + 1);
  }

  lines.push("## Summary", "", "| Disposition | Decisions |", "| --- | --- |");
  for (const disposition of DECISION_DISPOSITIONS) {
    lines.push(`| \`${disposition}\` | ${totals.get(disposition) ?? 0} |`);
  }
  lines.push(`| **Total** | **${coverage.decisions.length}** |`, "");

  for (const source of coverage.sources) {
    lines.push(
      `## ${source.id}`,
      "",
      `- Reference: ${source.ref}`,
      `- Version read: ${source.version}`,
      `- Controlling decisions: ${source.decision_ids.length}`,
      "",
      "| Decision | Disposition | Authoritative home | Reason and evidence |",
      "| --- | --- | --- | --- |",
    );
    for (const id of source.decision_ids) {
      const decision = byKey.get(`${source.id}:${id}`);
      if (!decision) continue;
      lines.push(
        `| \`${id}\` | \`${decision.disposition}\` | ${cell(home(decision))} | ${cell(support(decision))} |`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function home(decision) {
  switch (decision.disposition) {
    case "workflow": {
      const references = decision.also_referenced_by ?? [];
      return references.length
        ? `${decision.workflow} (also referenced by ${references.join(", ")})`
        : decision.workflow;
    }
    case "other_mission":
      return decision.other_mission;
    case "shared_cross_mission":
      return (decision.shared_owners ?? []).join(", ");
    case "superseded":
      return `superseded by ${decision.superseded_by}`;
    case "delegated_to_mission_lead":
      return "Mission Lead";
    default:
      return "out of this mission";
  }
}

function support(decision) {
  const parts = [decision.reason];
  if (decision.evidence) parts.push(`Evidence: ${decision.evidence}`);
  if (decision.approval) {
    parts.push(`Brian ${decision.approval.date}: "${decision.approval.words}"`);
  }
  return parts.filter(Boolean).join(" ");
}

const cell = (value) =>
  String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ");
