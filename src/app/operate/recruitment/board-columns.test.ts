import { describe, expect, it } from "vitest";

import { BAND_COLOURS } from "@/components/band-colours";
import { templateColourFor } from "@/lib/services/event-template-input";
import { bandColour } from "./board-columns";

/**
 * LAN-423 round 6 (Brian): an event band wears its event's template colour,
 * so the events read apart from the Recruitment band; Recruitment keeps its own.
 */
describe("bandColour", () => {
  it("draws an event band in its template's swatch, with that swatch's band text", () => {
    for (const key of ["teal", "lancer_gold", "red"]) {
      const colours = bandColour("events:event-1", BAND_COLOURS, key);
      expect(colours.header).toBe(templateColourFor(key).accent);
      expect(colours.text).toBe(templateColourFor(key).bandText);
    }
  });

  it("keeps Recruitment's own colour whatever an event wears", () => {
    expect(bandColour("recruitment", BAND_COLOURS, "teal")).toBe(BAND_COLOURS.recruitment);
    expect(bandColour("person", BAND_COLOURS, "teal")).toBe(BAND_COLOURS.person);
  });

  it("falls back to the Season blue for an event with no template colour", () => {
    expect(bandColour("events:event-1", BAND_COLOURS, null)).toBe(BAND_COLOURS.season);
  });
});
