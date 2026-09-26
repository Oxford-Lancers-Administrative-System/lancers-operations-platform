import "server-only";

import { assertCapability } from "@/lib/auth/guards";
import { ROSTER_GROUP_KEYS, type RosterGroupKey } from "@/lib/auth/grants";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { ConstraintViolated, withTransaction, type Tx } from "@/lib/db";
import { deriveEntityIdFromNaturalKey, recordAudit } from "./audit";
import { TEMPLATE_COLOUR_KEYS } from "./event-template-input";

/**
 * The roster group colours — LAN-429, W2 of mission
 * M-GRANULAR-ROLES-AND-PERMISSIONS (LAN-423).
 *
 * Ten rows in `public.roster_group_colours`, one per board group, each a
 * palette key from `TEMPLATE_COLOUR_PALETTE`. Read by every roster surface
 * (the board, the record, the recruitment board and the prospect record draw
 * their bands from it — LAN-430); written only by `role_management` holders
 * from the roster's Edit categories. Every save is one
 * `roster.group_colours.changed` audit row with one line per changed group.
 */

/** A group's colour, as a palette key. */
export type RosterGroupColours = Readonly<Record<RosterGroupKey, string>>;

/** The audit action every save writes. */
export const ROSTER_GROUP_COLOURS_CHANGED = "roster.group_colours.changed";

/** The one colour a group falls back to if its row names a key the palette no longer holds. */
const FALLBACK_COLOUR_KEY = "blue";

const ENTITY_TABLE = "roster_group_colours";
const ENTITY_ID = deriveEntityIdFromNaturalKey(ENTITY_TABLE, "club");

async function readIn(tx: Tx): Promise<RosterGroupColours> {
  const result = await tx.query<{ group_key: string; colour_key: string }>(
    "select group_key, colour_key from public.roster_group_colours",
  );
  const stored = new Map(result.rows.map((row) => [row.group_key, row.colour_key]));
  return Object.freeze(
    Object.fromEntries(
      ROSTER_GROUP_KEYS.map((group) => {
        const key = stored.get(group);
        return [group, key && TEMPLATE_COLOUR_KEYS.includes(key) ? key : FALLBACK_COLOUR_KEY];
      }),
    ) as Record<RosterGroupKey, string>,
  );
}

/**
 * Every group's colour key. Not guarded: a colour is presentation shared by
 * every surface that draws a band, and it carries no fact about anyone. A key
 * the palette no longer holds reads as Oxford Blue (`blue`).
 */
export async function readRosterGroupColours(): Promise<RosterGroupColours> {
  return withTransaction(readIn);
}

/** One group whose colour a save changed. */
export interface RosterGroupColourChange {
  readonly group: RosterGroupKey;
  readonly from: string;
  readonly to: string;
}

/**
 * Save the Roster categories dialog. `colours` may name any subset of the ten
 * groups; groups it leaves out are unchanged. Refuses a group or a colour
 * outside the vocabulary before writing anything. One audit row listing every
 * changed group; none, and no write, when nothing changed.
 */
export async function setRosterGroupColours(
  operator: ResolvedOperator | null,
  colours: Partial<Record<string, string>>,
): Promise<{ colours: RosterGroupColours; changes: readonly RosterGroupColourChange[] }> {
  const actor = assertCapability(operator, "role_management");

  for (const [group, colour] of Object.entries(colours)) {
    if (!(ROSTER_GROUP_KEYS as readonly string[]).includes(group)) {
      throw new ConstraintViolated("That is not one of the roster's groups.", {
        rule: "roster_group_unknown",
      });
    }
    if (typeof colour !== "string" || !TEMPLATE_COLOUR_KEYS.includes(colour)) {
      throw new ConstraintViolated("Choose one of the offered colours.", {
        rule: "roster_group_colour_unknown",
      });
    }
  }

  return withTransaction(async (tx) => {
    await tx.query("select 1 from public.roster_group_colours for update");
    const before = await readIn(tx);

    const changes: RosterGroupColourChange[] = ROSTER_GROUP_KEYS.flatMap((group) => {
      const to = colours[group];
      return to !== undefined && to !== before[group] ? [{ group, from: before[group], to }] : [];
    });

    if (changes.length === 0) return { colours: before, changes };

    for (const change of changes) {
      await tx.query(
        `update public.roster_group_colours
            set colour_key = $2, updated_at = now()
          where group_key = $1`,
        [change.group, change.to],
      );
    }

    await recordAudit(tx, {
      actorPersonId: actor.personId,
      action: ROSTER_GROUP_COLOURS_CHANGED,
      entityTable: ENTITY_TABLE,
      entityId: ENTITY_ID,
      context: { changes },
    });

    return { colours: await readIn(tx), changes };
  });
}
