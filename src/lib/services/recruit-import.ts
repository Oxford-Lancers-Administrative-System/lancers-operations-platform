import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";
import { requireGrant } from "@/lib/auth/guards";
import type { OperatorGrants } from "@/lib/auth/grants";
import { ADD_RECRUITS, mayViewRecruiting, mayViewRoster } from "@/lib/auth/roster-access";
import { recordAudit } from "./audit";
import { countAudienceJoinsForPersonIn, readEventsANewRecruitJoinsIn } from "./event-audience-rule";
import {
  IMPORT_TOO_LARGE_MESSAGE,
  readRecruitImport,
  refuseOversizedRecruitFile,
  type ParsedRecruitRow,
  type RecruitCandidateMatch,
  type RecruitDuplicateAnswers,
  type RecruitDuplicateCandidate,
  type RecruitImportApplied,
  type RecruitImportPlanResult,
  type RecruitImportTotals,
  type RecruitPlannedRow,
} from "./recruit-csv";
import { addRecruitIn } from "./recruitment-add-write";
import {
  readCandidateIdentitiesIn,
  type CandidateIdentity,
} from "./recruitment-candidate-identity";
import { findPersonCandidates, type PersonCandidate } from "./roster";
import { readCurrentSeasonIn } from "./seasons";

/**
 * The database half of the recruit import — LAN-487, the recruit counterpart
 * of `./roster-import.ts` (LAN-215), on the same mechanics: the file is read
 * and proposed without a write, each row asks `findPersonCandidates` (with
 * both of its emails) who it might already be, an unanswered possible
 * duplicate is refused at apply, and the apply rebuilds the plan inside its
 * own transaction and refuses unless the digest still matches. The file is
 * never stored; answers travel only through the rendered proposal.
 *
 * Each applicable row is written by `addRecruitIn` — the hand-add's own write,
 * shared with `/operate/recruitment/new` — so an imported recruit is exactly a
 * hand-added one: the recruit record, opt-in evidence and note, the welcome
 * cycle, and the audience group rule. The rule is on here on purpose (Brian,
 * 2026-10-07), unlike the roster import; the proposal says how many recruits
 * it would add to event audiences before anything is written.
 *
 * Guarded twice, page and service, by the May add recruits switch.
 */

export { IMPORT_TOO_LARGE_MESSAGE };

export const IMPORT_PLAN_MOVED_MESSAGE =
  "The recruits changed while you were reading this, so what would be written is no longer what " +
  "you were shown. Nothing has been changed — import the file again to see the current proposal.";

export const IMPORT_NOTHING_TO_APPLY_MESSAGE =
  "There is nothing to apply. Every row in that file is either already a recruit this season, " +
  "refused, or waiting on a duplicate answer.";

const IMPORT_PLAN_MOVED_RULE = "recruit_import_plan_moved";
const IMPORT_FILE_REFUSED_RULE = "recruit_import_file_refused";

const UNANSWERED_DUPLICATE_REASON = "Refused until the possible duplicate below is answered.";
const STALE_ANSWER_REASON =
  "That answer no longer matches a candidate on this row. Answer it again.";
const ALREADY_A_MEMBER_REASON =
  "Already holds a membership this season. A player is not a recruit, so nothing is written.";

export type { RecruitDuplicateAnswers, RecruitImportApplied, RecruitImportPlanResult };

interface ImportSeason {
  id: string;
  label: string;
}

const MATCH_WORDS: Readonly<Record<PersonCandidate["matchedOn"][number], RecruitCandidateMatch>> =
  Object.freeze({
    "given name": "first name",
    "family name": "last name",
    "known as": "known as",
    "college email": "college email",
    email: "personal email",
    phone: "mobile",
  });

const MATCH_ORDER: readonly RecruitCandidateMatch[] = Object.freeze([
  "first name",
  "last name",
  "known as",
  "college email",
  "personal email",
  "mobile",
]);

function orNull(value: string): string | null {
  return value === "" ? null : value;
}

function displayName(row: ParsedRecruitRow): string {
  const name = [row.cells.first_name, row.cells.last_name].filter(Boolean).join(" ");
  return name === "" ? "(no name)" : name;
}

