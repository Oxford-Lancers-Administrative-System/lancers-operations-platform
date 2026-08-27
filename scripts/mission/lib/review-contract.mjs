/**
 * The machine-generated contract one review or walker invocation must satisfy.
 *
 * LAN-179. Mission 4 cleared packages on prose. A reviewer wrote that no live
 * database or end-to-end HTTP check had been performed and the receipt was
 * still accepted; another package carried a static substitute because database
 * acquisition had been refused; the final fixture clearance was derived by the
 * Mission Lead rather than by a fresh reviewer at all. Each of those is the same
 * defect: what a review had to *do* was a sentence somebody wrote, so it could
 * be narrowed by whoever was inconvenienced by it.
 *
 * The contract is derived here instead — from durable mission state, the packet,
 * and the exact-head diff run through the checked-in classifiers in
 * `.github/mission-merge-rules.json`. `scripts/mission/lib/state.mjs` re-derives
 * it when the request event is appended and refuses any contract that differs,
 * exactly as it re-derives the merge receipt. That is what makes "the Lead may
 * add a diagnostic question but cannot remove a generated requirement" a fact
 * about the validator rather than an instruction in a skill file.
 *
 * Nothing here does I/O beyond reading the checked-in rules: every function is
 * pure so the same contract is produced by the CLI, by the validator, and by a
 * test with no repository at all.
 */

import crypto from "node:crypto";

import { globToRegExp } from "../../fast-lane/classify.mjs";
import { loadRules } from "../merge-gate.mjs";

/**
 * The capabilities a runtime can supply. A job names the ones it needs; the
 * broker reports the ones it proved; a clear receipt is refused when the second
 * set does not cover the first.
 */
export const REVIEW_CAPABILITIES = [
  "source-read",
  "dependencies",
  "database",
  "database-reset-seed",
  "application",
  "operator-session",
  "public-session",
  "browser-desktop",
  "browser-375",
  "transport-seam",
];

/**
 * How a job may honestly be proved.
 *
 * `static` is diff and source reading. `live` means the job ran against the
 * brokered database and application. `rendered` means it was also looked at in
 * a browser context whose width was measured. A receipt may always prove more
 * than the contract asks; it may never prove less.
 */
export const EVIDENCE_KINDS = ["static", "live", "rendered"];

const EVIDENCE_RANK = { static: 0, live: 1, rendered: 2 };

export const INVOCATION_ROLES = ["package-reviewer", "workflow-walker"];

/** The viewports a `rendered` job is proved in, and what each must measure. */
export const CONTRACT_VIEWPORTS = [
  { label: "desktop", width: 1280, exact: false },
  { label: "phone375", width: 375, exact: true },
];

const matches = (glob, file) => globToRegExp(glob).test(file);

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

/** Both names of a rename are judged, exactly as the merge gate judges them. */
function candidatePaths(files) {
  return (files ?? []).flatMap((entry) =>
    [entry?.previousPath, entry?.path].filter(isNonEmptyString),
  );
}

function intersect(files, globs) {
  const hits = new Set();
  for (const candidate of candidatePaths(files)) {
    if ((globs ?? []).some((glob) => matches(glob, candidate))) hits.add(candidate);
  }
  return [...hits].sort();
}

/**
 * What this diff touches, in the five terms the contract is built from.
 *
 * `sensitive` also folds in the merge gate's own prohibited and owner-approval
 * surfaces: a path the lane will not merge autonomously is, by construction, a
 * path a reviewer has to look at.
 */
/**
 * @typedef {{ status?: string, path?: string, previousPath?: string }} ChangedFile
 * @typedef {{ id: string, source: string, actor: string, scenario: string, actions: string[],
 *   assertions: string[], required_capabilities: string[], evidence: string }} ContractJob
 * @typedef {{ contract_version: number, role: string, mission_id: string | null,
 *   package_id?: string, head_sha: string, round: number, reviewer_required: boolean,
 *   classification?: Record<string, string[]>, scope?: string, capabilities: string[],
 *   jobs: ContractJob[] }} ReviewContract
 */

