/**
 * The one implemented address provider: Photon. LAN-115.
 *
 * ## Why this provider
 *
 * The issue asks for a provider chosen and documented, and says to stop only
 * for an "owner-level provider/cost decision". Photon is the option that
 * removes that decision rather than deferring it:
 *
 *   * **No account, no API key, no billing relationship.** Nothing to commit,
 *     nothing to leak, and no cost for Brian to approve. Google Places, Mapbox
 *     and the keyed free tiers all require an account and a card on file before
 *     a single suggestion appears, which is an owner decision this issue
 *     explicitly may not take on its own.
 *
 *   * **Built for search-as-you-type.** Photon is Komoot's open-source
 *     geocoder, designed for incremental typing against OpenStreetMap data.
 *     Nominatim — the other keyless OpenStreetMap endpoint, and the obvious
 *     first guess — forbids this use outright: its usage policy names
 *     autocomplete as unacceptable use. Pointing this feature at Nominatim
 *     would be abusing a free service, so it is not offered as an option.
 *
 *   * **Self-hostable and swappable.** Photon is Apache-2.0 and packaged to run
 *     anywhere, so `VENUE_SEARCH_BASE_URL` moves the club off the public
 *     instance without touching this file. If Brian later prefers a commercial
 *     provider, only this module and one branch of `config.ts` change.
 *
 * ## What using the public instance costs, and what it obliges
 *
 * Nothing in money. The public instance at `photon.komoot.io` is offered for
 * free use with a fair-use expectation and no contractual availability. That
 * shapes two decisions elsewhere: the search is debounced in the browser so one
 * operator typing a venue is a handful of requests rather than one per
 * keystroke, and every failure mode falls back to typing the venue by hand. A
 * club drafting a few events a week is far inside fair use; the moment the
 * platform is doing anything heavier, the answer is a self-hosted instance
 * through the base-URL variable, not a louder public one.
 *
 * OpenStreetMap data is ODbL-licensed. Storing one formatted address a
 * volunteer chose, as this does, is ordinary use.
 *
 * ## Why the parsing is this defensive
 *
 * Everything below arrives from a third party over the network, and the module
 * treats it as unknown rather than as its documented shape. A geocoder that
 * returns a maintenance page, a rate-limit body, or a field this code has never
 * seen must produce "no suggestions" — never an exception inside an event form
 * an operator was part-way through.
 */

import { joinAddressParts, MAX_VENUE_LENGTH, type VenueSuggestion } from "./suggestion";

/** The configuration value that selects this provider. */
export const PHOTON_PROVIDER = "photon";

/** The public instance, used unless `VENUE_SEARCH_BASE_URL` says otherwise. */
export const DEFAULT_PHOTON_BASE_URL = "https://photon.komoot.io";

/**
 * Where the club is, so "the sports ground" means the Oxford one.
 *
 * Photon biases results towards a point rather than restricting them to it, so
 * a fixture in Reading is still findable — the club's own pitches simply stop
 * being outranked by better-known places with the same name elsewhere. These
 * are the coordinates of the city, used only to sort somebody else's search
 * results; nothing here is stored on an event.
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
 * One Photon feature, reduced to a leading line and a qualifying line.
 *
 * The leading line is the place's own name where it has one — "Iffley Road
 * Sports Ground" — and its street address where it does not. The qualifying
 * line carries whatever else distinguishes it, which is what LAN-115 means by
 * "enough information to distinguish similarly named places and addresses":
 * two University Parks entries separated only by their postcode are otherwise
 * indistinguishable in a list.
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

/**
 * Map a Photon response body to suggestions, or to none.
 *
 * Never throws. An unparsed body, a body that is not a feature collection, and
 * a feature collection of things this code cannot name all mean the same thing
 * to the operator — no suggestions, type it yourself — and that is a state the
 * field already handles.
 */
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
