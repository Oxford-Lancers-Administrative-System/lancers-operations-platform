import "server-only";

import { NotFound, withTransaction, type Tx } from "@/lib/db";
import type { TermWindow } from "./event-input";

/**
 * The season and term aggregate — the scheduling clocks an event hangs off.
 *
 * Two tables, one module, because model §1.1 makes them one question and not
 * two: "which season are we operating?" and "which term coordinate is this
 * date in?" are asked together by every screen that records an event, and the
 * schema deliberately has **no** foreign key between them. Splitting them into
 * two modules would suggest a relationship the club does not have.
 *
 * Nothing here writes. Opening and closing a season is an operator action the
 * frozen model gives to the President or Secretary, and no issue in this slice
 * builds it.
 */

/** A season, as the interface needs it. */
export interface Season {
  id: string;
  label: string;
  status: string;
}

/** A term instance — a scheduling coordinate, never a season boundary. */
export interface Term {
  id: string;
  name: string;
  academicYear: string;
  startsOn: string;
  endsOn: string;
  /** Michaelmas runs from week −1; Hilary and Trinity from 0th. */
  firstWeek: number;
  lastWeek: number;
}

/**
 * The statuses a season is being *operated* in, in the order they occur.
 *
 * `planning` is excluded because the season has not started — recording this
 * week's practice against next year is a data error nobody would notice.
 * `archived` is excluded because it is over. Both exclusions are what make the
 * answer refusable: a club with no open season gets a refusal naming the
 * problem, not last year's events.
 *
 * This reading of "current season" is a lead decision on LAN-76, recorded in
 * the pull request. `seasons.status` carries no "is current" flag and the
 * frozen model gives none, so somebody has to say what current means; the
 * alternative — picking the newest row whatever its status — would silently
 * operate an archived season.
 */
export const OPERATING_SEASON_STATUSES: readonly string[] = Object.freeze([
  "open",
  "active",
  "closing",
]);

export const NO_CURRENT_SEASON_MESSAGE =
  "There is no season currently open. A season has to be opened before events can be " +
  "recorded against it.";

interface SeasonRow {
  id: string;
  label: string;
  status: string;
}

/**
 * The season the club is operating, or `NotFound`.
 *
 * Ordered by `starts_on` so that a club which has opened next season before
 * closing this one — legal, and the normal state of affairs in September —
 * operates the newer of the two rather than an arbitrary row.
 */
export async function readCurrentSeason(): Promise<Season> {
  return withTransaction(async (tx) => readCurrentSeasonIn(tx));
}

/** The same read, inside a caller's transaction. */
export async function readCurrentSeasonIn(tx: Tx): Promise<Season> {
  const result = await tx.query<SeasonRow>(
    `select id, label, status
       from public.seasons
      where status = any($1::public.season_status[])
      order by starts_on desc nulls last, created_at desc
      limit 1`,
    [OPERATING_SEASON_STATUSES],
  );

  const row = result.rows[0];
  if (!row) {
    throw new NotFound(NO_CURRENT_SEASON_MESSAGE, { rule: "no_current_season" });
  }

  return { id: row.id, label: row.label, status: row.status };
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

/** A `date` column as `YYYY-MM-DD`, whatever the driver handed back. */
function asDate(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Every term instance, newest first.
 *
 * Not filtered by season — there is no foreign key to filter on, and a term
 * that has just ended is still the right coordinate for an event being
 * recorded late. The interface orders the choice; it does not narrow it.
 */
export async function listTerms(): Promise<Term[]> {
  return withTransaction(async (tx) => listTermsIn(tx));
}

/**
 * The same terms, in the shape `deriveTermCoordinate` needs.
 *
 * The event form and the event service both derive the Oxford coordinate from
 * a date, and both need the calendar to do it with. This is that calendar, and
 * it is the shape the derivation takes rather than the shape the terms table
 * has, so the pure function has no opinion about the database.
 */
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

/** The same read, inside a caller's transaction. */
export async function listTermsIn(tx: Tx): Promise<Term[]> {
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
