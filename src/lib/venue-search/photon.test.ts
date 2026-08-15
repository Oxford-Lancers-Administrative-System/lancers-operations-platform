/**
 * The vendor boundary — LAN-115.
 *
 * Two things are proved here. That a real feature collection becomes something
 * an operator can tell apart ("enough information to distinguish similarly
 * named places and addresses"), and that a response which is not one becomes no
 * suggestions rather than an exception inside a half-filled event form.
 */
import { describe, expect, it } from "vitest";

import { mapPhotonPayload, photonRequestUrl, SUGGESTION_LIMIT } from "./photon";
import { MAX_VENUE_LENGTH } from "./suggestion";

function feature(properties: Record<string, unknown>) {
  return { type: "Feature", geometry: { type: "Point", coordinates: [-1.25, 51.75] }, properties };
}

describe("photonRequestUrl", () => {
  it("asks the configured instance, biased towards Oxford", () => {
    const url = new URL(photonRequestUrl("https://photon.komoot.io", "iffley road"));
    expect(url.origin).toBe("https://photon.komoot.io");
    expect(url.pathname).toBe("/api");
    expect(url.searchParams.get("q")).toBe("iffley road");
    expect(url.searchParams.get("limit")).toBe(String(SUGGESTION_LIMIT));
    expect(url.searchParams.get("lat")).toBe("51.7520");
    expect(url.searchParams.get("lon")).toBe("-1.2577");
  });

  it("keeps a self-hosted path prefix, and does not double its slash", () => {
    const url = new URL(photonRequestUrl("https://geo.example.org/photon/", "parks"));
    expect(url.pathname).toBe("/photon/api");
  });

  it("escapes a query rather than letting it add parameters", () => {
    const url = new URL(photonRequestUrl("https://photon.komoot.io", "a&limit=9999&q=b"));
    expect(url.searchParams.get("q")).toBe("a&limit=9999&q=b");
    expect(url.searchParams.get("limit")).toBe(String(SUGGESTION_LIMIT));
  });
});

describe("mapPhotonPayload", () => {
  it("leads with a place's name and qualifies it with its address", () => {
    const [suggestion] = mapPhotonPayload({
      features: [
        feature({
          name: "Iffley Road Sports Ground",
          street: "Iffley Road",
          housenumber: "76",
          city: "Oxford",
          county: "Oxfordshire",
          postcode: "OX4 1EQ",
          country: "United Kingdom",
        }),
      ],
    });

    expect(suggestion.label).toBe("Iffley Road Sports Ground");
    expect(suggestion.detail).toBe("76 Iffley Road, Oxford, Oxfordshire, OX4 1EQ, United Kingdom");
    expect(suggestion.formatted).toBe(
      "Iffley Road Sports Ground, 76 Iffley Road, Oxford, Oxfordshire, OX4 1EQ, United Kingdom",
    );
  });

  it("leads with the street address when the place has no name of its own", () => {
    const [suggestion] = mapPhotonPayload({
      features: [
        feature({
          street: "Woodstock Road",
          housenumber: "12",
          city: "Oxford",
          postcode: "OX2 6HT",
        }),
      ],
    });

    expect(suggestion.label).toBe("12 Woodstock Road");
    // The street led, so it is not repeated underneath itself.
    expect(suggestion.detail).toBe("Oxford, OX2 6HT");
  });

  it("distinguishes two places sharing a name", () => {
    const suggestions = mapPhotonPayload({
      features: [
        feature({ name: "University Parks", city: "Oxford", postcode: "OX1 3RF" }),
        feature({ name: "University Parks", city: "Oxford", postcode: "OX2 6HG" }),
      ],
    });

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].formatted).not.toBe(suggestions[1].formatted);
  });

  it("drops a duplicate the provider returned twice", () => {
    const suggestions = mapPhotonPayload({
      features: [
        feature({ name: "Marston Ferry Link", city: "Oxford", osm_id: 1 }),
        feature({ name: "Marston Ferry Link", city: "Oxford", osm_id: 2 }),
      ],
    });
    expect(suggestions).toHaveLength(1);
  });

  it("carries no coordinates and no provider identifier into the application", () => {
    const [suggestion] = mapPhotonPayload({
      features: [feature({ name: "Horspath Sports Ground", osm_id: 4242, osm_type: "W" })],
    });

    expect(Object.keys(suggestion).sort()).toEqual(["detail", "formatted", "id", "label"]);
    expect(JSON.stringify(suggestion)).not.toContain("4242");
  });

  it("bounds a formatted address the provider made very long", () => {
    const [suggestion] = mapPhotonPayload({
      features: [feature({ name: "x".repeat(500), city: "Oxford" })],
    });
    expect(suggestion.formatted.length).toBeLessThanOrEqual(MAX_VENUE_LENGTH);
  });

  it("skips a feature with nothing to call it", () => {
    expect(mapPhotonPayload({ features: [feature({ postcode: "OX1 1AA" })] })).toEqual([]);
  });

  it.each([
    ["a maintenance page", "<html>down for maintenance</html>"],
    ["null", null],
    ["an array", [1, 2, 3]],
    ["an object with no features", { message: "quota exceeded" }],
    ["features that are not features", { features: [null, 7, "street"] }],
    ["a feature with no properties", { features: [{ type: "Feature" }] }],
  ])("returns no suggestions, and does not throw, for %s", (_case, payload) => {
    expect(() => mapPhotonPayload(payload)).not.toThrow();
    expect(mapPhotonPayload(payload)).toEqual([]);
  });
});
