import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guards";
import { recordAudit } from "./audit";
import {
  IMPORT_TOO_LARGE_MESSAGE,
  readRosterImport,
  refuseOversizedRosterFile,
  type DuplicateAnswers,
  type ImportColumn,
  type ParsedRosterRow,
  type RosterDuplicateCandidate,
  type RosterImportApplied,
  type RosterImportPlanResult,
  type RosterImportTotals,
  type RosterPlannedRow,
} from "./roster-csv";
import {
  enterReturningPlayer,
  findPersonCandidates,
  resolveOpenSeason,
  type OpenSeason,
  type PersonCandidate,
} from "./roster";

/**
 * The database half of the roster's CSV import — LAN-215, `W1`.
 * `./roster-csv.ts` decides what a row's own shape means; this module asks
 * the roster "who might this already be" and, once confirmed, writes, via
 * `roster.ts`'s `enterReturningPlayer` (reused, never duplicated — `entry`
 * is `'returning'` for both `new` and `carried_forward`; `college`/
 * `matriculation_year` are written only for `new`). Guarded twice — page and
 * service — by `requireCapability("roster_bulk_import")`. `DuplicateAnswers`
 * keys a line to `"different"` or a candidate's `personId`, travels only
 * through the rendered proposal, never stored; an unanswered row is refused
 * at apply. `buildRosterImportPlan` is rebuilt inside the apply transaction
 * and refused unless its digest still matches (`event-import.ts`'s
 * `applySeasonImport` precedent).
 */

export { IMPORT_TOO_LARGE_MESSAGE };

export const IMPORT_PLAN_MOVED_MESSAGE =
  "The roster changed while you were reading this, so what would be written is no longer what " +
  "you were shown. Nothing has been changed — import the file again to see the current proposal.";

export const IMPORT_NOTHING_TO_APPLY_MESSAGE =
  "There is nothing to apply. Every row in that file is either already on this season's roster, " +
  "refused, or waiting on a duplicate answer.";

const IMPORT_PLAN_MOVED_RULE = "roster_import_plan_moved";
const IMPORT_FILE_REFUSED_RULE = "roster_import_file_refused";

const UNANSWERED_DUPLICATE_REASON = "Refused until the possible duplicate below is answered.";
const STALE_ANSWER_REASON =
  "That answer no longer matches a candidate on this row — the roster moved. Answer it again.";

// The plan's shapes are declared in `./roster-csv.ts` (pure); re-exported here so the whole contract is in one place.

export type { DuplicateAnswers, RosterImportApplied, RosterImportPlanResult } from "./roster-csv";

function answerFor(answers: DuplicateAnswers, line: number): string | null {
  return answers[String(line)] ?? null;
}

async function candidatesFor(row: ParsedRosterRow): Promise<PersonCandidate[]> {
  return findPersonCandidates({
    givenName: row.firstName ?? "",
    familyName: row.lastName,
    email: row.personalEmail,
    phone: row.mobile,
  });
}

function toDuplicateCandidate(candidate: PersonCandidate): RosterDuplicateCandidate {
  return {
    personId: candidate.personId,
    displayName: candidate.familyName
      ? `${candidate.givenName} ${candidate.familyName}`
      : candidate.givenName,
    email: candidate.email,
    phone: candidate.phone,
    matchedOn: candidate.matchedOn,
    currentMembershipSeasonLabel: candidate.currentMembership?.seasonLabel ?? null,
  };
}

function cellsOf(row: ParsedRosterRow): Readonly<Record<ImportColumn, string>> {
  return Object.freeze({
    first_name: row.firstName ?? row.rawCells.first_name,
    last_name: row.lastName ?? row.rawCells.last_name,
    mobile: row.mobile ?? row.rawCells.mobile,
    personal_email: row.personalEmail ?? row.rawCells.personal_email,
    college: row.college ?? row.rawCells.college,
    matriculation_year:
      row.matriculationYear !== null
        ? String(row.matriculationYear)
        : row.rawCells.matriculation_year,
  });
}

function displayName(row: ParsedRosterRow): string {
  if (row.firstName && row.lastName) return `${row.firstName} ${row.lastName}`;
  if (row.firstName) return row.firstName;
  if (row.lastName) return row.lastName;
  return "(no name)";
}

