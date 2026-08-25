import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guards";
import { todayInClubZone } from "@/lib/club-time";
import { recordAudit } from "./audit";
import { createEventDraft, updateEventDraft } from "./events";
import {
  exportFileName,
  formatSeasonExport,
  importTemplateCsv,
  MAX_IMPORT_BYTES,
  planImport,
  plannedWrites,
  type ExportableEvent,
  type ImportApplied,
  type ImportableEvent,
  type ImportPlan,
  type ImportPlanResult,
} from "./event-csv";
import { toMinutePrecision, type EventDeliveryMode, type EventStatus } from "./event-input";
import {
  academicYearFor,
  buildAcademicYear,
  formatOxfordWeek,
  formatVacationWeek,
  yearCoordinateOf,
} from "./oxford-year";
import { labelFor, TERM_LABELS } from "./event-vocabulary";
import { listTermWindows, readCurrentSeasonIn, type Season } from "./seasons";

/**
 * Bulk import and export for a season's events. LAN-155, work package
 * `WP-csv-import`, workflow `W3`.
 *
 * `./event-csv.ts` decides what a file *means*; this module is the half that
 * touches the database. It reads the season, produces a proposal, and — only
 * when the operator confirms one — applies it.
 *
 * ## Authorisation is here, not in the route
 *
 * `slice-ux.md` § 4: routes do not authorize. `W3` is explicit that "event
 * management capability is required, enforced in the service layer", so every
 * exported function below opens with `requireCapability` before it reads or
 * writes anything. The server actions guard again, because a hidden control is a
 * courtesy and never a boundary — but deleting the gate from a page or an action
 * cannot reach these functions.
 *
 * ## Applying is one transaction, and the plan is recomputed inside it
 *
 * The workflow's exception table asks for two things that pull in opposite
 * directions: "applied as one transaction, so a failure part-way leaves the
 * season as it was", and "nothing is written until they confirm". A confirmation
 * is read at one moment and applied at another, and the season can move in
 * between — another operator approves an event this file also changes.
 *
 * So the file's text, not a stored plan, is what survives the confirmation. The
 * uploaded file is **not retained as a record** anywhere: it lives in the
 * request that produced the proposal and in the confirmation form the operator
 * is looking at, and nowhere else — no table, no temporary file, no cache. On
 * apply the plan is rebuilt from that text against a **locked** read of the
 * season, and refused outright unless its digest still matches the one the
 * operator confirmed. What is written is therefore always exactly what they
 * read, or nothing at all.
 *
 * ## What an import can never do
 *
 * Create and update drafts. That is the whole list. There is no delete here and
 * no bulk delete anywhere — D35 is retired for release one — no approval, no
 * cancellation, no audience, no invitation and no notification. An event in the
 * season and absent from the file is not touched by any statement this module
 * issues, which is `REQ-upsert-only` holding structurally rather than by
 * intention.
 */

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const IMPORT_TOO_LARGE_MESSAGE = `That file is larger than ${Math.round(MAX_IMPORT_BYTES / 1024)} KB. A season's events are a few tens of kilobytes, so this is not a term card.`;

export const IMPORT_PLAN_MOVED_MESSAGE =
  "The season changed while you were reading this, so what would be written is no longer what you were shown. Nothing has been changed — import the file again to see the current proposal.";

export const IMPORT_NOTHING_TO_APPLY_MESSAGE =
  "There is nothing to apply. Every row in that file either matches what is already in the season or was refused.";

export const IMPORT_PLAN_MOVED_RULE = "event_import_plan_moved";
export const IMPORT_FILE_REFUSED_RULE = "event_import_file_refused";

// ---------------------------------------------------------------------------
// What the bulk import screen states
// ---------------------------------------------------------------------------

/**
 * The screen shows a **count, not a list** — decided 2026-08-21 on Brian's
 * invitation to propose. A full list duplicates the Events page one click away;
 * a count states the one thing that would otherwise surprise an operator halfway
 * through, which is how much of the season an import is actually allowed to
 * touch.
 */
export interface SeasonImportContext {
  season: Season;
  total: number;
  drafts: number;
  approved: number;
  cancelled: number;
}

export async function readSeasonImportContext(): Promise<SeasonImportContext> {
  await requireCapability("event_calendar_management");

  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const events = await readSeasonEventsIn(tx, season.id, false);
    return {
      season,
      total: events.length,
      drafts: events.filter((event) => event.status === "draft").length,
      approved: events.filter((event) => event.status === "approved").length,
      cancelled: events.filter((event) => event.status === "cancelled").length,
    };
  });
}