async function candidatesFor(row: ParsedRecruitRow, season: ImportSeason) {
  return findPersonCandidates(
    {
      givenName: row.cells.first_name,
      familyName: orNull(row.cells.last_name),
      knownAs: orNull(row.cells.known_as),
      email: orNull(row.cells.personal_email),
      collegeEmail: orNull(row.cells.college_email),
      phone: orNull(row.cells.mobile),
    },
    season,
  );
}

/** The candidate as the seat may see it — `redactRecruitCandidates`' rules (LAN-423), on the roster check's shape. */
function toDuplicateCandidate(
  candidate: PersonCandidate,
  identity: CandidateIdentity,
  grants: OperatorGrants,
): RecruitDuplicateCandidate {
  const contact = mayViewRecruiting(grants, "recruit_person");
  const membership = mayViewRoster(grants, "membership");
  const recruitDetails = mayViewRecruiting(grants, "recruit_details");
  const matched = new Set(candidate.matchedOn.map((match) => MATCH_WORDS[match]));
  let shownIdentity = identity;
  if (identity.kind === "player" && !membership)
    shownIdentity = { ...identity, membershipStatus: "" };
  if (identity.kind === "recruit" && !recruitDetails)
    shownIdentity = { ...identity, prospectStatus: "" };
  return {
    personId: candidate.personId,
    displayName: candidate.familyName
      ? `${candidate.givenName} ${candidate.familyName}`
      : candidate.givenName,
    email: contact ? candidate.email : null,
    phone: contact ? candidate.phone : null,
    matchedOn: MATCH_ORDER.filter((match) => matched.has(match)),
    identity: shownIdentity,
  };
}

function holdsOneOfTheseContacts(candidate: PersonCandidate): boolean {
  return candidate.matchedOn.some(
    (match) => match === "email" || match === "college email" || match === "phone",
  );
}

/** One row, resolved against the club as it stands now. Never writes. */
async function planRow(
  tx: Tx,
  row: ParsedRecruitRow,
  season: ImportSeason,
  answers: RecruitDuplicateAnswers,
  grants: OperatorGrants,
): Promise<RecruitPlannedRow> {
  const base = {
    line: row.line,
    name: displayName(row),
    cells: row.cells,
    duplicate: null,
    matchedPersonId: null,
    resolvedOn: null,
    overridesExactMatch: false,
  };

  if (row.reasons.length > 0) return { ...base, outcome: "refused", reasons: row.reasons };

  const candidates = await candidatesFor(row, season);
  if (candidates.length === 0) return { ...base, outcome: "new", reasons: [] };

  const identities = await readCandidateIdentitiesIn(
    tx,
    candidates.map((candidate) => candidate.personId),
    season.id,
  );
  const identityOf = (personId: string): CandidateIdentity =>
    identities.get(personId) ?? { kind: "none" };

  // The person this row is, once known: a player is refused, a recruit is already there.
  const resolved = (
    personId: string,
    duplicate: RecruitPlannedRow["duplicate"],
  ): RecruitPlannedRow => {
    const identity = identityOf(personId);
    if (identity.kind === "player") {
      return { ...base, duplicate, outcome: "refused", reasons: [ALREADY_A_MEMBER_REASON] };
    }
    return {
      ...base,
      duplicate,
      outcome: identity.kind === "recruit" ? "already_recruit" : "existing",
      reasons: [],
      matchedPersonId: personId,
    };
  };

  // As on the roster: a mobile is single-owner, so a match to exactly one person is that person.
  const byPhone = candidates.filter((candidate) => candidate.matchedOn.includes("phone"));
  if (byPhone.length === 1) {
    const [person] = byPhone;
    return {
      ...resolved(person.personId, null),
      resolvedOn: toDuplicateCandidate(person, identityOf(person.personId), grants).matchedOn,
    };
  }

  const duplicate = {
    candidates: candidates.map((candidate) =>
      toDuplicateCandidate(candidate, identityOf(candidate.personId), grants),
    ),
  };
  const answer = answers[String(row.line)] ?? null;

  if (answer === null) {
    return { ...base, duplicate, outcome: "refused", reasons: [UNANSWERED_DUPLICATE_REASON] };
  }
  if (answer === "different") {
    return {
      ...base,
      duplicate,
      outcome: "new",
      reasons: [],
      overridesExactMatch: candidates.some(holdsOneOfTheseContacts),
    };
  }
  const chosen = candidates.find((candidate) => candidate.personId === answer);
  if (!chosen) return { ...base, duplicate, outcome: "refused", reasons: [STALE_ANSWER_REASON] };
  return resolved(chosen.personId, duplicate);
}

