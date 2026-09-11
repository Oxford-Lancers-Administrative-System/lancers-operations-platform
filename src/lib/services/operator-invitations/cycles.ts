import { Conflict, NotFound, type Tx } from "@/lib/db";
import type { AdministrationOperatingYear } from "../administration-events";
import type { ResolvedRole } from "./invite";

const NO_ACTIVE_COMMITTEE_YEAR_RULE = "no_active_committee_year";
const NO_OPEN_SEASON_RULE = "no_open_season";

/**
 * The cycle a role's assignment hangs off, and the operating years reading
 * and writing mean by "this year" / "this season" — LAN-131,
 * `REQ-explicit-cycle-assignment`. Fails closed on a write; widens by
 * exactly one status on a read (LAN-141 findings 4 and 8).
 */
export interface ResolvedCycle {
  readonly committeeYearId: string | null;
  readonly seasonId: string | null;
  readonly operatingYear: AdministrationOperatingYear;
}

/**
 * The cycle a role's assignment hangs off — register D8, and
 * `REQ-explicit-cycle-assignment`: the form does not ask for the year, the
 * stored cycle stays explicit, and it is inherited from the one active context.
 *
 * A committee seat hangs off the committee year; a coaching seat hangs off the
 * season, because coaches are appointed around seasons and do not turn over at
 * the AGM. The role says which, so this reads the role rather than asking.
 */
export async function resolveCycleFor(
  tx: Tx,
  scope: "committee_year" | "season",
  committeeYear: AdministrationOperatingYear,
): Promise<ResolvedCycle> {
  if (scope === "committee_year") {
    return {
      committeeYearId: committeeYear.id,
      seasonId: null,
      operatingYear: committeeYear,
    };
  }

  const season = await resolveActiveSeason(tx);
  return { committeeYearId: null, seasonId: season.id, operatingYear: season };
}

export async function insertRoleAssignmentIn(
  tx: Tx,
  input: {
    personId: string;
    entry: ResolvedRole;
    cycle: ResolvedCycle;
    appointedByPersonId: string;
  },
): Promise<string> {
  const { role } = input.entry;

  // `scope`, `is_constitutional_office` and `is_single_holder_seat` are all
  // denormalised from `public.roles` so that the schema's exclusion constraints
  // are expressible, and all three are carried by composite foreign keys. There
  // is no trigger filling them in — LAN-128 decided that deliberately — so a
  // value taken from anywhere but the catalogue row is refused loudly by
  // `role_assignments_agree_with_role` or
  // `role_assignments_agree_with_single_holder_rule`. They are read from the
  // row this insert names, and from nowhere else.
  const inserted = await tx.query<{ id: string }>(
    `insert into public.role_assignments
       (person_id, role_id, scope, is_constitutional_office, is_single_holder_seat,
        committee_year_id, season_id, effective_from, appointed_by_person_id, note)
     values ($1, $2, $3::public.role_scope, $4, $5, $6, $7, $8::date, $9, $10)
     returning id`,
    [
      input.personId,
      role.id,
      role.scope,
      role.is_constitutional_office,
      role.is_single_holder_seat,
      input.cycle.committeeYearId,
      input.cycle.seasonId,
      input.entry.effectiveFrom,
      input.appointedByPersonId,
      input.entry.reason,
    ],
  );

  return inserted.rows[0].id;
}

export async function currentDateIn(tx: Tx): Promise<string> {
  const result = await tx.query<{ today: string }>("select current_date::text as today");
  return result.rows[0].today;
}

/**
 * The one active committee year — `DEC-active-operating-year`: "routine
 * assignments inherit the single application-wide active operating-year
 * context", and forms do not ask for it.
 *
 * Fails closed in both directions, on `resolveOpenSeason`'s pattern: none is a
 * `NotFound` naming what has to happen first, and more than one is a `Conflict`
 * rather than a silent choice. `committee_years_do_not_overlap` makes the
 * second unreachable for dated years and not for open-ended ones, which is
 * exactly the case worth refusing.
 */