// ---------------------------------------------------------------------------
// The export
// ---------------------------------------------------------------------------

export interface SeasonExport {
  fileName: string;
  csv: string;
  /** Zero when the season is empty, in which case the file is the template. */
  eventCount: number;
}

/**
 * Every event in the season, in the import's columns plus `status` and
 * `term_week`. **Cancelled events are included** — leaving one out would make it
 * invisible in the file and look like something to re-add.
 *
 * On an empty season this is the template: the same header row with no data
 * under it. There is deliberately no second format and no separate template to
 * keep in step with it.
 */
export async function exportSeasonEvents(): Promise<SeasonExport> {
  await requireCapability("event_calendar_management");

  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const events = await readSeasonEventsIn(tx, season.id, false);
    const fileName = exportFileName(season.label);

    if (events.length === 0) {
      return { fileName, csv: importTemplateCsv(), eventCount: 0 };
    }

    const coordinate = await termWeekLabeller(season);
    const exportable: ExportableEvent[] = events.map((event) => ({
      ...event,
      termWeek: coordinate(event.scheduledOn),
    }));

    return { fileName, csv: formatSeasonExport(exportable), eventCount: events.length };
  });
}

/**
 * `term_week`, read off the same built academic year the list and the Oxford
 * View read.
 *
 * `REQ-three-arrangements` requires those surfaces to agree about when an event
 * is, and `events.week_number` cannot hold a vacation coordinate — it is
 * constrained to −1..8 — so an export that read the stored column would print
 * "Outside term" for a Christmas Vacation event the calendar happily names. The
 * column is read-only and ignored on the way back in; it still has to be true.
 */
async function termWeekLabeller(season: Season): Promise<(day: string | null) => string> {
  const terms = await listTermWindows();
  const today = todayInClubZone();
  const academicYear = academicYearFor(terms, { today, seasonStartsOn: season.startsOn });
  if (academicYear === null) return () => "";

  const column = buildAcademicYear(academicYear, terms, [], {
    today,
    seasonEndsOn: season.endsOn,
  });

  return (day: string | null) => {
    const coordinate = yearCoordinateOf(column, day);
    if (coordinate === null) return "";
    return coordinate.kind === "vacation"
      ? formatVacationWeek(coordinate.segmentName, coordinate.week)
      : `${labelFor(TERM_LABELS, coordinate.segmentName)} ${formatOxfordWeek(coordinate.week)}`;
  };
}

// ---------------------------------------------------------------------------
// The proposal
// ---------------------------------------------------------------------------

export interface PlanRequest {
  csvText: string;
  fileName?: string | null;
}

/**
 * What the file would do, against the season as it is now. **Writes nothing.**
 *
 * Abandoning the confirmation therefore costs nothing and leaves nothing behind:
 * there is no reservation, no staging table and no held upload, because this
 * function's only effect is the value it returns.
 */
export async function planSeasonImport(request: PlanRequest): Promise<ImportPlanResult> {
  await requireCapability("event_calendar_management");

  const oversized = refuseOversized(request.csvText);
  if (oversized !== null) return { ok: false, reason: oversized };

  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const events = await readSeasonEventsIn(tx, season.id, false);
    return planImport({
      csvText: request.csvText,
      fileName: request.fileName ?? null,
      events,
    });
  });
}

/**
 * The size limit, applied to the text before anything else looks at it.
 *
 * Measured in UTF-8 bytes rather than in characters, because that is what the
 * limit is about — a term card in a language with multi-byte characters is not
 * a bigger file in any sense the operator cares about, but it is a bigger
 * payload to carry through the confirmation form.
 */
