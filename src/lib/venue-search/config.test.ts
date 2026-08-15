// @vitest-environment node
/**
 * Address-search configuration fails closed — LAN-115.
 *
 * The criterion these protect is "no ... hidden provider dependency is
 * introduced". An unconfigured deployment must reach nobody, and a
 * misconfigured one must reach nobody rather than reaching whatever was in the
 * variable.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BASE_URL_VARIABLE,
  describeMissingConfiguration,
  PROVIDER_VARIABLE,
  resolveVenueSearchConfig,
} from "./config";
import { DEFAULT_PHOTON_BASE_URL } from "./photon";

describe("resolveVenueSearchConfig", () => {
  it("is unconfigured when no provider is named, and names the variable", () => {
    const config = resolveVenueSearchConfig({});
    expect(config.configured).toBe(false);
    expect(config.configured === false && config.missing).toEqual([PROVIDER_VARIABLE]);
  });

  it("does not treat an unset provider as permission to use the default one", () => {
    // The whole of the no-hidden-dependency rule: a deployment that said
    // nothing gets nothing, not the public geocoder by implication.
    const config = resolveVenueSearchConfig({ VENUE_SEARCH_BASE_URL: DEFAULT_PHOTON_BASE_URL });
    expect(config.configured).toBe(false);
  });

  it("refuses a provider it has not implemented", () => {
    const config = resolveVenueSearchConfig({ VENUE_SEARCH_PROVIDER: "google-places" });
    expect(config.configured).toBe(false);
    expect(config.configured === false && config.missing).toEqual([PROVIDER_VARIABLE]);
  });

  it("configures the public instance when only the provider is named", () => {
    const config = resolveVenueSearchConfig({ VENUE_SEARCH_PROVIDER: "photon" });
    expect(config).toEqual({
      configured: true,
      provider: "photon",
      baseUrl: DEFAULT_PHOTON_BASE_URL,
    });
  });

  it("accepts the provider name whatever case and spacing it arrives in", () => {
    const config = resolveVenueSearchConfig({ VENUE_SEARCH_PROVIDER: "  Photon  " });
    expect(config.configured).toBe(true);
  });

  it("takes a self-hosted base URL, and strips its trailing slashes", () => {
    const config = resolveVenueSearchConfig({
      VENUE_SEARCH_PROVIDER: "photon",
      VENUE_SEARCH_BASE_URL: "https://geocoder.example.org/photon//",
    });
    expect(config.configured === true && config.baseUrl).toBe(
      "https://geocoder.example.org/photon",
    );
  });

  it.each([
    ["not a URL at all", "geocoder.example.org"],
    ["a non-HTTP scheme", "file:///etc/passwd"],
    ["credentials in the URL", "https://user:secret@geocoder.example.org"],
    ["a query string", "https://geocoder.example.org/?key=leaked"],
  ])("is unconfigured rather than trusting %s", (_case, baseUrl) => {
    const config = resolveVenueSearchConfig({
      VENUE_SEARCH_PROVIDER: "photon",
      VENUE_SEARCH_BASE_URL: baseUrl,
    });
    expect(config.configured).toBe(false);
    expect(config.configured === false && config.missing).toEqual([BASE_URL_VARIABLE]);
  });
});

describe("describeMissingConfiguration", () => {
  it("names variables, and says nothing else", () => {
    const sentence = describeMissingConfiguration([PROVIDER_VARIABLE, BASE_URL_VARIABLE]);
    expect(sentence).toContain(PROVIDER_VARIABLE);
    expect(sentence).toContain(BASE_URL_VARIABLE);
  });
});
