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
 * The database half of the roster's CSV import. `./roster-csv.ts` decides
 * what a row's own shape means; this module is the half that asks the
 * roster "who might this already be" and, once confirmed, writes.
 * LAN-215, `WP-arrival-doors`, workflow `W1`.
 *
 * ## Authorisation is here, not in the route
 *
 * `W1`'s own specification: "the guard is enforced twice — at the page and
 * again in the service — as `/operate/events/import` does." Every exported
 * function below opens with `requireCapability("roster_bulk_import")` before
 * it reads or writes anything, on `event-import.ts`'s own precedent.
 *
 * ## What a duplicate answer is, and how it travels
 *
 * `W1`'s confirmation grows one section the event import has no need of:
 * "each incoming row that matched an existing person, shown beside the
 * candidate ... with the operator's answer required." That answer cannot be
 * decided by this module — it is a human judgement about a specific pair of
 * records — so it travels exactly as the file's own text does: back to the
 * browser in the rendered proposal, and returned as a plain map on the next
 * `propose` submission (never stored). `DuplicateAnswers` keys the line
 * number to either `"different"` or the `personId` of the candidate the
 * operator confirmed is the same human being. A row still unanswered when
 * `confirmed` is pressed is `refused`, and only that row — `W1`'s own
 * decision, locked 2026-09-01.
 *
 * ## Applying is one transaction, and the plan is recomputed inside it
 *
 * Identical contract to `event-import.ts`'s `applySeasonImport`: the file's
 * text and the operator's duplicate answers are what survive the
 * confirmation, not a stored plan. `buildRosterImportPlan` is called again
 * inside the apply transaction and refused unless its digest still matches
 * what the operator read — a person minted or a membership created by
 * another operator in between is exactly the race this catches.
 *
 * ## The write itself is Mission 5's, reused rather than duplicated
 *
 * `W1`'s own specification: "The person write is Mission 5's too.
 * `enterReturningPlayer` in `src/lib/services/roster.ts` already mints a
 * person, their contact points and a season membership from the
 * returner-intake path." Every applicable row — `new` and
 * `carried_forward` alike — is written by calling that function once, inside
 * this module's own transaction (`withTransaction` joins rather than
 * nesting, exactly as `event-import.ts`'s own doc comment states for
 * `createEventDraft`/`updateEventDraft`), so the membership, the checklist
 * and the queued welcome it already writes are this import's writes too,
 * with no second, quieter copy of any of the three. `entry` is therefore
 * `'returning'` for both outcomes, matching what the shipped surface already
 * writes for every membership `enterReturningPlayer` creates — this module
 * invents no new reading of `entry` for a door that has never set it any
 * other way.
 *
 * `college` and `matriculation_year` are written **only** for a `new` row —
 * `roster.ts`'s own extension of `ReturnerIntakeInput` — because
 * `carried_forward`'s whole point is that a person's own facts are never
 * touched by the file.
 */

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export { IMPORT_TOO_LARGE_MESSAGE };

export const IMPORT_PLAN_MOVED_MESSAGE =
  "The roster changed while you were reading this, so what would be written is no longer what " +
  "you were shown. Nothing has been changed — import the file again to see the current proposal.";

export const IMPORT_NOTHING_TO_APPLY_MESSAGE =
  "There is nothing to apply. Every row in that file is either already on this season's roster, " +
  "refused, or waiting on a duplicate answer.";

export const IMPORT_PLAN_MOVED_RULE = "roster_import_plan_moved";
export const IMPORT_FILE_REFUSED_RULE = "roster_import_file_refused";

const UNANSWERED_DUPLICATE_REASON = "Refused until the possible duplicate below is answered.";
const STALE_ANSWER_REASON =
  "That answer no longer matches a candidate on this row — the roster moved. Answer it again.";

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------
//
// Every shape the confirmation screen reads — `RosterImportPlan`,
// `RosterPlannedRow`, `RosterDuplicateCandidate` and the rest — is declared
// in `./roster-csv.ts`, which is pure and safe for a client component to
// import types from. This module only re-exports them, so a caller reading
// `./roster-import.ts` finds the whole contract in one place without this
// `server-only` module ever being the one a client component's types resolve
// through.

export type {
  DuplicateAnswers,
  RosterCandidateMatch,
  RosterDuplicateCandidate,
  RosterImportApplied,
  RosterImportPlan,
  RosterImportPlanResult,
  RosterImportTotals,
  RosterPlannedRow,
  RosterRowOutcome,
} from "./roster-csv";

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

/**
 * One row, resolved against the roster as it stands right now. Never writes.
 *
 * A row whose shape was already refused by `./roster-csv.ts` is returned
 * as-is — the database is never asked about a row that cannot apply for a
 * reason no duplicate answer could fix.
 */
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

  // A mobile number is single-owner by nature — unlike a shared last name or
  // a shared family email, two different human beings do not carry the same
  // one. So a candidate the row's own mobile matches is a confirmed identity,
  // not a "possible" one, and this is what makes re-importing the identical
  // file idempotent without asking the same question twice: `W1`'s own
  // acceptance evidence, "the same file imported twice: the second run is
  // every row Unchanged". A name-only match remains genuinely ambiguous —
  // "Bertram, no surname" is exactly the case `roster.ts`'s own duplicate
  // check exists to surface as a question, never to answer by itself — and
  // still needs the operator. Two candidates both confirmed by phone would be
  // a data anomaly this importer does not try to arbitrate; that case still
  // asks.
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

/**
 * A fingerprint of exactly what confirming would write, given these
 * duplicate answers. `event-csv.ts`'s own FNV-1a idiom over a canonical
 * rendering — not a secret, and not defended against a forger: what this
 * catches is the roster moving, or an answer resolving differently, between
 * the operator's last read and the apply.
 */
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

/**
 * The whole file, resolved against the roster as it stands right now, inside
 * one transaction — so every row's duplicate question and the season it
 * checks membership against are one consistent read. Writes nothing.
 */
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
    // Sequential, not `Promise.all`: `findPersonCandidates` opens/joins one
    // transaction per row, and racing fifty of them against the same
    // connection buys nothing an import — read once per proposal, applied
    // once — needs to be fast at.
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

// ---------------------------------------------------------------------------
// The season context — the "start here" screen
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The proposal
// ---------------------------------------------------------------------------

export interface RosterPlanRequest {
  csvText: string;
  fileName?: string | null;
  duplicateAnswers?: DuplicateAnswers;
}

/**
 * What the file would do, against the roster as it is now. **Writes
 * nothing.** Abandoning the confirmation therefore costs nothing: there is no
 * reservation, no staging table and no held upload.
 */
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

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

export interface RosterApplyRequest extends RosterPlanRequest {
  /** The digest of the plan the operator confirmed. */
  digest: string;
}

/**
 * Applies a confirmed proposal, as one transaction — everything commits
 * together or not at all. `event-import.ts`'s own `applySeasonImport` is the
 * precedent this follows line for line: the plan is rebuilt from the file's
 * text and the operator's duplicate answers inside this transaction, and
 * refused outright unless its digest still matches the one the operator
 * confirmed.
 */
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
          // Written only for a genuinely new person — enterReturningPlayer
          // never touches either column for an `existing` decision, which is
          // what makes `carried_forward`'s "the person's own facts are not
          // touched" true by construction rather than by a check here.
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
