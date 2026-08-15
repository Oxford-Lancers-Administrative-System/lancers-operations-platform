// @vitest-environment node
/**
 * The one same-origin relative-path rule — LAN-125.
 *
 * Five places now depend on this function, so what it refuses is asserted here
 * rather than at each of them. Two of the cases exist because the two-character
 * check it replaced let them through, and one of those — the backslash — is
 * proved against Node's own URL parser rather than asserted from memory, since
 * the whole claim is "browsers read this as an authority".
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_DESTINATION, safeRelativeDestination } from "./destination";

describe("a same-origin relative path is kept", () => {
  it.each([
    "/operate",
    "/operate/roster",
    "/operate/events/8f2b0c1e/attendance",
    "/operate/roster?q=pike",
    "/operate/report#latest",
  ])("keeps %s", (path) => {
    expect(safeRelativeDestination(path)).toBe(path);
  });

  it("takes the first entry when Next.js repeats the parameter", () => {
    expect(safeRelativeDestination(["/operate/roster", "/elsewhere"])).toBe("/operate/roster");
  });
});

describe("anything that could leave this origin falls back", () => {
  it.each([
    ["an absolute URL", "https://evil.example/steal"],
    ["a protocol-relative URL", "//evil.example"],
    ["a scheme-only jump", "javascript:alert(1)"],
    ["a bare word", "operate"],
    ["a backslash authority", "/\\evil.example"],
    ["a mixed slash authority", "/\\/evil.example"],
    ["an empty string", ""],
    ["a newline", "/operate\u000aLocation: https://evil.example"],
    ["a tab", "/\u0009evil.example"],
    ["a NUL", "/operate\u0000"],
  ])("refuses %s", (_why, value) => {
    expect(safeRelativeDestination(value)).toBe(DEFAULT_DESTINATION);
  });

  it.each([undefined, null, 42, {}, [], [null]])("refuses the non-string %s", (value) => {
    expect(safeRelativeDestination(value)).toBe(DEFAULT_DESTINATION);
  });

  it("refuses an absurdly long path rather than passing it to a redirect", () => {
    expect(safeRelativeDestination(`/${"a".repeat(600)}`)).toBe(DEFAULT_DESTINATION);
  });

  it("honours a caller's own fallback", () => {
    expect(safeRelativeDestination("//evil.example", "/login")).toBe("/login");
  });
});

describe("the backslash case is real, not defensive folklore", () => {
  it.each(["/\\evil.example", "/\\/evil.example"])(
    "%s resolves to a foreign host under WHATWG URL parsing",
    (candidate) => {
      // If this ever stops being true the refusal above is merely harmless. It
      // is here so the reason for the refusal is checkable rather than asserted.
      expect(new URL(candidate, "https://lancers.example").hostname).toBe("evil.example");
    },
  );

  it("and the accepted values do not", () => {
    expect(new URL("/operate/roster", "https://lancers.example").hostname).toBe("lancers.example");
  });
});
