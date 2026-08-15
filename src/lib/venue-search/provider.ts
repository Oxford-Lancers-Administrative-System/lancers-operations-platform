import "server-only";

/**
 * One address search, from a query to an outcome. LAN-115.
 *
 * Everything vendor-shaped is on the other side of this function: `photon.ts`
 * knows what a feature collection is, this module knows what a failure is, and
 * the route handler and the form know only `VenueSearchOutcome`.
 *
 * ## Why failure is a value rather than an exception
 *
 * Every outcome here is something the operator is shown and can act on. A
 * geocoder that is down, rate-limiting, or simply unconfigured is not an
 * application fault: the venue field is free text with or without it, and the
 * only correct response is a sentence telling the operator to type the venue
 * themselves. Modelling those as thrown errors would put a working form one
 * unhandled rejection away from an error boundary, for a service that was never
 * required in the first place.
 *
 * The four outcomes are distinguished because they ask different things of the
 * operator — wait, retry later, type it yourself, or nothing at all — which is
 * LAN-115's "no-results, provider-error, rate-limit, and unavailable-provider
 * states are understandable".
 *
 * ## What is never in an outcome
 *
 * The provider's status code, body, headers or hostname. A geocoder's error
 * page is not something to render inside the club's event editor, and the
 * endpoint's URL is configuration rather than something a browser needs told.
 * `unavailable` names absent *variables*, never their values, matching the
 * delivery adapter's rule.
 */

import { resolveVenueSearchConfig, type EnvironmentSource } from "./config";
import { mapPhotonPayload, photonRequestUrl } from "./photon";
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, type VenueSuggestion } from "./suggestion";

export type VenueSearchOutcome =
  /** The provider answered. Zero suggestions is a normal, successful answer. */
  | { readonly status: "ok"; readonly suggestions: readonly VenueSuggestion[] }
  /** No provider is configured for this deployment. Not a fault. */
  | { readonly status: "unavailable"; readonly missing: readonly string[] }
  /** The provider asked us to slow down. Waiting is the correct response. */
  | { readonly status: "rate_limited" }
  /** The provider failed, timed out, or answered with something unusable. */
  | { readonly status: "provider_error" };

/**
 * How long the club will wait for a suggestion list.
 *
 * Short on purpose. This request happens while somebody is typing, and a
 * geocoder that has not answered in five seconds has already failed as far as
 * that operator is concerned. The timeout also bounds how long a request holds
 * a server connection when the provider is hanging rather than refusing.
 */
export const SEARCH_TIMEOUT_MS = 5_000;

export interface SearchOptions {
  /** Defaults to `process.env`. A test passes its own literal. */
  readonly env?: EnvironmentSource;
  /** Defaults to the global `fetch`. A test passes a stub; nothing else should. */
  readonly fetchImpl?: typeof fetch;
  /** Cancels the request when the caller has gone away. */
  readonly signal?: AbortSignal;
}

/** Trim and bound what will be sent, without changing what the operator sees. */
export function normalizeQuery(raw: string): string {
  return raw.trim().slice(0, MAX_QUERY_LENGTH);
}

/**
 * Search for a place or address.
 *
 * A query shorter than `MIN_QUERY_LENGTH` succeeds with no suggestions and
 * makes no request — an empty field is not an error, and neither is "ox".
 */
export async function searchVenues(
  rawQuery: string,
  options: SearchOptions = {},
): Promise<VenueSearchOutcome> {
  const query = normalizeQuery(rawQuery);
  if (query.length < MIN_QUERY_LENGTH) {
    return { status: "ok", suggestions: [] };
  }

  const config = resolveVenueSearchConfig(options.env ?? process.env);
  if (!config.configured) {
    return { status: "unavailable", missing: config.missing };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetchImpl(photonRequestUrl(config.baseUrl, query), {
      method: "GET",
      signal,
      headers: {
        accept: "application/json",
        // Fair use of a free public instance starts with being identifiable.
        "user-agent": "lancers-operations-platform (Oxford Lancers venue search)",
      },
      // Suggestions are per-keystroke and short-lived; a cache between here and
      // the provider would serve a stale list for a query that has moved on.
      cache: "no-store",
    });
  } catch {
    // Network failure, DNS failure, timeout, or the caller navigated away. None
    // of them are distinguishable to the operator, and all mean the same thing.
    return { status: "provider_error" };
  }

  if (response.status === 429) return { status: "rate_limited" };
  if (!response.ok) return { status: "provider_error" };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // A 200 carrying a maintenance page is a provider failure, not an answer.
    return { status: "provider_error" };
  }

  return { status: "ok", suggestions: mapPhotonPayload(payload) };
}
