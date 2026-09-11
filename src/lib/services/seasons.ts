import "server-only";

import { NotFound, withTransaction, type Tx } from "@/lib/db";
import type { TermWindow } from "./event-input";

/** The season and term aggregate. One module, model §1.1: no foreign key between the two tables. Nothing here writes. */

export interface Season {
  id: string;
  label: string;
  status: string;
  /** `YYYY-MM-DD`. Read since LAN-153 so the Oxford View has an anchor outside every term. Nullable because the column is. */
  startsOn: string | null;
  /** `YYYY-MM-DD`, or `null` while open-ended. Bounds the trailing Long Vacation on the Oxford View — see `oxford-year.ts`. */
  endsOn: string | null;
}

export interface Term {
  id: string;
  name: string;
  academicYear: string;
  startsOn: string;
  endsOn: string;
  firstWeek: number;
  lastWeek: number;
}

/** Statuses a season is *operated* in, in order. `planning`/`archived` excluded (LAN-76's lead decision on what "current" means). */
export const OPERATING_SEASON_STATUSES: readonly string[] = Object.freeze([
  "open",
  "active",
  "closing",
]);

export const NO_CURRENT_SEASON_MESSAGE =
  "There is no season currently open. A season has to be opened before events can be " +
  "recorded against it.";

/** `NotFound.rule` for {@link NO_CURRENT_SEASON_MESSAGE} — exported so a caller can identify exactly this refusal (LAN-158, R158-B1). */
export const NO_CURRENT_SEASON_RULE = "no_current_season";

interface SeasonRow {
  id: string;
  label: string;
  status: string;
  starts_on: Date | string | null;
  ends_on: Date | string | null;
}

/** The season the club is operating, or `NotFound`. Ordered by `starts_on` so an already-opened next season wins over the closing one. */
export async function readCurrentSeason(): Promise<Season> {
  return withTransaction(async (tx) => readCurrentSeasonIn(tx));
}

export async function readCurrentSeasonIn(tx: Tx): Promise<Season> {
  const result = await tx.query<SeasonRow>(
    `select id, label, status, starts_on, ends_on
       from public.seasons
      where status = any($1::public.season_status[])
      order by starts_on desc nulls last, created_at desc
      limit 1`,
    [OPERATING_SEASON_STATUSES],
  );

  const row = result.rows[0];
  if (!row) {
    throw new NotFound(NO_CURRENT_SEASON_MESSAGE, { rule: NO_CURRENT_SEASON_RULE });
  }

  return {
    id: row.id,
    label: row.label,
    status: row.status,
    startsOn: row.starts_on === null ? null : asDate(row.starts_on),
    endsOn: row.ends_on === null ? null : asDate(row.ends_on),
  };
}

/** A season's own label, by id — `null` when unresolved. Deliberately not the full shape: LAN-202's opt-out page needs only the string. */
export async function readSeasonLabelIn(tx: Tx, seasonId: string): Promise<string | null> {
  const result = await tx.query<{ label: string }>(
    `select label from public.seasons where id = $1::uuid`,
    [seasonId],
  );
  return result.rows[0]?.label ?? null;
}

interface TermRow {
  id: string;
  name: string;
  academic_year: string;
  starts_on: Date | string;
  ends_on: Date | string;
  first_week: number;
  last_week: number;
}

function asDate(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Every term instance, newest first. Not filtered by season — no foreign key, and a just-ended term is still a valid coordinate for a late-recorded event. */
export async function listTerms(): Promise<Term[]> {
  return withTransaction(async (tx) => listTermsIn(tx));
}

/** The same terms, in the shape `deriveTermCoordinate` needs — so that pure function has no opinion about the database. */
export async function listTermWindows(): Promise<TermWindow[]> {
  const terms = await listTerms();
  return terms.map((term) => ({
    id: term.id,
    name: term.name,
    academicYear: term.academicYear,
    startsOn: term.startsOn,
    endsOn: term.endsOn,
    firstWeek: term.firstWeek,
    lastWeek: term.lastWeek,
  }));
}

async function listTermsIn(tx: Tx): Promise<Term[]> {
  const result = await tx.query<TermRow>(
    `select id, name::text as name, academic_year, starts_on, ends_on, first_week, last_week
       from public.terms
      order by starts_on desc`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    academicYear: row.academic_year,
    startsOn: asDate(row.starts_on),
    endsOn: asDate(row.ends_on),
    firstWeek: row.first_week,
    lastWeek: row.last_week,
  }));
}