/** A fingerprint of what confirming would write (`./roster-import.ts`'s FNV-1a). */
function digestOf(rows: readonly RecruitPlannedRow[]): string {
  const canonical = rows
    .map((row) => `${row.line}|${row.outcome}|${row.matchedPersonId ?? ""}`)
    .join("\n");
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b + code, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

function isApplicable(row: RecruitPlannedRow): boolean {
  return row.outcome === "new" || row.outcome === "existing";
}

/** How many applicable rows the audience group rule would add to at least one approved event. */
async function countAudienceAddsIn(
  tx: Tx,
  seasonId: string,
  rows: readonly RecruitPlannedRow[],
): Promise<number> {
  const eventIds = await readEventsANewRecruitJoinsIn(tx, seasonId);
  if (eventIds.length === 0) return 0;
  let adds = 0;
  for (const row of rows) {
    if (row.outcome === "new") adds += 1;
    if (row.outcome === "existing" && row.matchedPersonId) {
      if ((await countAudienceJoinsForPersonIn(tx, eventIds, row.matchedPersonId)) > 0) adds += 1;
    }
  }
  return adds;
}

/** The whole file, resolved inside one transaction against one season. Writes nothing. */
async function buildRecruitImportPlan(
  tx: Tx,
  request: RecruitPlanRequest,
  grants: OperatorGrants,
  options: { countAudience: boolean },
): Promise<RecruitImportPlanResult> {
  const read = readRecruitImport({ csvText: request.csvText, fileName: request.fileName ?? null });
  if (!read.ok) return { ok: false, reason: read.reason };

  const current = await readCurrentSeasonIn(tx);
  const season = { id: current.id, label: current.label };
  const answers = request.duplicateAnswers ?? {};

  const rows: RecruitPlannedRow[] = [];
  for (const row of read.read.rows) {
    // Sequential: every row joins this one transaction.
    rows.push(await planRow(tx, row, season, answers, grants));
  }

  const totals: RecruitImportTotals = { new: 0, existing: 0, already_recruit: 0, refused: 0 };
  for (const row of rows) totals[row.outcome] += 1;

  return {
    ok: true,
    plan: {
      fileName: read.read.fileName,
      seasonId: season.id,
      seasonLabel: season.label,
      rowCount: rows.length,
      totals,
      rows,
      applicableCount: totals.new + totals.existing,
      unansweredLines: rows
        .filter((row) => row.reasons.includes(UNANSWERED_DUPLICATE_REASON))
        .map((row) => row.line),
      audienceAdds: options.countAudience ? await countAudienceAddsIn(tx, season.id, rows) : 0,
      digest: digestOf(rows),
    },
  };
}

export interface RecruitImportContext {
  seasonLabel: string;
  recruits: number;
}

export async function readRecruitImportContext(): Promise<RecruitImportContext> {
  await requireGrant(ADD_RECRUITS);
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const counts = await tx.query<{ total: string }>(
      `select count(*)::text as total from public.recruitment_prospects where season_id = $1::uuid`,
      [season.id],
    );
    return { seasonLabel: season.label, recruits: Number(counts.rows[0]?.total ?? 0) };
  });
}

export interface RecruitPlanRequest {
  csvText: string;
  fileName?: string | null;
  duplicateAnswers?: RecruitDuplicateAnswers;
}

/** What the file would do, against the club as it is now. Writes nothing. */
export async function planRecruitImport(
  request: RecruitPlanRequest,
): Promise<RecruitImportPlanResult> {
  const operator = await requireGrant(ADD_RECRUITS);

  const oversized = refuseOversizedRecruitFile(request.csvText);
  if (oversized !== null) return { ok: false, reason: oversized };

  return withTransaction((tx) =>
    buildRecruitImportPlan(tx, request, operator.grants, { countAudience: true }),
  );
}

