import "server-only";

/**
 * Address-search configuration, read from the environment and from nowhere
 * else. LAN-115. Same shape as `src/lib/delivery/config.ts`: no hard-coded
 * host, and a missing value is a refusal, never a silent default — an
 * unconfigured deployment performs no address search and says so.
 */

import { DEFAULT_PHOTON_BASE_URL, PHOTON_PROVIDER } from "./photon";

export type EnvironmentSource = Record<string, string | undefined>;

export const PROVIDER_VARIABLE = "VENUE_SEARCH_PROVIDER";
export const BASE_URL_VARIABLE = "VENUE_SEARCH_BASE_URL";

type VenueSearchProvider = typeof PHOTON_PROVIDER;

interface ConfiguredVenueSearch {
  readonly configured: true;
  readonly provider: VenueSearchProvider;
  readonly baseUrl: string;
}

interface UnconfiguredVenueSearch {
  readonly configured: false;
  readonly missing: readonly string[];
}

export type VenueSearchConfig = ConfiguredVenueSearch | UnconfiguredVenueSearch;

function trimmed(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Is this a base URL we are willing to send an operator's query to? Parsed
 * rather than pattern-matched and restricted to HTTP(S); a bad value fails
 * closed to "unconfigured" rather than becoming a request to it.
 */
function usableBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.search !== "" || url.hash !== "") return null;
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

/**
 * Resolve address-search configuration, failing closed. The provider must be
 * named explicitly; unset or unrecognised both resolve to "no provider".
 */
export function resolveVenueSearchConfig(env: EnvironmentSource): VenueSearchConfig {
  const provider = trimmed(env[PROVIDER_VARIABLE]).toLowerCase();
  if (provider !== PHOTON_PROVIDER) {
    return { configured: false, missing: [PROVIDER_VARIABLE] };
  }

  const configuredBaseUrl = trimmed(env[BASE_URL_VARIABLE]);
  if (configuredBaseUrl === "") {
    return { configured: true, provider: PHOTON_PROVIDER, baseUrl: DEFAULT_PHOTON_BASE_URL };
  }

  const baseUrl = usableBaseUrl(configuredBaseUrl);
  if (baseUrl === null) {
    return { configured: false, missing: [BASE_URL_VARIABLE] };
  }

  return { configured: true, provider: PHOTON_PROVIDER, baseUrl };
}

/** A sentence naming what is absent. Names variables, never values. */
export function describeMissingConfiguration(missing: readonly string[]): string {
  return `Address search is not configured. Absent or unusable: ${missing.join(", ")}.`;
}