/** One row, resolved against the roster as it stands now. Never writes. A row already shape-refused is returned as-is. */
async function planRow(
  row: ParsedRosterRow,
  season: OpenSeason,
  answers: DuplicateAnswers,
): Promise<RosterPlannedRow> {
  const cells = cellsOf(row);
  const name = displayName(row);

  if (row.reasons.length > 0) {
    return {
      line: row.line,
      outcome: "refused",
      name,
      cells,
      reasons: row.reasons,
      duplicate: null,
      matchedPersonId: null,
    };
  }

  const candidates = await candidatesFor(row);

  if (candidates.length === 0) {
    return {
      line: row.line,
      outcome: "new",
      name,
      cells,
      reasons: [],
      duplicate: null,
      matchedPersonId: null,
    };
  }

  // A phone match is a confirmed identity, not a "possible" one — a mobile number is single-owner (W1).
  const confirmedByPhone = candidates.filter((candidate) => candidate.matchedOn.includes("phone"));
  if (confirmedByPhone.length === 1) {
    const [confirmed] = confirmedByPhone;
    return confirmed.currentMembership
      ? {
          line: row.line,
          outcome: "unchanged",
          name,
          cells,
          reasons: [],
          duplicate: null,
          matchedPersonId: confirmed.personId,
        }
      : {
          line: row.line,
          outcome: "carried_forward",
          name,
          cells,
          reasons: [],
          duplicate: null,
          matchedPersonId: confirmed.personId,
        };
  }

  const answer = answerFor(answers, row.line);
  const duplicateView = { candidates: candidates.map(toDuplicateCandidate) };

  if (answer === null) {
    return {
      line: row.line,
      outcome: "refused",
      name,
      cells,
      reasons: [UNANSWERED_DUPLICATE_REASON],
      duplicate: duplicateView,
      matchedPersonId: null,
    };
  }

  if (answer === "different") {
    return {
      line: row.line,
      outcome: "new",
      name,
      cells,
      reasons: [],
      duplicate: duplicateView,
      matchedPersonId: null,
    };
  }

  const chosen = candidates.find((candidate) => candidate.personId === answer);
  if (!chosen) {
    return {
      line: row.line,
      outcome: "refused",
      name,
      cells,
      reasons: [STALE_ANSWER_REASON],
      duplicate: duplicateView,
      matchedPersonId: null,
    };
  }

  if (chosen.currentMembership) {
    return {
      line: row.line,
      outcome: "unchanged",
      name,
      cells,
      reasons: [],
      duplicate: duplicateView,
      matchedPersonId: chosen.personId,
    };
  }

  return {
    line: row.line,
    outcome: "carried_forward",
    name,
    cells,
    reasons: [],
    duplicate: duplicateView,
    matchedPersonId: chosen.personId,
  };
}