export interface RecruitApplyRequest extends RecruitPlanRequest {
  /** The digest of the plan the operator confirmed. */
  digest: string;
}

/** Applies a confirmed proposal in one transaction; rebuilt and refused unless the digest still matches. */
export async function applyRecruitImport(
  request: RecruitApplyRequest,
): Promise<RecruitImportApplied> {
  const operator = await requireGrant(ADD_RECRUITS);

  const oversized = refuseOversizedRecruitFile(request.csvText);
  if (oversized !== null) {
    throw new ConstraintViolated(oversized, { rule: IMPORT_FILE_REFUSED_RULE });
  }

  return withTransaction(async (tx) => {
    const planned = await buildRecruitImportPlan(tx, request, operator.grants, {
      countAudience: false,
    });
    if (!planned.ok) {
      throw new ConstraintViolated(planned.reason, { rule: IMPORT_FILE_REFUSED_RULE });
    }
    const plan = planned.plan;

    if (plan.digest !== request.digest) {
      throw new InvalidTransition(IMPORT_PLAN_MOVED_MESSAGE, { rule: IMPORT_PLAN_MOVED_RULE });
    }
    if (plan.applicableCount === 0) {
      throw new ConstraintViolated(IMPORT_NOTHING_TO_APPLY_MESSAGE, {
        rule: IMPORT_FILE_REFUSED_RULE,
      });
    }

    let created = 0;
    let existing = 0;
    let welcomesQueued = 0;
    let addedToAudiences = 0;

    for (const row of plan.rows) {
      if (!isApplicable(row)) continue;
      const cells = row.cells;
      const result = await addRecruitIn(tx, {
        actorPersonId: operator.personId,
        seasonId: plan.seasonId,
        person: {
          givenName: cells.first_name,
          familyName: cells.last_name,
          mobile: cells.mobile,
          personalEmail: orNull(cells.personal_email),
          collegeEmail: orNull(cells.college_email),
        },
        decision:
          row.outcome === "existing"
            ? { kind: "link_existing", personId: row.matchedPersonId as string }
            : {
                kind: "create_new",
                // As on the roster import, no reason is asked; the line is the reason.
                overrideReason: row.overridesExactMatch
                  ? `Confirmed different in recruit import, line ${row.line}`
                  : null,
              },
        academic: {
          college: cells.college,
          matriculationYear: cells.matriculation_year,
          knownAs: cells.known_as,
          expectedGraduationYear: cells.expected_graduation_year,
          degreeField: cells.degree_field,
          dateOfBirth: cells.date_of_birth,
          emergencyGivenName: cells.emergency_first_name,
          emergencyFamilyName: cells.emergency_last_name,
          emergencyRelationship: cells.emergency_relationship,
          emergencyPhone: cells.emergency_phone,
          emergencyEmail: cells.emergency_email,
          optInEvidence: orNull(cells.opt_in),
          optInNote: cells.opt_in_note,
        },
        door: { source: "CSV import", door: "csv_import" },
      });

      if (row.outcome === "new") created += 1;
      else existing += 1;
      if (result.cycleDeclared) welcomesQueued += 1;
      if (result.audienceAdded > 0) addedToAudiences += 1;
    }

    await recordAudit(tx, {
      actorPersonId: operator.personId,
      action: "recruitment.imported",
      entityTable: "seasons",
      entityId: plan.seasonId,
      context: {
        issue: "LAN-487",
        fileName: request.fileName ?? null,
        rows: plan.rowCount,
        created,
        existing,
        alreadyRecruits: plan.totals.already_recruit,
        refused: plan.totals.refused,
        welcomesQueued,
        addedToAudiences,
        digest: plan.digest,
      },
    });

    return {
      created,
      existing,
      alreadyRecruits: plan.totals.already_recruit,
      refused: plan.totals.refused,
      welcomesQueued,
      addedToAudiences,
    };
  });
}
