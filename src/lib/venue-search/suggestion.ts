/**
 * The only shape of an address suggestion the rest of the application knows.
 * LAN-115. The adapter boundary the issue asks for, stated as a type:
 * deliberately no vendor vocabulary (`osm_id`, `properties`, coordinates, a
 * provider identifier). `formatted` is the one line written into the existing
 * `events.venue` column; there is no venue entity and no second write.
 *
 * Decision history: docs/operating-the-slice.md
 */

export interface VenueSuggestion {
  /** A key for rendering this suggestion in a list, unique within one response and meaningless outside it. Not the provider's identifier. */
  readonly id: string;
  /** The leading line — the place's name, or its street address. */
  readonly label: string;
  /** The qualifying line that tells two similar places apart. May be empty. */
  readonly detail: string;
  /** The single line stored in `events.venue` when this suggestion is chosen. */
  readonly formatted: string;
}

/** The longest venue string this boundary will hand on, bounded here rather than in LAN-76's validation. */
export const MAX_VENUE_LENGTH = 200;

/** The shortest query worth sending; below this, results are noise. Enforced in both the browser and the endpoint. */
export const MIN_QUERY_LENGTH = 3;

/** The longest query worth sending. */
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