/** A fingerprint of what confirming would write (FNV-1a, `event-csv.ts`'s idiom) — catches the roster moving between read and apply. */
function digestOf(rows: readonly RosterPlannedRow[]): string {
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

/** The whole file, resolved inside one transaction so every row reads one consistent season. Writes nothing. */
async function buildRosterImportPlan(
  tx: Tx,
  csvText: string,
  fileName: string | null,
  answers: DuplicateAnswers,
): Promise<RosterImportPlanResult> {
  const read = readRosterImport({ csvText, fileName });
  if (!read.ok) return { ok: false, reason: read.reason };

  const season = await resolveOpenSeason(tx);

  const rows: RosterPlannedRow[] = [];
  for (const row of read.read.rows) {
    // Sequential, not Promise.all: findPersonCandidates opens/joins one transaction per row.
    rows.push(await planRow(row, season, answers));
  }

  const totals: RosterImportTotals = { new: 0, carried_forward: 0, unchanged: 0, refused: 0 };
  for (const row of rows) totals[row.outcome] += 1;

  const unansweredLines = rows
    .filter((row) => row.outcome === "refused" && row.duplicate !== null)
    .map((row) => row.line);

  return {
    ok: true,
    plan: {
      fileName: read.read.fileName,
      seasonId: season.id,
      seasonLabel: season.label,
      rowCount: rows.length,
      totals,
      rows,
      applicableCount: totals.new + totals.carried_forward,
      unansweredLines,
      digest: digestOf(rows),
    },
  };
}

export interface RosterImportContext {
  seasonLabel: string;
  onRoster: number;
  onboarding: number;
}

export async function readRosterImportContext(): Promise<RosterImportContext> {
  await requireCapability("roster_bulk_import");

  return withTransaction(async (tx) => {
    const season = await resolveOpenSeason(tx);
    const counts = await tx.query<{ total: string; onboarding: string }>(
      `select count(*)::text as total,
              count(*) filter (where status = 'onboarding')::text as onboarding
         from public.season_memberships
        where season_id = $1::uuid`,
      [season.id],
    );
    return {
      seasonLabel: season.label,
      onRoster: Number(counts.rows[0]?.total ?? 0),
      onboarding: Number(counts.rows[0]?.onboarding ?? 0),
    };
  });
}

export interface RosterPlanRequest {
  csvText: string;
  fileName?: string | null;
  duplicateAnswers?: DuplicateAnswers;
}

/** What the file would do, against the roster as it is now. Writes nothing — abandoning costs nothing. */
export async function planRosterImport(
  request: RosterPlanRequest,
): Promise<RosterImportPlanResult> {
  await requireCapability("roster_bulk_import");

  const oversized = refuseOversizedRosterFile(request.csvText);
  if (oversized !== null) return { ok: false, reason: oversized };

  return withTransaction((tx) =>
    buildRosterImportPlan(
      tx,
      request.csvText,
      request.fileName ?? null,
      request.duplicateAnswers ?? {},
    ),
  );
}

export interface RosterApplyRequest extends RosterPlanRequest {
  /** The digest of the plan the operator confirmed. */
  digest: string;
}

/** Applies a confirmed proposal in one transaction; rebuilt and refused unless the digest still matches (`event-import.ts` precedent). */
export async function applyRosterImport(request: RosterApplyRequest): Promise<RosterImportApplied> {
  const operator = await requireCapability("roster_bulk_import");

  const oversized = refuseOversizedRosterFile(request.csvText);
  if (oversized !== null) {
    throw new ConstraintViolated(oversized, { rule: IMPORT_FILE_REFUSED_RULE });
  }

  return withTransaction(async (tx) => {
    const planned = await buildRosterImportPlan(
      tx,
      request.csvText,
      request.fileName ?? null,
      request.duplicateAnswers ?? {},
    );

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
    let carriedForward = 0;
    let welcomesQueued = 0;

    for (const row of plan.rows) {
      if (row.outcome !== "new" && row.outcome !== "carried_forward") continue;

      const result = await enterReturningPlayer({
        actorPersonId: operator.personId,
        input: {
          givenName: row.cells.first_name,
          familyName: row.cells.last_name,
          email: row.cells.personal_email === "" ? null : row.cells.personal_email,
          phone: row.cells.mobile,
          college: row.cells.college === "" ? null : row.cells.college,
          matriculationYear:
            row.cells.matriculation_year === "" ? null : Number(row.cells.matriculation_year),
        },
        decision:
          row.outcome === "new"
            ? { kind: "new", confirmed: true }
            : { kind: "existing", personId: row.matchedPersonId as string },
      });

      if (row.outcome === "new") created += 1;
      else carriedForward += 1;
      if (result.welcomeQueued) welcomesQueued += 1;
    }

    await recordAudit(tx, {
      actorPersonId: operator.personId,
      action: "roster.imported",
      entityTable: "seasons",
      entityId: plan.seasonId,
      context: {
        issue: "LAN-215",
        fileName: request.fileName ?? null,
        rows: plan.rowCount,
        created,
        carriedForward,
        unchanged: plan.totals.unchanged,
        refused: plan.totals.refused,
        welcomesQueued,
        digest: plan.digest,
      },
    });

    return {
      created,
      carriedForward,
      unchanged: plan.totals.unchanged,
      refused: plan.totals.refused,
      welcomesQueued,
    };
  });
}
