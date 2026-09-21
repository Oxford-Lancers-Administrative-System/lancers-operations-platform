import "server-only";

import { withTransaction } from "@/lib/db";

/**
 * An operator's own screen settings — LAN-387, Brian's visual pass of
 * 2026-09-17.
 *
 * The one thing remembered today is which roster groups are folded away, and
 * the ask was explicit about where it lives: "saved on the operator's account
 * so it follows them between devices". So it is a row in
 * `public.operator_preferences`, keyed to the Person the session resolved to,
 * and never `localStorage`.
 *
 * Authorization is structural rather than checked. Neither function takes a
 * subject: they take the actor, write the actor's own row, and there is no
 * parameter a caller could set to reach somebody else's. A route that wanted
 * another operator's settings would have to invent a function that does not
 * exist here.
 */

/** The keys a preferences object may carry. The column is `jsonb`, so the next costs no migration. */
export interface OperatorPreferences {
  /** Roster group keys the operator has folded away. Absent — not empty — means "never touched it", and the screen's own default stands. */
  readonly rosterCollapsedGroups?: readonly string[];
  /**
   * Recruitment board group keys the operator has folded away — LAN-404.
   *
   * Its own key rather than a share of the roster's: the two boards have
   * different groups, one of recruitment's is minted per recruitment event,
   * and a single list would have to carry a prefix on every entry to keep
   * `person` on one board from folding `person` on the other.
   */
  readonly recruitmentCollapsedGroups?: readonly string[];
}

/** One `jsonb` value read back as a list of strings, or `undefined` where it is anything else. */
function stringList(stored: Record<string, unknown>, key: string): readonly string[] | undefined {
  const value = stored[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** An unparsed row: everything here came out of `jsonb`, so nothing is trusted to be the shape it should be. */
function parsePreferences(stored: unknown): OperatorPreferences {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};
  const row = stored as Record<string, unknown>;
  const roster = stringList(row, "rosterCollapsedGroups");
  const recruitment = stringList(row, "recruitmentCollapsedGroups");
  return {
    ...(roster === undefined ? {} : { rosterCollapsedGroups: roster }),
    ...(recruitment === undefined ? {} : { recruitmentCollapsedGroups: recruitment }),
  };
}

/** This operator's stored settings, or `{}` where they have never stored any. Never throws on a malformed value — an unreadable setting is no setting. */
export async function readOperatorPreferences(actorPersonId: string): Promise<OperatorPreferences> {
  return withTransaction(async (tx) => {
    const result = await tx.query<{ preferences: unknown }>(
      `select preferences from public.operator_preferences where person_id = $1::uuid`,
      [actorPersonId],
    );
    return parsePreferences(result.rows[0]?.preferences ?? null);
  });
}

/**
 * Stores which roster groups this operator has folded away.
 *
 * The whole list every time, not a diff: the screen holds the truth while it is
 * open, and a diff applied out of order would leave a group in a state nobody
 * chose. The write merges into the stored object rather than replacing it, so a
 * later setting added to this table is not erased by a board that predates it.
 */
export async function writeRosterCollapsedGroups(params: {
  actorPersonId: string;
  groups: readonly string[];
}): Promise<void> {
  await writeCollapsedGroups("rosterCollapsedGroups", params);
}

/** The same, for the recruitment board's own groups — LAN-404. */
export async function writeRecruitmentCollapsedGroups(params: {
  actorPersonId: string;
  groups: readonly string[];
}): Promise<void> {
  await writeCollapsedGroups("recruitmentCollapsedGroups", params);
}

/** The one write both boards make, over the preference key each owns. */
async function writeCollapsedGroups(
  key: "rosterCollapsedGroups" | "recruitmentCollapsedGroups",
  params: { actorPersonId: string; groups: readonly string[] },
): Promise<void> {
  // Sorted and de-duplicated so the same choice is always the same row, and a
  // toggle that lands back where it started writes nothing new.
  const groups = [...new Set(params.groups)].sort();
  await withTransaction(async (tx) => {
    await tx.query(
      `insert into public.operator_preferences (person_id, preferences)
       values ($1::uuid, jsonb_build_object($3::text, $2::jsonb))
       on conflict (person_id)
       do update set preferences = public.operator_preferences.preferences
                       || jsonb_build_object($3::text, $2::jsonb),
                     updated_at = now()`,
      [params.actorPersonId, JSON.stringify(groups), key],
    );
  });
}
