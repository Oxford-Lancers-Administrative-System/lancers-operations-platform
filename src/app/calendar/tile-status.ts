import { labelFor, STATUS_LABELS } from "@/lib/services/event-vocabulary";
import { isQuietStatus, isStruckStatus } from "./calendar-entry";

/**
 * What one calendar tile says about an event's state — decided by tier,
 * LAN-153. `REQ-three-tiers` puts the status column on the operator's side;
 * the public tier says only **Cancelled** or nothing. Both live here, not in
 * the component, so a screen cannot quietly grow a third answer.
 */
export interface TileStatus {
  /** The word the tile prints, or `null` for the quiet ones. */
  word: string | null;
  /** The tile's accessible name, including what `word` stays quiet about — quieting is presentation, not a loss to screen readers. `null` on the public tier means no status to withhold, not an omission. */
  announced: string | null;
  /** True for an event that did not, or will not, take place. */
  struck: boolean;
}

/** The operator's tile. `approved` — proceeding normally — stays silent; every other status says so (Brian's review, 14 August 2026). */
export function operatorTileStatus(status: string): TileStatus {
  const announced = labelFor(STATUS_LABELS, status);
  return {
    word: isQuietStatus(status) ? null : announced,
    announced,
    struck: isStruckStatus(status),
  };
}

/** The public tier's tile: cancelled, or nothing at all. */
export function publicTileStatus(isCancelled: boolean): TileStatus {
  const word = isCancelled ? labelFor(STATUS_LABELS, "cancelled") : null;
  return { word, announced: word, struck: isCancelled };
}