/** @param {ChangedFile[]} files @param {Record<string, any>} [rules] */
export function classifyReviewSurfaces(files, rules = loadRules()) {
  const contractRules = rules.reviewContract ?? {};
  const sensitive = new Set([
    ...intersect(files, contractRules.sensitiveSurfaces),
    ...intersect(
      files,
      (rules.prohibited ?? []).map((rule) => rule.path),
    ),
    ...intersect(
      files,
      (rules.ownerApprovalSurfaces ?? []).map((rule) => rule.path),
    ),
  ]);
  return {
    sensitive: [...sensitive].sort(),
    visual: intersect(files, rules.visualSurfaces),
    database: intersect(files, contractRules.databaseSurfaces),
    public: intersect(files, contractRules.publicSurfaces),
    transport: intersect(files, contractRules.transportSurfaces),
    evidence: intersect(files, contractRules.evidenceSurfaces),
  };
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

/**
 * The capability profile a package review needs, from its classification and
 * its declared visual class.
 *
 * The visual class is included deliberately: a package the packet calls `ui`
 * gets browser capabilities even when this particular head's diff happens to
 * touch no `.tsx`, because the thing under review is the rendered surface.
 */
function packageCapabilities(classification, visualClass) {
  const capabilities = new Set(["source-read"]);
  const rendered = visualClass !== "nonvisual" || classification.visual.length > 0;
  const live =
    classification.database.length > 0 ||
    classification.evidence.length > 0 ||
    classification.transport.length > 0 ||
    rendered;
  if (live) {
    capabilities.add("dependencies");
    capabilities.add("database");
    capabilities.add("database-reset-seed");
  }
  if (rendered) {
    capabilities.add("application");
    capabilities.add("operator-session");
    capabilities.add("browser-desktop");
    capabilities.add("browser-375");
  }
  if (classification.public.length > 0) {
    capabilities.add("application");
    capabilities.add("public-session");
  }
  if (classification.transport.length > 0) capabilities.add("transport-seam");
  return sortedUnique([...capabilities]);
}

const job = (fields) => ({
  actor: "reviewer",
  scenario: "synthetic",
  required_capabilities: [],
  evidence: "static",
  ...fields,
});

/**
 * Every job a package review must execute, in a stable order.
 *
 * The requirement jobs come from the package's own `requirement_ids` resolved
 * against the packet, so a review's scope is the requirements the plan said the
 * package delivers — not a summary of them written at dispatch time.
 */
function packageJobs({ pkg, packet, classification, capabilities, findingIds }) {
  const jobs = [];
  const live = capabilities.includes("database");
  const rendered = capabilities.includes("browser-375");
  const requirements = new Map(
    (packet?.requirements ?? []).map((requirement) => [requirement.id, requirement]),
  );

  for (const requirementId of pkg.requirement_ids ?? []) {
    const requirement = requirements.get(requirementId);
    jobs.push(
      job({
        id: `RJ-req-${requirementId}`,
        source: `packet requirement ${requirementId}`,
        assertions: [requirement?.text ?? `${requirementId} is delivered by ${pkg.id}.`],
        actions: live
          ? ["Exercise the requirement against the brokered database and application."]
          : ["Read the diff and the tests that cover the requirement."],
        required_capabilities: live ? ["source-read", "database"] : ["source-read"],
        evidence: live ? "live" : "static",
      }),
    );
  }

  for (const file of classification.sensitive) {
    jobs.push(
      job({
        id: `RJ-sensitive-${file}`,
        source: "mission-merge-rules reviewContract.sensitiveSurfaces",
        assertions: [
          `${file} keeps its authorization, privacy, integrity and production boundary intact.`,
        ],
        actions: [`Review the exact-head change to ${file} against its controlling authority.`],
        required_capabilities: ["source-read"],
        evidence: "static",
      }),
    );
  }

  for (const file of classification.evidence) {
    jobs.push(
      job({
        id: `RJ-evidence-${file}`,
        source: "mission-merge-rules reviewContract.evidenceSurfaces",
        assertions: [
          `The states ${file} produces are present and are the states later proof is measured against.`,
        ],
        actions: [`Load ${file} into the brokered database and observe the states it claims.`],
        required_capabilities: ["source-read", "database", "database-reset-seed"],
        evidence: "live",
      }),
    );
  }

  if (rendered) {
    for (const viewport of CONTRACT_VIEWPORTS) {
      jobs.push(
        job({
          id: `RJ-render-${viewport.label}`,
          source: "ADR 0020 visual review",
          assertions: [
            `Every approved state renders at ${viewport.label} and matches the contract's structure and copy.`,
          ],
          actions: [
            `Render each approved state at ${viewport.label} in the brokered application and compare it with the UX contract.`,
          ],
          required_capabilities: sortedUnique([
            "source-read",
            "application",
            "operator-session",
            viewport.label === "phone375" ? "browser-375" : "browser-desktop",
          ]),
          evidence: "rendered",
        }),
      );
    }
  }

  if (capabilities.includes("public-session")) {
    jobs.push(
      job({
        id: "RJ-public-answer",
        source: "mission-merge-rules reviewContract.publicSurfaces",
        actor: "public",
        assertions: ["A valid public link answers exactly once, without a session."],
        actions: ["Open the public link in a credential-free context and answer."],
        required_capabilities: ["application", "public-session", "database"],
        evidence: "live",
      }),
      job({
        id: "RJ-public-scanner",
        source: "mission-merge-rules reviewContract.publicSurfaces",
        actor: "public",
        assertions: ["A link-scanner style prefetch does not consume or alter the answer."],
        actions: ["Issue an unauthenticated prefetch of the public link and re-read the state."],
        required_capabilities: ["application", "public-session", "database"],
        evidence: "live",
      }),
      job({
        id: "RJ-public-reload",
        source: "mission-merge-rules reviewContract.publicSurfaces",
        actor: "public",
        assertions: ["Reloading an answered link neither errors nor double-answers."],
        actions: ["Reload the answered public link and observe the recorded state."],
        required_capabilities: ["application", "public-session", "database"],
        evidence: "live",
      }),
    );
  }

  if (capabilities.includes("transport-seam")) {
    jobs.push(
      job({
        id: "RJ-transport-seam",
        source: "mission-merge-rules reviewContract.transportSurfaces",
        assertions: ["Delivery crosses the local transport seam and records what it sent."],
        actions: ["Send through the local transport and read the recorded delivery rows."],
        required_capabilities: ["application", "database", "transport-seam"],
        evidence: "live",
      }),
    );
  }

  for (const findingId of findingIds ?? []) {
    jobs.push(
      job({
        id: `RJ-finding-${findingId}`,
        source: `blocking finding ${findingId}`,
        assertions: [`${findingId} is corrected and a named regression test notices its return.`],
        actions: [`Inspect the correction delta for ${findingId} and its regression proof.`],
        required_capabilities: ["source-read"],
        evidence: live ? "live" : "static",
      }),
    );
  }

  return jobs;
}

/**
 * Canonical JSON: object keys sorted at every depth, so two structurally equal
 * contracts hash identically regardless of how they were built.
 */
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

/** @param {unknown} contract */
export function contractHash(contract) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(contract)))
    .digest("hex");
}

