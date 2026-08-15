/**
 * The only shape of an address suggestion the rest of the application knows.
 * LAN-115.
 *
 * This module is the adapter boundary the issue asks for, stated as a type. It
 * is deliberately the one file in `venue-search/` that both the server and the
 * browser import, and it deliberately contains no vendor vocabulary: no
 * `osm_id`, no `properties`, no `features`, no coordinates, no provider
 * identifier of any kind.
 *
 * Two rules produced it, both from LAN-115:
 *
 *   * "Keep provider access behind a bounded adapter/configuration boundary so
 *     form and domain behavior do not depend directly on vendor-specific
 *     response objects." Swapping the provider must change `photon.ts` and one
 *     branch of `config.ts` — never the form, the action, the service or the
 *     schema.
 *
 *   * "Do not add ... coordinates, maps, routing, or provider-specific
 *     identifiers unless the current approved model already requires them." It
 *     does not, so they are absent here rather than carried along unused. A
 *     latitude that exists is a latitude something will eventually store, and
 *     storing one is a change to the approved domain model.
 *
 * What actually reaches the event is `formatted`, a single line of text written
 * into the existing `events.venue` column. There is no venue entity, no saved
 * venue and no second write.
 */

export interface VenueSuggestion {
  /**
   * A key for rendering this suggestion in a list, unique within one response
   * and meaningless outside it.
   *
   * Deliberately **not** the provider's identifier. Nothing may join on it,
   * store it or send it back, which is what keeps "no provider-specific
   * identifiers" true rather than merely intended.
   */
  readonly id: string;
  /** The leading line — the place's name, or its street address. */
  readonly label: string;
  /** The qualifying line that tells two similar places apart. May be empty. */
  readonly detail: string;
  /** The single line stored in `events.venue` when this suggestion is chosen. */
  readonly formatted: string;
}

/**
 * The longest venue string this boundary will hand on.
 *
 * A provider's formatted address is externally controlled text on its way into
 * a `text` column and onto three screens. It is bounded here, at the edge,
 * rather than in LAN-76's validation — which governs what an operator may type
 * and is not this issue's to change.
 */
export const MAX_VENUE_LENGTH = 200;

/**
 * The shortest query worth sending.
 *
 * One or two characters match most of the planet, so the suggestions are noise
 * and the request is waste. The browser stops below this so the request is
 * never made, and the endpoint applies it again so a caller that skips the
 * browser gets the same answer.
 */
export const MIN_QUERY_LENGTH = 3;

/**
 * The longest query worth sending. Bounds what an operator's keyboard can turn
 * into an outbound request on the club's behalf.
 */
export const MAX_QUERY_LENGTH = 120;

/** Join address parts into one line, dropping blanks and consecutive repeats. */
export function joinAddressParts(parts: readonly (string | null | undefined)[]): string {
  const kept: string[] = [];
  for (const part of parts) {
    const text = typeof part === "string" ? part.trim() : "";
    if (text === "") continue;
    if (kept.some((existing) => existing.toLowerCase() === text.toLowerCase())) continue;
    kept.push(text);
  }
  return kept.join(", ");
}
