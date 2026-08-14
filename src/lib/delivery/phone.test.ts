// @vitest-environment node
/**
 * Turning a recorded contact into an E.164 number. LAN-78.
 *
 * The values below are the shapes the club's real data actually has, per
 * Source Data Analysis §11.1 — spaces, a missing leading zero, a number one
 * digit short — and every UK number here is in Ofcom's reserved 07700 900xxx
 * drama range, so none of them can reach a person.
 *
 * The tests that matter most are the refusals. A wrong conversion sends a club
 * invitation, carrying a working RSVP link, to a stranger.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { selectMobileNumber, toE164, type ContactPointRow } from "./phone";

describe("converting a number", () => {
  it.each([
    ["07700 900123", "447700900123"],
    ["07700900123", "447700900123"],
    ["+44 7700 900123", "447700900123"],
    ["0044 7700 900123", "447700900123"],
    ["447700900123", "447700900123"],
    ["(07700) 900-123", "447700900123"],
    ["  07700 900123  ", "447700900123"],
  ])("converts %s", (raw, expected) => {
    expect(toE164(raw, "44")).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["ask Sam", "not a number at all"],
    ["alex@example.org", "an email in the phone column"],
    ["7700900123", "no trunk zero and no country code — genuinely ambiguous"],
    ["0770090", "too short to route"],
    ["0770090012345678901", "too long for E.164"],
  ])("refuses %s (%s)", (raw) => {
    expect(toE164(raw, "44")).toBeNull();
  });

  it("does not repair a number that is one digit short", () => {
    // The club's data contains these. Storing them is right; sending to them is
    // not, and padding one would be a guess at somebody's phone number.
    expect(toE164("07700 90012", "44")).toBeNull();
  });
});

describe("choosing which contact to use", () => {
  const contact = (overrides: Partial<ContactPointRow>): ContactPointRow => ({
    kind: "phone",
    rawValue: "07700 900123",
    normalisedValue: null,
    isPreferred: false,
    ...overrides,
  });

  it("prefers the contact the club marked preferred", () => {
    const chosen = selectMobileNumber(
      [
        contact({ rawValue: "07700 900111" }),
        contact({ rawValue: "07700 900222", isPreferred: true }),
      ],
      "44",
    );
    expect(chosen).toBe("447700900222");
  });

  it("ignores email contact points entirely", () => {
    expect(selectMobileNumber([contact({ kind: "email", rawValue: "a@b.test" })], "44")).toBeNull();
  });

  it("falls back to the raw value when the stored normalisation is unusable", () => {
    // `normalised_value` is the club's own cleaned form, and it is checked
    // rather than trusted — intake may have written something that is not E.164.
    const chosen = selectMobileNumber(
      [contact({ normalisedValue: "not a number", rawValue: "07700 900123" })],
      "44",
    );
    expect(chosen).toBe("447700900123");
  });

  it("returns null when nothing converts, rather than the closest thing", () => {
    expect(selectMobileNumber([contact({ rawValue: "ask Sam" })], "44")).toBeNull();
    expect(selectMobileNumber([], "44")).toBeNull();
  });
});