/**
 * The contract for one package review at one exact head.
 *
 * `reviewer_required` is false only when the sensitive, rendered and evidence
 * union is empty — the deterministic-clearance case LAN-148 introduced and this
 * ticket keeps. Its classifier output is journaled either way, so a later reader
 * can see what the machine concluded rather than that somebody decided.
 */
/**
 * @param {{ state: Record<string, any>, packageId: string, headSha: string, round?: number,
 *   files?: ChangedFile[], rules?: Record<string, any>, findingIds?: string[] }} input
 * @returns {ReviewContract}
 */
export function buildPackageReviewContract({
  state,
  packageId,
  headSha,
  round = 1,
  files = [],
  rules = loadRules(),
  findingIds = [],
}) {
  const pkg = state?.packages?.[packageId];
  if (!pkg) throw new Error(`No planned package ${packageId}.`);
  const classification = classifyReviewSurfaces(files, rules);
  const capabilities = packageCapabilities(classification, pkg.visual);
  const jobs = packageJobs({
    pkg,
    packet: state.packet,
    classification,
    capabilities,
    findingIds: [...(findingIds ?? [])].sort(),
  });
  const reviewerRequired =
    classification.sensitive.length > 0 ||
    classification.visual.length > 0 ||
    classification.evidence.length > 0 ||
    pkg.visual !== "nonvisual";
  return {
    contract_version: 1,
    role: "package-reviewer",
    mission_id: state.packet?.mission_id ?? null,
    package_id: packageId,
    head_sha: headSha,
    round,
    reviewer_required: reviewerRequired,
    classification,
    capabilities,
    jobs,
  };
}

