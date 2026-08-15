import "server-only";

/**
 * Address-search configuration, read from the environment and from nowhere
 * else. LAN-115.
 *
 * This file is deliberately the same shape as `src/lib/delivery/config.ts`,
 * because it answers the same question under the same working agreement: which
 * external service may this deployment talk to, and what happens when nobody
 * has said.
 *
 *   * **No hard-coded host.** The provider's endpoint arrives as an environment
 *     variable with a documented default, so a self-hosted instance is a
 *     configuration change rather than a code change.
 *
 *   * **A missing value is a refusal, never a default.** An unconfigured
 *     deployment performs no address search at all and tells the operator so;
 *     it does not quietly reach out to a third party nobody chose. LAN-115's
 *     acceptance criteria forbid a "hidden provider dependency", and a provider
 *     that turns itself on when unconfigured is exactly that.
 *
 * ## Why the unconfigured case is expected rather than exceptional
 *
 * Venue entry is free text and remains free text. Address search is an
 * assistance on top of it, so a deployment with no provider is a legitimate,
 * fully-working deployment with a slightly more manual venue field — which is
 * what every CI run is, and what the deployed container is until Brian chooses
 * to configure one. Returning `{ configured: false, missing }` lets the search
 * endpoint say "not configured" in the operator's own words instead of throwing
 * a 500 into a form that was working fine.
 *
 * ## There is no credential here, and that is the point
 *
 * The one implemented provider needs no account, no API key and no billing
 * relationship — see `photon.ts` for why that provider was chosen. Nothing in
 * this file reads a secret, so nothing in this file can leak one. If a keyed
 * provider is ever added, its credential is server-only, comes from Secret
 * Manager in Cloud Run, and is named here but never rendered, returned from a
 * route, logged or put in an audit row.
 */

import { DEFAULT_PHOTON_BASE_URL, PHOTON_PROVIDER } from "./photon";

/**
 * The environment, as this module is willing to read it.
 *
 * Looser than `NodeJS.ProcessEnv` so a test can pass a small literal, exactly
 * as the delivery configuration does. Nothing here reads a variable this file
 * does not name.
 */
export type EnvironmentSource = Record<string, string | undefined>;

/** The environment variables this module reads, and no others. */
export const PROVIDER_VARIABLE = "VENUE_SEARCH_PROVIDER";
export const BASE_URL_VARIABLE = "VENUE_SEARCH_BASE_URL";

/** The one provider implemented today. Adding a second one adds a case here. */
export type VenueSearchProvider = typeof PHOTON_PROVIDER;

export interface ConfiguredVenueSearch {
  readonly configured: true;
  readonly provider: VenueSearchProvider;
  /** Origin and path prefix of the geocoder, without a trailing slash. */
  readonly baseUrl: string;
}

export interface UnconfiguredVenueSearch {
  readonly configured: false;
  /** The variables that are absent or unusable, by name — never by value. */
  readonly missing: readonly string[];
}

export type VenueSearchConfig = ConfiguredVenueSearch | UnconfiguredVenueSearch;

function trimmed(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Is this a base URL we are willing to send an operator's query to?
 *
 * Parsed rather than pattern-matched, and restricted to HTTP(S), because this
 * value decides the destination of a server-side request made on behalf of a
 * signed-in operator. A misconfigured or hostile value must fail closed into
 * "unconfigured" — where the field still works and nothing is sent — rather
 * than become a request to whatever was in the variable.
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
 * Resolve address-search configuration, failing closed.
 *
 * The provider must be named explicitly. Unset is not "use the default
 * provider" — it is "no provider", which is the whole of the no-hidden-
 * dependency rule. An unrecognised name is treated the same way and names the
 * variable, so a typo produces a manual venue field and a clear reason rather
 * than a silent fallback to a service the deployment did not ask for.
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

/**
 * A sentence naming what is absent, for a log or a developer-facing response.
 *
 * Names variables, never values — the same rule the delivery configuration
 * follows, kept here so the habit survives a future keyed provider.
 */
export function describeMissingConfiguration(missing: readonly string[]): string {
  return `Address search is not configured. Absent or unusable: ${missing.join(", ")}.`;
}
