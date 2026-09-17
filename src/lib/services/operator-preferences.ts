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

/** The keys a preferences object may carry. One today; the column is `jsonb` so the next costs no migration. */
export interface OperatorPreferences {
  /** Roster group keys the operator has folded away. Absent — not empty — means "never touched it", and the screen's own default stands. */
  readonly rosterCollapsedGroups?: readonly string[];
}

/** An unparsed row: everything here came out of `jsonb`, so nothing is trusted to be the shape it should be. */
function parsePreferences(stored: unknown): OperatorPreferences {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};
  const groups = (stored as Record<string, unknown>).rosterCollapsedGroups;
  if (!Array.isArray(groups)) return {};
  return {
    rosterCollapsedGroups: groups.filter((entry): entry is string => typeof entry === "string"),
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
  // Sorted and de-duplicated so the same choice is always the same row, and a
  // toggle that lands back where it started writes nothing new.
  const groups = [...new Set(params.groups)].sort();
  await withTransaction(async (tx) => {
    await tx.query(
      `insert into public.operator_preferences (person_id, preferences)
       values ($1::uuid, jsonb_build_object('rosterCollapsedGroups', $2::jsonb))
       on conflict (person_id)
       do update set preferences = public.operator_preferences.preferences
                       || jsonb_build_object('rosterCollapsedGroups', $2::jsonb),
                     updated_at = now()`,
      [params.actorPersonId, JSON.stringify(groups)],
    );
  });
}
