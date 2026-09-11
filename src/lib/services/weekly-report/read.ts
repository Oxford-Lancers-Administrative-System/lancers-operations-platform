import "server-only";

import { NotFound, withTransaction } from "@/lib/db";
import { readCurrentSeasonIn } from "../seasons";
import { fileSnapshot } from "./write";
import {
  DISPLAY_NAME,
  METRIC_DEFINITION_VERSION,
  REPORT_CONTENT_SCHEMA,
  REPORT_NOT_FOUND_MESSAGE,
  SERIES_LOCK,
  asDate,
  asIso,
  normaliseReportDate,
} from "./shared";
import type { StoredReport, WeeklyReportContent } from "./shared";

const STORED_SELECT = (where: string) => `select w.id,
       w.season_id,
       w.report_on,
       w.version,
       w.supersedes_id,
       w.metric_definition_version,
       w.data_as_of,
       w.generated_at,
       ${DISPLAY_NAME} as generated_by_name,
       w.content,
       exists (
         select 1 from public.weekly_reports later where later.supersedes_id = w.id
       ) as is_superseded
  from public.weekly_reports w
  left join public.people p on p.id = w.generated_by_person_id
 where ${where}`;

interface StoredRow {
  id: string;
  season_id: string;
  report_on: Date | string;
  version: number;
  supersedes_id: string | null;
  metric_definition_version: string;
  data_as_of: Date | string;
  generated_at: Date | string;
  generated_by_name: string | null;
  content: unknown;
  is_superseded: boolean;
}

function toStoredReport(row: StoredRow): StoredReport {
  return {
    id: row.id,
    seasonId: row.season_id,
    reportOn: asDate(row.report_on) as string,
    version: row.version,
    supersedesId: row.supersedes_id,
    metricDefinitionVersion: row.metric_definition_version,
    dataAsOf: asIso(row.data_as_of) as string,
    generatedAt: asIso(row.generated_at) as string,
    generatedByName: row.generated_by_name,
    content: row.content,
    isSuperseded: row.is_superseded,
  };
}

/**
 * The report for a date: the snapshot on file, or a new one. Pressing Show
 * Report files one, every time; arriving, sorting or refreshing does not.
 * This read can write — guarded by `leadership_report`, serialized by an
 * advisory lock. Writes nothing else, ever.
 */
export async function readReportForDate(
  actorPersonId: string,
  reportOn: string,
  options: { fileNew?: boolean } = {},
): Promise<StoredReport> {
  const on = normaliseReportDate(reportOn);

  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    await tx.query(SERIES_LOCK, [season.id, on]);

    const latest = await tx.query<StoredRow>(
      `${STORED_SELECT("w.season_id = $1 and w.report_on = $2::date")}
       order by w.version desc
       limit 1`,
      [season.id, on],
    );

    const existing = latest.rows[0];
    const reusable =
      existing !== undefined &&
      !options.fileNew &&
      // A snapshot from superseded definitions can't be laid out, so it is never reused.
      existing.metric_definition_version === METRIC_DEFINITION_VERSION;

    if (reusable) return toStoredReport(existing);

    const filed = await fileSnapshot(tx, season, actorPersonId, on);
    const stored = await tx.query<StoredRow>(STORED_SELECT("w.id = $1"), [filed.id]);
    return toStoredReport(stored.rows[0]);
  });
}

/** The current version for a reporting date, or `null` when none was ever filed. Not called from the interface — opening the report files one. */
export async function readCurrentReport(reportOn: string): Promise<StoredReport | null> {
  const on = normaliseReportDate(reportOn);
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const result = await tx.query<StoredRow>(
      `${STORED_SELECT("w.season_id = $1 and w.report_on = $2::date")}
       order by w.version desc
       limit 1`,
      [season.id, on],
    );
    const row = result.rows[0];
    return row ? toStoredReport(row) : null;
  });
}

/** Every version for a reporting date, newest first. Not reachable from the interface (removed from the screen, not the database). */
export async function listReportVersions(reportOn: string): Promise<StoredReport[]> {
  const on = normaliseReportDate(reportOn);
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const result = await tx.query<StoredRow>(
      `${STORED_SELECT("w.season_id = $1 and w.report_on = $2::date")} order by w.version desc`,
      [season.id, on],
    );
    return result.rows.map(toStoredReport);
  });
}

/** One stored snapshot by id, or `NotFound`. Reads; never recomputes. */
export async function readStoredReport(id: string): Promise<StoredReport> {
  return withTransaction(async (tx) => {
    const result = await tx.query<StoredRow>(STORED_SELECT("w.id = $1"), [id]);
    const row = result.rows[0];
    if (!row) throw new NotFound(REPORT_NOT_FOUND_MESSAGE, { rule: "weekly_report_not_found" });
    return toStoredReport(row);
  });
}

/** Narrows a stored snapshot's content, or `null` — not a failure; a reader that threw would make an immutable record unreadable. */
export function parseReportContent(content: unknown): WeeklyReportContent | null {
  if (typeof content !== "object" || content === null) return null;
  const candidate = content as Partial<WeeklyReportContent>;
  if (candidate.schema !== REPORT_CONTENT_SCHEMA) return null;
  if (!Array.isArray(candidate.lastWeek) || !Array.isArray(candidate.nextWeek)) return null;
  if (typeof candidate.grid !== "object" || candidate.grid === null) return null;
  if (typeof candidate.reportOn !== "string") return null;
  return candidate as WeeklyReportContent;
}
