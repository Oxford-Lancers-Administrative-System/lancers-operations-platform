import "server-only";

/**
 * One address search, from a query to an outcome. LAN-115. Failure is a
 * value, not an exception: a geocoder that is down, rate-limiting or
 * unconfigured is not an application fault, and the four outcomes ask
 * different things of the operator (wait, retry, type it yourself, nothing).
 * Never carries the provider's status, body, headers or hostname.
 *
 * Decision history: docs/operating-the-slice.md
 */

import { resolveVenueSearchConfig, type EnvironmentSource } from "./config";
import { mapPhotonPayload, photonRequestUrl } from "./photon";
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, type VenueSuggestion } from "./suggestion";

// "ok" (zero suggestions is normal), "unavailable" (not configured, not a fault), "rate_limited", "provider_error".
export type VenueSearchOutcome =
  | { readonly status: "ok"; readonly suggestions: readonly VenueSuggestion[] }
  | { readonly status: "unavailable"; readonly missing: readonly string[] }
  | { readonly status: "rate_limited" }
  | { readonly status: "provider_error" };

/** How long to wait for a suggestion list; short because this happens while somebody is typing. */
const SEARCH_TIMEOUT_MS = 5_000;

export interface SearchOptions {
  readonly env?: EnvironmentSource;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}

/** Trim and bound what will be sent, without changing what the operator sees. */
export function normalizeQuery(raw: string): string {
  return raw.trim().slice(0, MAX_QUERY_LENGTH);
}

/** Search for a place or address. Shorter than `MIN_QUERY_LENGTH` succeeds with no suggestions and makes no request. */
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
        "user-agent": "lancers-operations-platform (Oxford Lancers venue search)",
      },
      cache: "no-store", // per-keystroke and short-lived; a stale cache would serve a moved-on query
    });
  } catch {
    return { status: "provider_error" };
  }

  if (response.status === 429) return { status: "rate_limited" };
  if (!response.ok) return { status: "provider_error" };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { status: "provider_error" }; // a 200 maintenance page is a failure, not an answer
  }

  return { status: "ok", suggestions: mapPhotonPayload(payload) };
}
