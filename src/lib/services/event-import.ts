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
  type ImportableTemplate,
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
 * `WP-csv-import`, workflow `W3`. ./event-csv.ts decides what a file *means*;
 * this is the half that touches the database. Authorisation lives here, not
 * in the route (slice-ux.md § 4, W3) — every exported function opens with
 * requireCapability. Applying is one transaction with the plan recomputed
 * inside it against a locked read, refused if the digest has moved — the
 * uploaded file itself is never retained as a record. An import can only
 * create and update drafts (REQ-upsert-only) — no delete, approval,
 * cancellation, audience, invitation or notification. See relocations.md.
 */

export const IMPORT_TOO_LARGE_MESSAGE = `That file is larger than ${Math.round(MAX_IMPORT_BYTES / 1024)} KB. A season's events are a few tens of kilobytes, so this is not a term card.`;

export const IMPORT_PLAN_MOVED_MESSAGE =
  "The season changed while you were reading this, so what would be written is no longer what you were shown. Nothing has been changed — import the file again to see the current proposal.";

export const IMPORT_NOTHING_TO_APPLY_MESSAGE =
  "There is nothing to apply. Every row in that file either matches what is already in the season or was refused.";

const IMPORT_PLAN_MOVED_RULE = "event_import_plan_moved";
const IMPORT_FILE_REFUSED_RULE = "event_import_file_refused";

// A count, not a list (Brian, 2026-08-21) — the Events page is one click away; the count states
// how much of the season an import is actually allowed to touch.
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

export interface SeasonExport {
  fileName: string;
  csv: string;
  eventCount: number; // zero when the season is empty, in which case the file is the template
}

// Cancelled events are included; on an empty season this is the import template (same header, no data).
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

// Read off the same built academic year the list and Oxford View read (REQ-three-arrangements) —
// events.week_number can't hold a vacation coordinate (-1..8 only), so this reads live instead.
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

export interface PlanRequest {
  csvText: string;
  fileName?: string | null;
}

// Writes nothing — abandoning the confirmation costs nothing (no reservation, no staging table).
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
      templates: await readImportableTemplatesIn(tx),
    });
  });
}

function refuseOversized(csvText: string): string | null {
  const bytes = Buffer.byteLength(csvText, "utf8"); // measured in UTF-8 bytes, since that's what the payload actually costs
  return bytes > MAX_IMPORT_BYTES ? IMPORT_TOO_LARGE_MESSAGE : null;
}

export interface ApplyRequest extends PlanRequest {
  digest: string; // the digest of the plan the operator confirmed
}

// One withTransaction, joined (not nested) by createEventDraft/updateEventDraft, so a failure on
// row forty rolls back the thirty-nine before it and no second copy of their write rules exists.
// The season is read for update, so a racing approval waits rather than slipping through.
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
      templates: await readImportableTemplatesIn(tx),
    });

    if (!planned.ok) {
      throw new ConstraintViolated(planned.reason, { rule: IMPORT_FILE_REFUSED_RULE });
    }

    const plan: ImportPlan = planned.plan;

    if (plan.digest !== request.digest) {
      // rebuilt against the season as it is *now* differs — the operator agreed to something else
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

    await recordAudit(tx, {
      actorPersonId: operator.personId,
      action: "event.imported",
      entityTable: "seasons", // the season is the entity — no single event is this action's subject
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

// Read under the same lock-and-digest discipline on the apply path — a template renamed between
// proposal and confirmation changes what a `type` cell resolves to.
async function readImportableTemplatesIn(tx: Tx): Promise<ImportableTemplate[]> {
  const result = await tx.query<{ id: string; name: string; event_type: string }>(
    "select id, name, event_type::text as event_type from public.event_templates order by lower(name)",
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    eventType: row.event_type,
  }));
}

interface ImportEventRow {
  id: string;
  name: string;
  template_id: string;
  template_name: string;
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

// A projection of its own, not listCurrentSeasonEvents (which joins four participation tables for
// counts no importer needs). Cancelled/approved events included so an import can recognise one to refuse a row.
async function readSeasonEventsIn(
  tx: Tx,
  seasonId: string,
  lock: boolean,
): Promise<ImportableEvent[]> {
  const result = await tx.query<ImportEventRow>(
    `select e.id, e.name, e.template_id, t.name as template_name,
            e.event_type::text as event_type, e.status::text as status,
            e.scheduled_on, e.starts_at::text as starts_at, e.ends_at::text as ends_at,
            e.delivery_mode::text as delivery_mode, e.venue, e.description,
            e.required_equipment, e.joining_url, e.is_mandatory
       from public.events e
       join public.event_templates t on t.id = e.template_id
      where e.season_id = $1
      order by e.scheduled_on nulls last, e.starts_at nulls first, e.name, e.id${
        lock ? "\n        for update of e" : "" // "of e": locking the join would serialise against anybody editing a template
      }`,
    [seasonId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    templateId: row.template_id,
    templateName: row.template_name,
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

function asDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