export async function resolveActiveCommitteeYear(tx: Tx): Promise<AdministrationOperatingYear> {
  const result = await tx.query<{ id: string; label: string }>(
    `select id, label
       from public.committee_years
      where starts_on <= current_date
        and (ends_on is null or ends_on > current_date)
      order by starts_on desc`,
  );

  if (result.rows.length === 0) {
    throw new NotFound(
      "The club has no committee year running at the moment, so there is nothing to record " +
        "this against. The current committee year has to be recorded first.",
      { rule: NO_ACTIVE_COMMITTEE_YEAR_RULE },
    );
  }
  if (result.rows.length > 1) {
    throw new Conflict(
      "More than one committee year is currently running, so it is not clear which one this " +
        "belongs to. Close the one that has finished, then try again.",
      { rule: "ambiguous_active_committee_year" },
    );
  }

  return { scope: "committee_year", id: result.rows[0].id, label: result.rows[0].label };
}

/**
 * The operating year an **activation** is recorded under — the active
 * committee year, and the most recent one when there is no active one
 * (activation is the invited person setting a password, after the fact, and
 * must not fail because a gap between committee years exists). Decision
 * history: relocations.md.
 */
export async function resolveCommitteeYearForActivation(
  tx: Tx,
): Promise<AdministrationOperatingYear> {
  try {
    return await resolveActiveCommitteeYear(tx);
  } catch (error) {
    const isMissing =
      error instanceof NotFound && (error as NotFound).rule === NO_ACTIVE_COMMITTEE_YEAR_RULE;
    if (!isMissing) throw error;

    const result = await tx.query<{ id: string; label: string }>(
      "select id, label from public.committee_years order by starts_on desc limit 1",
    );
    if (result.rows.length === 0) throw error;

    return { scope: "committee_year", id: result.rows[0].id, label: result.rows[0].label };
  }
}

/** The season a coaching appointment hangs off. Same fail-closed shape. */
async function resolveActiveSeason(tx: Tx): Promise<AdministrationOperatingYear> {
  const result = await tx.query<{ id: string; label: string }>(
    `select id, label from public.seasons where status in ('open', 'active') order by label`,
  );

  if (result.rows.length === 0) {
    throw new NotFound(
      "There is no season under way, so a coaching role cannot be given a start yet. " +
        "The President or Secretary opens the season first.",
      { rule: NO_OPEN_SEASON_RULE },
    );
  }
  if (result.rows.length > 1) {
    throw new Conflict(
      "More than one season is currently open, so it is not clear which one a coaching role " +
        "belongs to. Close or archive the season that has finished, then try again.",
      { rule: "ambiguous_open_season" },
    );
  }

  return { scope: "season", id: result.rows[0].id, label: result.rows[0].label };
}

/**
 * The committee year a *reading* surface means by "this year", or `null` —
 * unlike the write-side resolver, does not throw when there is none.
 * Decision history (LAN-141 finding 8): missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */
export async function resolveCommitteeYearForReading(
  tx: Tx,
): Promise<AdministrationOperatingYear | null> {
  try {
    return await resolveActiveCommitteeYear(tx);
  } catch (error) {
    const isMissing =
      error instanceof NotFound && (error as NotFound).rule === NO_ACTIVE_COMMITTEE_YEAR_RULE;
    if (isMissing) return null;
    throw error;
  }
}

/** The season a reading surface means by "this season", and whether it takes writes. */
export interface SeasonForReading {
  readonly year: AdministrationOperatingYear;
  /**
   * False for a season in `closing`. It is the club's current season to read —
   * its coaches are in post and its fixtures are being wound up — and it is not
   * one a new coaching appointment may be recorded against.
   */
  readonly writable: boolean;
}

/**
 * The season a reading surface means by "this season", or `null`. Widens the
 * write-side resolver by exactly one status (`closing` is current but not
 * `writable`); `open`/`active` is preferred when both exist. Decision
 * history (LAN-141 finding 4): relocations.md.
 */
export async function resolveSeasonForReading(tx: Tx): Promise<SeasonForReading | null> {
  try {
    return { year: await resolveActiveSeason(tx), writable: true };
  } catch (error) {
    const isMissing = error instanceof NotFound && (error as NotFound).rule === NO_OPEN_SEASON_RULE;
    if (!isMissing) throw error;

    const result = await tx.query<{ id: string; label: string }>(
      `select id, label
         from public.seasons
        where status = 'closing'
        order by starts_on desc, label desc
        limit 1`,
    );
    if (result.rows.length === 0) return null;

    return {
      year: { scope: "season", id: result.rows[0].id, label: result.rows[0].label },
      writable: false,
    };
  }
}