/**
 * Stable ids for the packet's completion evidence.
 *
 * Approved packets record completion evidence as plain strings, and they are
 * immutable once merged. Ordinal ids derived from position give the walker a
 * job set with names without asking any existing packet to change: `CE-001` is
 * the first item of `completion_evidence`, and the text is carried through
 * verbatim so the criterion still reads as Brian wrote it.
 */
/** @param {Record<string, any> | null | undefined} packet */
export function completionCriteria(packet) {
  const evidence = Array.isArray(packet?.completion_evidence) ? packet.completion_evidence : [];
  const criteria = evidence.map((text, index) => ({
    id: `CE-${String(index + 1).padStart(3, "0")}`,
    text: typeof text === "string" ? text : JSON.stringify(text),
  }));
  const workflows = Array.isArray(packet?.workflow_matrix) ? packet.workflow_matrix : [];
  for (const entry of workflows) {
    if (!isNonEmptyString(entry?.id)) continue;
    criteria.push({
      id: `WF-${entry.id}`,
      text: isNonEmptyString(entry.name)
        ? `${entry.id}: ${entry.name}`
        : `Workflow ${entry.id} runs end to end on the integrated head.`,
    });
  }
  return criteria;
}

/** Every capability an integrated walk needs. A walk is never partly equipped. */
export const WALKER_CAPABILITIES = sortedUnique([
  "source-read",
  "dependencies",
  "database",
  "database-reset-seed",
  "application",
  "operator-session",
  "public-session",
  "browser-desktop",
  "browser-375",
]);

/**
 * The complete mission job set for one integrated walk.
 *
 * `affectedJobIds` narrows it to a targeted re-walk. Narrowing is legitimate
 * only from finding-to-job lineage, which the state validator checks against
 * the blocked smoke's findings; this function refuses an id the packet does not
 * define so a typo cannot silently shrink the walk.
 */
/**
 * @param {{ state: Record<string, any>, headSha: string, affectedJobIds?: string[] | null }} input
 * @returns {ReviewContract}
 */
export function buildWalkerContract({ state, headSha, affectedJobIds = null }) {
  const criteria = completionCriteria(state?.packet);
  if (criteria.length === 0) {
    throw new Error("The packet records no completion evidence to walk.");
  }
  const known = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  let selected = criteria;
  if (affectedJobIds) {
    const wanted = sortedUnique(affectedJobIds);
    const unknown = wanted.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new Error(
        `A targeted re-walk names ${unknown.join(", ")}, which the packet's completion evidence does not define.`,
      );
    }
    if (wanted.length === 0) {
      throw new Error("A targeted re-walk names at least one affected criterion.");
    }
    selected = criteria.filter((criterion) => wanted.includes(criterion.id));
  }
  return {
    contract_version: 1,
    role: "workflow-walker",
    mission_id: state.packet?.mission_id ?? null,
    head_sha: headSha,
    round: affectedJobIds ? 2 : 1,
    scope: affectedJobIds ? "targeted-re-walk" : "complete",
    reviewer_required: true,
    capabilities: WALKER_CAPABILITIES,
    jobs: selected.map((criterion) =>
      job({
        id: criterion.id,
        source: "packet completion_evidence",
        actor: "walker",
        assertions: [criterion.text],
        actions: [`Execute the mission journey that proves: ${criterion.text}`],
        required_capabilities: ["application", "database", "operator-session"],
        evidence: "live",
      }),
    ),
  };
}

