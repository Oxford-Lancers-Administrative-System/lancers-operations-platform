/**
 * The mission packet: the pinned execution contract for one approved mission.
 *
 * A packet is drafted upstream from authoritative Notion, Linear and GitHub
 * records and approved by Brian before execution. This module is the
 * repository-local, mechanically-checked schema for it: explicit per-field
 * validators rather than a generic schema engine, in the same dependency-free
 * style as the fast-lane classifier. An invalid or unapproved packet must
 * fail closed — `validatePacket` returns every defect it can see, and the
 * mission-init event is refused unless the list is empty.
 *
 * Notion remains authoritative for product intent. The packet pins the
 * approved source versions; it never replaces the product authority.
 */

export const MISSION_ID_PATTERN = /^M-[A-Za-z0-9][A-Za-z0-9-]*$/;
export const PACKAGE_ID_PATTERN = /^WP-[A-Za-z0-9][A-Za-z0-9-]*$/;

/** The collision domains a work package may declare. Closed vocabulary. */
export const COLLISION_DOMAINS = [
  "schema-migrations",
  "identity-auth",
  "roster",
  "recruitment-onboarding",
  "events",
  "messaging",
  "attendance",
  "reporting",
  "agent-infrastructure",
];

export const RISK_CLASSES = ["low", "normal", "highest"];
export const VISUAL_CLASSES = ["ui", "nonvisual", "mixed"];
export const SOURCE_KINDS = ["notion", "linear", "github", "document"];

/**
 * A packet's readiness is a closed vocabulary, not an inference. Only an
 * `approved` packet may initialize a mission; `not_ready` is the Mission
 * Intake Agent's honest draft state and fails closed at mission-init.
 */
export const PACKET_STATUSES = ["approved", "not_ready"];

/**
 * Work that may travel the guarded autonomous merge route. Deliberately one
 * entry: well-defined standard application work. Everything else is
 * owner-gated by construction, so a packet cannot invent a wider class.
 */
export const AUTO_MERGE_CLASSES = ["standard-application"];

/**
 * Classes that stay with Brian in v1. A packet must not place any of these in
 * its auto-merge envelope, and the validator refuses one that tries.
 */
export const OWNER_GATED_CLASSES = [
  "schema-migration",
  "rls-auth-security",
  "secrets-credentials",
  "deployment-production-data",
  "whatsapp-external-configuration",
  "highest-risk",
  "visual-without-approval",
];

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";
const isStringArray = (value) => Array.isArray(value) && value.every(isNonEmptyString);

/**
 * Validate one mission packet. Returns every defect found; a packet is valid
 * only when the list is empty. Approval is a positive fact — a missing or
 * incomplete approval record is a defect, never a default.
 */
