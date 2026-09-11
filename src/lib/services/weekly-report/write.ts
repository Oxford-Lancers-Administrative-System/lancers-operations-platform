import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "../audit";
import { readCurrentSeasonIn, type Season } from "../seasons";
import { computeReportContent } from "./compute";
import { METRIC_DEFINITION_VERSION, SERIES_LOCK, normaliseReportDate } from "./shared";

/** Files the immutable snapshot — invariant M5. */

export interface GeneratedReport {
  id: string;
  version: number;
  supersedesId: string | null;
  reportOn: string;
}

/** Files one immutable snapshot inside the caller's transaction. Version allocation is above the database; the race is closed by the caller's advisory lock and the database's own uniqueness constraints. */
export async function fileSnapshot(
  tx: Tx,
  season: Season,
  actorPersonId: string,
  reportOn: string,
): Promise<GeneratedReport> {
  const latest = await tx.query<{ id: string; version: number }>(
    `select id, version
       from public.weekly_reports
      where season_id = $1 and report_on = $2::date
      order by version desc
      limit 1`,
    [season.id, reportOn],
  );

  const predecessor = latest.rows[0] ?? null;
  const version = predecessor ? predecessor.version + 1 : 1;
  const supersedesId = predecessor ? predecessor.id : null;

  const content = await computeReportContent(tx, season, reportOn);
  const now = await tx.query<{ at: Date }>("select now() as at");

  // No try: the constraints are named in CONSTRAINT_MESSAGES, so a violation arrives readable.
  const inserted = await tx.query<{ id: string }>(
    `insert into public.weekly_reports
       (season_id, report_on, version, supersedes_id, metric_definition_version,
        data_as_of, generated_by_person_id, content)
     values ($1, $2::date, $3, $4, $5, $6, $7, $8::jsonb)
     returning id`,
    [
      season.id,
      reportOn,
      version,
      supersedesId,
      METRIC_DEFINITION_VERSION,
      now.rows[0].at,
      actorPersonId,
      JSON.stringify(content),
    ],
  );

  await recordAudit(tx, {
    actorPersonId,
    action: "weekly_report_generated",
    entityTable: "weekly_reports",
    entityId: inserted.rows[0].id,
    toState: `version ${version}`,
    context: {
      report_on: reportOn,
      version,
      supersedes_id: supersedesId,
      metric_definition_version: METRIC_DEFINITION_VERSION,
      look_back_from: content.lookBack.from,
      look_back_to: content.lookBack.to,
      look_ahead_to: content.lookAhead.to,
    },
  });

  return { id: inserted.rows[0].id, version, supersedesId, reportOn };
}

/** Files a snapshot unconditionally. The pilot scripts and the tests use this. */
export async function generateWeeklyReport(
  actorPersonId: string,
  reportOn: string,
): Promise<GeneratedReport> {
  const on = normaliseReportDate(reportOn);
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    await tx.query(SERIES_LOCK, [season.id, on]);
    return fileSnapshot(tx, season, actorPersonId, on);
  });
}
