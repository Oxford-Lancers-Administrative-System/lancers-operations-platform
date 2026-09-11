/**
 * The one implemented address provider: Photon. LAN-115. Chosen because it
 * needs no account, key or billing relationship (an owner decision this issue
 * may not take on its own), and is built for search-as-you-type against
 * OpenStreetMap data, unlike Nominatim. Self-hostable via
 * `VENUE_SEARCH_BASE_URL`. Parsing below is defensive: a third-party response
 * this code cannot read must produce "no suggestions", never an exception in
 * an event form an operator was part-way through.
 *
 * Decision history: docs/operating-the-slice.md
 */

import { joinAddressParts, MAX_VENUE_LENGTH, type VenueSuggestion } from "./suggestion";

/** The configuration value that selects this provider. */
export const PHOTON_PROVIDER = "photon";

/** The public instance, used unless `VENUE_SEARCH_BASE_URL` says otherwise. */
export const DEFAULT_PHOTON_BASE_URL = "https://photon.komoot.io";

/**
 * Where the club is, so "the sports ground" means the Oxford one. Photon
 * biases results towards this point rather than restricting to it, so a
 * fixture in Reading is still findable.
 */
const OXFORD_LATITUDE = "51.7520";
const OXFORD_LONGITUDE = "-1.2577";

/** How many suggestions to ask for. Enough to choose from, short enough to read. */
export const SUGGESTION_LIMIT = 8;

/** Build the request URL for one query. */
export function photonRequestUrl(baseUrl: string, query: string): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/api`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(SUGGESTION_LIMIT));
  url.searchParams.set("lang", "en");
  url.searchParams.set("lat", OXFORD_LATITUDE);
  url.searchParams.set("lon", OXFORD_LONGITUDE);
  return url.toString();
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One Photon feature, reduced to a leading line (the place's own name, or its
 * street address) and a qualifying line carrying whatever else distinguishes
 * it — LAN-115's "enough information to distinguish similarly named places".
 */
function toSuggestion(feature: unknown, index: number): VenueSuggestion | null {
  if (!isRecord(feature)) return null;
  const properties = feature.properties;
  if (!isRecord(properties)) return null;

  const name = readString(properties, "name");
  const houseNumber = readString(properties, "housenumber");
  const street = readString(properties, "street");
  const streetLine = joinAddressParts([[houseNumber, street].filter(Boolean).join(" ")]);

  const district = readString(properties, "district");
  const city = readString(properties, "city");
  const county = readString(properties, "county");
  const postcode = readString(properties, "postcode");
  const country = readString(properties, "country");

  // Named place: the name leads and the street qualifies it. Plain address: the
  // street leads and there is nothing left to repeat below it.
  const label = name !== "" ? name : streetLine !== "" ? streetLine : city;
  if (label === "") return null;

  const detail = joinAddressParts([
    label === streetLine ? "" : streetLine,
    district,
    city,
    county,
    postcode,
    country,
  ]);

  const formatted = joinAddressParts([label, detail]).slice(0, MAX_VENUE_LENGTH).trim();
  if (formatted === "") return null;

  return { id: String(index), label, detail, formatted };
}

/** Map a Photon response body to suggestions, or to none. Never throws. */
export function mapPhotonPayload(payload: unknown): VenueSuggestion[] {
  if (!isRecord(payload)) return [];
  const features = payload.features;
  if (!Array.isArray(features)) return [];

  const suggestions: VenueSuggestion[] = [];
  const seen = new Set<string>();

  for (const [index, feature] of features.entries()) {
    const suggestion = toSuggestion(feature, index);
    if (suggestion === null) continue;

    // Photon happily returns the same place twice from different OSM objects.
    // Two identical lines in a list are a choice an operator cannot make.
    const key = suggestion.formatted.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push(suggestion);
  }

  return suggestions;
}