export function validatePacket(packet) {
  const errors = [];
  if (packet === null || typeof packet !== "object" || Array.isArray(packet)) {
    return ["The packet is not an object."];
  }

  if (!Number.isInteger(packet.packet_version) || packet.packet_version < 1) {
    errors.push("packet_version must be an integer >= 1.");
  }
  if (!isNonEmptyString(packet.mission_id) || !MISSION_ID_PATTERN.test(packet.mission_id)) {
    errors.push("mission_id must match M-<slug> (for example M-2026-08-20-pilot).");
  }
  if (!isNonEmptyString(packet.objective)) errors.push("objective is required.");
  if (!isStringArray(packet.non_goals)) {
    errors.push("non_goals must be an array of non-empty strings (it may be empty).");
  }

  const sourceIds = new Set();
  if (!Array.isArray(packet.sources) || packet.sources.length === 0) {
    errors.push("sources must name at least one authoritative source with a pinned version.");
  } else {
    for (const [index, source] of packet.sources.entries()) {
      const where = `sources[${index}]`;
      if (!isNonEmptyString(source?.id)) errors.push(`${where}.id is required.`);
      else if (sourceIds.has(source.id)) errors.push(`${where}.id "${source.id}" is duplicated.`);
      else sourceIds.add(source.id);
      if (!SOURCE_KINDS.includes(source?.kind)) {
        errors.push(`${where}.kind must be one of ${SOURCE_KINDS.join(", ")}.`);
      }
      if (!isNonEmptyString(source?.ref)) errors.push(`${where}.ref is required.`);
      if (!isNonEmptyString(source?.version)) {
        errors.push(`${where}.version is required — the packet pins source versions.`);
      }
    }
  }

  if (!Array.isArray(packet.requirements) || packet.requirements.length === 0) {
    errors.push("requirements must contain at least one entry.");
  } else {
    const requirementIds = new Set();
    for (const [index, requirement] of packet.requirements.entries()) {
      const where = `requirements[${index}]`;
      if (!isNonEmptyString(requirement?.id) || !/^REQ-[A-Za-z0-9-]+$/.test(requirement.id)) {
        errors.push(`${where}.id must match REQ-<slug>.`);
      } else if (requirementIds.has(requirement.id)) {
        errors.push(`${where}.id "${requirement.id}" is duplicated.`);
      } else {
        requirementIds.add(requirement.id);
      }
      if (!isNonEmptyString(requirement?.text)) errors.push(`${where}.text is required.`);
      if (!isNonEmptyString(requirement?.source_id) || !sourceIds.has(requirement.source_id)) {
        errors.push(`${where}.source_id must reference a declared source.`);
      }
    }
  }

  if (!Array.isArray(packet.decisions)) {
    errors.push("decisions must be an array (it may be empty).");
  } else {
    for (const [index, decision] of packet.decisions.entries()) {
      if (!isNonEmptyString(decision?.id) || !isNonEmptyString(decision?.text)) {
        errors.push(`decisions[${index}] needs id and text.`);
      }
    }
  }

  if (!PACKET_STATUSES.includes(packet.status)) {
    errors.push(`status must be one of ${PACKET_STATUSES.join(", ")}.`);
  }

  if (!isNonEmptyString(packet.baseline?.branch)) {
    errors.push("baseline.branch is required (the implementation baseline).");
  }
  if (!/^[0-9a-f]{40}$/.test(packet.baseline?.commit ?? "")) {
    errors.push(
      "baseline.commit must be the full 40-character SHA of main at packet approval — drift has no meaning without it.",
    );
  }

  if (!isStringArray(packet.gates?.owner) || !isStringArray(packet.gates?.external)) {
    errors.push("gates.owner and gates.external must be arrays of strings (they may be empty).");
  }

  const envelope = packet.merge_envelope;
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) {
    errors.push("merge_envelope is required.");
  } else {
    if (!Array.isArray(envelope.auto_merge_classes)) {
      errors.push("merge_envelope.auto_merge_classes must be an array.");
    } else {
      for (const cls of envelope.auto_merge_classes) {
        if (!AUTO_MERGE_CLASSES.includes(cls)) {
          errors.push(
            `merge_envelope.auto_merge_classes contains "${cls}", which is not an approved autonomous-merge class.`,
          );
        }
      }
    }
    if (!Array.isArray(envelope.owner_gated)) {
      errors.push("merge_envelope.owner_gated must be an array.");
    } else {
      for (const cls of OWNER_GATED_CLASSES) {
        if (!envelope.owner_gated.includes(cls)) {
          errors.push(
            `merge_envelope.owner_gated must retain "${cls}" — owner-gated classes cannot be dropped by a packet.`,
          );
        }
      }
    }
  }

  if (!isStringArray(packet.completion_evidence) || packet.completion_evidence.length === 0) {
    errors.push("completion_evidence must name at least one observable proof of completion.");
  }

  const approval = packet.approval;
  if (approval === null || typeof approval !== "object" || Array.isArray(approval)) {
    errors.push("approval is required — an unapproved packet cannot initialize a mission.");
  } else {
    if (!isNonEmptyString(approval.approved_by)) errors.push("approval.approved_by is required.");
    if (!isNonEmptyString(approval.date) || !/^\d{4}-\d{2}-\d{2}$/.test(approval.date)) {
      errors.push("approval.date must be an ISO date (YYYY-MM-DD).");
    }
    if (!isNonEmptyString(approval.evidence)) {
      errors.push("approval.evidence must record where the approval was given.");
    }
  }

  return errors;
}

/**
 * Validate one planned work package against the packet it executes.
 * Dependency-graph rules (existence, acyclicity) live in the plan validator
 * in state.mjs, which sees the whole plan; this checks the package itself.
 */
export function validatePackage(pkg, packet) {
  const errors = [];
  if (pkg === null || typeof pkg !== "object" || Array.isArray(pkg)) {
    return ["The work package is not an object."];
  }
  if (!isNonEmptyString(pkg.id) || !PACKAGE_ID_PATTERN.test(pkg.id)) {
    errors.push("A work package id must match WP-<slug> and stay stable across replans.");
  }
  if (!isNonEmptyString(pkg.title)) errors.push(`${pkg.id ?? "package"}: title is required.`);
  const requirementIds = new Set((packet?.requirements ?? []).map((entry) => entry.id));
  if (!Array.isArray(pkg.requirement_ids) || pkg.requirement_ids.length === 0) {
    errors.push(`${pkg.id ?? "package"}: requirement_ids must name at least one requirement.`);
  } else {
    for (const id of pkg.requirement_ids) {
      if (!requirementIds.has(id)) {
        errors.push(`${pkg.id}: requirement "${id}" is not in the approved packet.`);
      }
    }
  }
  if (!COLLISION_DOMAINS.includes(pkg.collision_domain)) {
    errors.push(
      `${pkg.id ?? "package"}: collision_domain must be one of ${COLLISION_DOMAINS.join(", ")}.`,
    );
  }
  if (typeof pkg.migration_owner !== "boolean") {
    errors.push(`${pkg.id ?? "package"}: migration_owner must be declared true or false.`);
  }
  if (!RISK_CLASSES.includes(pkg.risk_class)) {
    errors.push(`${pkg.id ?? "package"}: risk_class must be one of ${RISK_CLASSES.join(", ")}.`);
  }
  if (!VISUAL_CLASSES.includes(pkg.visual)) {
    errors.push(`${pkg.id ?? "package"}: visual must be one of ${VISUAL_CLASSES.join(", ")}.`);
  }
  if (!Array.isArray(pkg.depends_on) || !pkg.depends_on.every(isNonEmptyString)) {
    errors.push(`${pkg.id ?? "package"}: depends_on must be an array of package ids.`);
  }
  return errors;
}
