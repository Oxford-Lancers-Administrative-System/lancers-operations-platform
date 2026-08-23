import { labelFor, STATUS_LABELS } from "@/lib/services/event-vocabulary";
import { isQuietStatus, isStruckStatus } from "./calendar-entry";

/**
 * What one calendar tile says about an event's state — decided by tier.
 * LAN-153.
 *
 * ## Why this is a function of the tier and not of the event
 *
 * `REQ-three-tiers` puts the status column on the operator's side of the line.
 * The public tier still has to mark a cancelled event, because D57 keeps one
 * visible with its history and `W2` keeps it in the subscription feed — hiding
 * it on one public surface while another shows it would be two public answers to
 * one question. So the public tier says **Cancelled** and nothing else, and the
 * operator tier says whatever the stored status is.
 *
 * Both live here rather than in the component, so that a screen cannot quietly
 * grow a third answer and so the two are readable side by side.
 */
export interface TileStatus {
  /** The word the tile prints, or `null` for the quiet ones. */
  word: string | null;
  /**
   * The word the tile's **accessible name** carries, including the one the tile
   * itself stays quiet about.
   *
   * Quieting a tile is a presentation choice — sixty rows reading "Approved"
   * tell an operator nothing. Hiding the status from a screen reader would not
   * be a presentation choice, it would be a loss, so the two are separate
   * fields.
   *
   * `null` on the public tier for anything but a cancellation, and that is not
   * the same omission: there is no status at that tier to withhold.
   */
  announced: string | null;
  /** True for an event that did not, or will not, take place. */
  struck: boolean;
}

/**
 * The operator's tile.
 *
 * Brian's review, 14 August 2026: "If an event is in draft, I think it's
 * important. If it happened in the past, that's fine, we don't need to see
 * that." A card of sixty occurred practices repeating "Occurred" says nothing,
 * so `approved` — the one state meaning *this is proceeding normally* — is
 * silent and the rest say so. The date already carries whether it is ahead of
 * us or behind us, which since LAN-151 is the whole of occurrence (D30).
 */
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