/**
 * Phrases a receipt cannot use to describe a job it says passed.
 *
 * Every one of these is transcribed from a Mission 4 receipt that was accepted.
 * They are matched on the executed-actions text because that is where the
 * substitution actually appeared — the verdict field said "clear" throughout.
 */
const SUBSTITUTIONS = [
  { label: "not performed", pattern: /\bnot\s+performed\b/i },
  { label: "not run", pattern: /\bnot\s+(?:been\s+)?(?:run|executed|exercised|attempted)\b/i },
  {
    label: "having had no live, HTTP, browser or database proof",
    pattern: /\bno\s+(?:live|end[- ]to[- ]end|http|browser|database|runtime)\b/i,
  },
  {
    label: "blocked by capacity — a port, lease, slot or stack that was busy, forbidden or refused",
    pattern:
      /\b(?:port|lease|slot|capacity|stack|database|environment)\b[^.]{0,48}\b(?:unavailable|occupied|forbidden|refused|denied|busy|in use)\b/i,
  },
  {
    label: "skipped, omitted or deferred",
    pattern: /\b(?:skipped|omitted|deferred|could\s+not|unable\s+to|had\s+to\s+be\s+dropped)\b/i,
  },
  {
    label: "static reasoning standing in for the job",
    pattern:
      /\b(?:static|desk|paper)\b[^.]{0,32}\b(?:substitute|substituted|reasoning|only|instead|in\s+place)\b/i,
  },
  {
    label: "a seed or scenario state that was missing",
    pattern: /\b(?:seed|scenario|fixture)\b[^.]{0,32}\b(?:missing|absent|not\s+present)\b/i,
  },
  {
    label: "reusing an implementer's or the owner's evidence",
    pattern:
      /\breus(?:ed|ing)\b[^.]{0,32}\b(?:implementer|implementation|worker|owner|Brian|walkthrough)\b/i,
  },
];

function viewportDefects(entry, jobId) {
  const defects = [];
  const measured = Array.isArray(entry.viewports) ? entry.viewports : [];
  const wanted = jobId.endsWith("phone375")
    ? CONTRACT_VIEWPORTS.filter((viewport) => viewport.label === "phone375")
    : CONTRACT_VIEWPORTS.filter((viewport) => viewport.label === "desktop");
  for (const viewport of wanted) {
    const seen = measured.find((candidate) => candidate?.label === viewport.label);
    if (!seen) {
      defects.push(`${jobId}: no ${viewport.label} browser context was measured.`);
      continue;
    }
    const width = seen.measured_width;
    if (!Number.isInteger(width) || width < 1) {
      defects.push(
        `${jobId}: ${viewport.label} records no measured width read back from the browser.`,
      );
      continue;
    }
    const ok = viewport.exact ? width === viewport.width : width >= viewport.width;
    if (!ok) {
      defects.push(
        `${jobId}: the ${viewport.label} context measured ${width}px, not ${
          viewport.exact ? `${viewport.width}px` : `at least ${viewport.width}px`
        }.`,
      );
    }
    if (!isNonEmptyString(seen.screenshot)) {
      defects.push(`${jobId}: the ${viewport.label} context records no screenshot.`);
    }
  }
  return defects;
}

/**
 * Whether the receipt's job results honestly discharge the contract.
 *
 * Set equality first — an omitted job is the failure this exists to stop, and
 * an extra one means the receipt was written against a different contract. Then
 * each result is checked against the job's own evidence kind and capability
 * needs, against what the runtime actually proved ready, and against the
 * substitution vocabulary above.
 */
/**
 * @param {Record<string, any>} receipt
 * @param {ReviewContract} contract
 * @param {string[] | null} [readyCapabilities]
 * @returns {string[]}
 */
