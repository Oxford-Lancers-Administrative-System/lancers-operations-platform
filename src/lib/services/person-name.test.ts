/**
 * LAN-306. The rule three surfaces used to disagree about, now in one place:
 * the name is the formal one, and Known as is a value of its own.
 */
import { describe, expect, it } from "vitest";

import { knownAsOf, personDisplayName } from "./person-name";

describe("personDisplayName", () => {
  it("is the formal given and family name, whatever alias the person holds", () => {
    // The whole finding: the person record substituted the alias here and the
    // roster did not, so one person read as two either side of a conversion.
    expect(personDisplayName("Jonathan", "Ashcombe")).toBe("Jonathan Ashcombe");
  });

  it("is the given name alone when no family name is recorded", () => {
    expect(personDisplayName("Lysander", null)).toBe("Lysander");
  });

  it("trims, so a stray space in the record does not become a double space on screen", () => {
    expect(personDisplayName("  Jonathan ", " Ashcombe ")).toBe("Jonathan Ashcombe");
    expect(personDisplayName("Jonathan", "   ")).toBe("Jonathan");
  });
});

describe("knownAsOf", () => {
  it("returns an alias that differs from the given name", () => {
    expect(knownAsOf("Jonathan", "Jonty")).toBe("Jonty");
  });

  it("returns a multi-word alias whole", () => {
    expect(knownAsOf("Jonathan", "Big Jonty")).toBe("Big Jonty");
  });

  it("returns nothing when no alias is flagged", () => {
    expect(knownAsOf("Jonathan", null)).toBeNull();
    expect(knownAsOf("Jonathan", "   ")).toBeNull();
  });

  it("returns nothing for an alias that only repeats the given name", () => {
    // "Jonathan, known as Jonathan" says nothing. The add door already refuses
    // to write one; this stops an older row rendering it.
    expect(knownAsOf("Jonathan", "Jonathan")).toBeNull();
    expect(knownAsOf("Jonathan", " jonathan ")).toBeNull();
  });
});