function refuseOversized(csvText: string): string | null {
  const bytes = Buffer.byteLength(csvText, "utf8");
  return bytes > MAX_IMPORT_BYTES ? IMPORT_TOO_LARGE_MESSAGE : null;
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

export interface ApplyRequest extends PlanRequest {
  /** The digest of the plan the operator confirmed. */
  digest: string;
}

/**
 * Applies a confirmed proposal, as one transaction.
 *
 * Everything happens inside a single `withTransaction`, and both writers reuse
 * it: `withTransaction` **joins** an open transaction rather than nesting, so
 * `createEventDraft` and `updateEventDraft` run their derivation, their status
 * guard and their audit row inside this one. A failure on the fortieth row
 * therefore rolls back the thirty-nine before it, which is what "a failure
 * part-way leaves the season as it was" has to mean — and it means the import
 * reuses the two functions that already know how to write an event rather than
 * carrying a second, quieter copy of those rules.
 *
 * The season is read `for update`, so an approval that lands between the plan
 * and the writes waits rather than slipping through the gap the digest is
 * checked across.
 */
export async function applySeasonImport(request: ApplyRequest): Promise<ImportApplied> {
  const operator = await requireCapability("event_calendar_management");

  const oversized = refuseOversized(request.csvText);
  if (oversized !== null) {
    throw new ConstraintViolated(oversized, { rule: IMPORT_FILE_REFUSED_RULE });
  }

  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const events = await readSeasonEventsIn(tx, season.id, true);

    const planned = planImport({
      csvText: request.csvText,
      fileName: request.fileName ?? null,
      events,
    });

    if (!planned.ok) {
      throw new ConstraintViolated(planned.reason, { rule: IMPORT_FILE_REFUSED_RULE });
    }

    const plan: ImportPlan = planned.plan;

    // The confirmation is what was agreed to. If rebuilding it against the
    // season as it is *now* produces different writes, the operator agreed to
    // something else, and this refuses rather than applying what they did not
    // read.
    if (plan.digest !== request.digest) {
      throw new InvalidTransition(IMPORT_PLAN_MOVED_MESSAGE, { rule: IMPORT_PLAN_MOVED_RULE });
    }

    const writes = plannedWrites(plan);
    if (writes.length === 0) {
      throw new ConstraintViolated(IMPORT_NOTHING_TO_APPLY_MESSAGE, {
        rule: IMPORT_FILE_REFUSED_RULE,
      });
    }

    for (const write of writes) {
      if (write.kind === "create") {
        await createEventDraft(operator.personId, write.input);
      } else {
        await updateEventDraft(operator.personId, write.eventId, write.input);
      }
    }

    // One record of the import itself, beside the per-event rows the two
    // writers above already wrote. The season is the entity: this is a thing
    // that happened to a season's calendar, and no single event is its subject.
    await recordAudit(tx, {
      actorPersonId: operator.personId,
      action: "event.imported",
      entityTable: "seasons",
      entityId: season.id,
      context: {
        fileName: request.fileName ?? null,
        rows: plan.rowCount,
        created: plan.totals.new,
        updated: plan.totals.updated,
        unchanged: plan.totals.unchanged,
        refused: plan.totals.refused,
        digest: plan.digest,
      },
    });

    return {
      created: plan.totals.new,
      updated: plan.totals.updated,
      unchanged: plan.totals.unchanged,
      refused: plan.totals.refused,
    };
  });
}

// ---------------------------------------------------------------------------
// Reading the season
// ---------------------------------------------------------------------------

interface ImportEventRow {
  id: string;
  name: string;
  event_type: string;
  status: EventStatus;
  scheduled_on: Date | string | null;
  starts_at: string | null;
  ends_at: string | null;
  delivery_mode: EventDeliveryMode;
  venue: string | null;
  description: string | null;
  required_equipment: string | null;
  joining_url: string | null;
  is_mandatory: boolean;
}

/**
 * Every event in the season, in exactly the fields an import reads or writes.
 *
 * A projection of its own rather than `listCurrentSeasonEvents`: that one joins
 * four participation tables to produce counts no importer needs, and none of
 * `description`, `required_equipment` or `joining_url` is in its list entry.
 * Cancelled and approved events are included, because an import has to be able
 * to *recognise* one in order to refuse a row that would change it.
 */
async function readSeasonEventsIn(
  tx: Tx,
  seasonId: string,
  lock: boolean,
): Promise<ImportableEvent[]> {
  const result = await tx.query<ImportEventRow>(
    `select id, name, event_type::text as event_type, status::text as status,
            scheduled_on, starts_at::text as starts_at, ends_at::text as ends_at,
            delivery_mode::text as delivery_mode, venue, description,
            required_equipment, joining_url, is_mandatory
       from public.events
      where season_id = $1
      order by scheduled_on nulls last, starts_at nulls first, name, id${lock ? "\n        for update" : ""}`,
    [seasonId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    eventType: row.event_type,
    status: row.status,
    scheduledOn: asDate(row.scheduled_on),
    startsAt: row.starts_at === null ? null : toMinutePrecision(row.starts_at),
    endsAt: row.ends_at === null ? null : toMinutePrecision(row.ends_at),
    deliveryMode: row.delivery_mode,
    venue: row.venue,
    description: row.description,
    requiredEquipment: row.required_equipment,
    joiningUrl: row.joining_url,
    isMandatory: row.is_mandatory,
  }));
}

/** `YYYY-MM-DD`, whether the driver handed back a string or a `Date`. */
function asDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