export function jobResultDefects(receipt, contract, readyCapabilities = null) {
  const defects = [];
  const results = Array.isArray(receipt?.job_results) ? receipt.job_results : null;
  if (!results) {
    return [
      "A reviewer or walker receipt records `job_results`: one entry per contract job, each with `job_id`, `result`, `executed`, `assertion_result`, `evidence`, and `evidence_kind`.",
    ];
  }
  const required = contract.jobs.map((entry) => entry.id);
  const seen = results.map((entry) => entry?.job_id);
  const missing = required.filter((id) => !seen.includes(id));
  const unknown = seen.filter((id) => !required.includes(id));
  const duplicated = seen.filter((id, index) => seen.indexOf(id) !== index);
  if (missing.length > 0) {
    defects.push(
      `The contract's jobs ${missing.join(", ")} have no result. A clear result requires every contract job, not a subset.`,
    );
  }
  if (unknown.length > 0) {
    defects.push(`${unknown.join(", ")} is not a job in this contract.`);
  }
  if (duplicated.length > 0) {
    defects.push(`${sortedUnique(duplicated).join(", ")} is reported more than once.`);
  }

  const byId = new Map(contract.jobs.map((entry) => [entry.id, entry]));
  for (const entry of results) {
    const definition = byId.get(entry?.job_id);
    if (!definition) continue;
    const id = definition.id;
    if (!["pass", "block"].includes(entry.result)) {
      defects.push(`${id}: result is "pass" or "block".`);
    }
    for (const field of ["executed", "assertion_result", "evidence"]) {
      if (!isNonEmptyString(entry[field])) {
        defects.push(`${id}: records \`${field}\`.`);
      }
    }
    if (!EVIDENCE_KINDS.includes(entry.evidence_kind)) {
      defects.push(`${id}: evidence_kind is one of ${EVIDENCE_KINDS.join(", ")}.`);
    } else if (EVIDENCE_RANK[entry.evidence_kind] < EVIDENCE_RANK[definition.evidence]) {
      defects.push(
        `${id}: the contract requires ${definition.evidence} evidence; the receipt offers ${entry.evidence_kind}. Missing capacity is a waiting runtime, never a weaker proof.`,
      );
    }
    const narrative = [entry.executed, entry.assertion_result, entry.evidence]
      .filter(isNonEmptyString)
      .join(" — ");
    if (entry.result === "pass") {
      const substitution = SUBSTITUTIONS.find(({ pattern }) => pattern.test(narrative));
      if (substitution) {
        defects.push(
          `${id}: a passing job cannot be described as ${substitution.label}. Record it blocked, or wait for the capability.`,
        );
      }
    }
    if (definition.evidence !== "static" && !Array.isArray(entry.scenarios)) {
      defects.push(`${id}: names the synthetic scenario identifiers it ran against.`);
    }
    if (definition.evidence === "rendered") {
      defects.push(...viewportDefects(entry, id));
    }
    if (Array.isArray(readyCapabilities)) {
      const unmet = (definition.required_capabilities ?? []).filter(
        (capability) => !readyCapabilities.includes(capability),
      );
      if (unmet.length > 0) {
        defects.push(
          `${id}: the runtime never proved ${unmet.join(", ")} ready, so this job could not have been executed there.`,
        );
      }
    }
  }

  const blocked = results.filter((entry) => entry?.result === "block").map((entry) => entry.job_id);
  if (receipt.result === "clear" && blocked.length > 0) {
    defects.push(`${blocked.join(", ")} is blocked; the receipt cannot be clear.`);
  }
  if (receipt.result === "blocked") {
    const findings = Array.isArray(receipt.findings) ? receipt.findings : [];
    if (findings.length === 0) {
      defects.push("A blocked receipt names its findings.");
    }
    const covered = new Set(findings.flatMap((finding) => finding?.affected_jobs ?? []));
    for (const id of blocked) {
      if (!covered.has(id)) {
        defects.push(
          `${id} is blocked but no finding names it in \`affected_jobs\`; the finding-to-job lineage is what a targeted re-walk is derived from.`,
        );
      }
    }
    for (const finding of findings) {
      if (!isNonEmptyString(finding?.id)) defects.push("Every finding carries a stable id.");
      if (!Array.isArray(finding?.affected_jobs) || finding.affected_jobs.length === 0) {
        defects.push(`Finding ${finding?.id ?? "(unidentified)"} names the jobs it affects.`);
      }
    }
  }
  return defects;
}
