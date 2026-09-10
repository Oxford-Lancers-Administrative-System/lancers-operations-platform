// @vitest-environment node
/**
 * The one rule that decides whether an operator's joining link is publishable.
 *
 * Finding F1 of the LAN-272 review is what made this a shared module rather
 * than a private function of the subscription feed: the same field reached an
 * `href` on the fully public event page with no guard at all, because the guard
 * had exactly one copy and the second consumer did not know about it. This
 * table is the rule's own test, so the three callers do not each have to
 * re-prove it.
 */
import { describe, expect, it } from "vitest";

import { isSafeUri, safeUri } from "./safe-uri";

describe("safeUri", () => {
  it.each([
    ["a Teams meeting link", "https://teams.microsoft.com/l/meetup-join/19%3aabc%40thread.v2/0"],
    ["a link with a query and a fragment", "https://meet.example.invalid/room?pin=1#join"],
    ["plain http, which is a web address even if a poor one", "http://meet.example.invalid/room"],
    ["a link carrying commas and semicolons", "https://meet.example.invalid/a,b;c"],
  ])("publishes %s", (_label, value) => {
    expect(safeUri(value)).toBe(value);
  });

  it("returns the trimmed form, so what was checked is what is emitted", () => {
    expect(safeUri("  https://meet.example.invalid/room  ")).toBe(
      "https://meet.example.invalid/room",
    );
  });

  it.each([
    ["a javascript: scheme", "javascript:alert(document.cookie)"],
    ["a javascript: scheme in mixed case", "JaVaScRiPt:alert(1)"],
    ["a data: URI", "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="],
    ["a vbscript: scheme", "vbscript:msgbox(1)"],
    ["a file: URL", "file:///etc/passwd"],
    ["a mailto:, which is not a joining link", "mailto:captain@example.invalid"],
    ["a bare host with no scheme", "teams.example.invalid/x"],
    ["a protocol-relative address", "//teams.example.invalid/x"],
    ["free text", "ask the captain"],
    ["an empty string", ""],
    ["whitespace only", "   "],
  ])("refuses %s", (_label, value) => {
    expect(safeUri(value)).toBeNull();
  });

  it.each([
    ["a line feed", "https://meet.example.invalid/a\nSUMMARY:injected"],
    ["a carriage return", "https://meet.example.invalid/a\rSUMMARY:injected"],
    ["a CRLF pair", "https://meet.example.invalid/a\r\nSUMMARY:injected"],
    ["a tab", "https://meet.example.invalid/a\tb"],
  ])("refuses a value carrying %s", (_label, value) => {
    // Load-bearing in the feed, where this value is emitted raw: a line break
    // would end the content line early and let what followed be parsed as its
    // own iCalendar property.
    expect(safeUri(value)).toBeNull();
  });

  it("refuses every C0 control character and DEL, not only the line breaks", () => {
    for (const code of [0x00, 0x07, 0x0b, 0x1f, 0x7f]) {
      const value = `https://meet.example.invalid/a${String.fromCharCode(code)}b`;
      expect(safeUri(value), `code point ${code}`).toBeNull();
    }
  });

  it("treats a missing value as no link rather than a bad one", () => {
    expect(safeUri(null)).toBeNull();
    expect(safeUri(undefined)).toBeNull();
  });
});

describe("isSafeUri", () => {
  it("answers true for a value the operator simply did not fill in", () => {
    // Not unsafe, absent. Whether a link is allowed on this event at all is a
    // separate rule, and it lives with the delivery mode.
    expect(isSafeUri(null)).toBe(true);
    expect(isSafeUri(undefined)).toBe(true);
    expect(isSafeUri("")).toBe(true);
    expect(isSafeUri("   ")).toBe(true);
  });

  it("answers for everything else exactly as safeUri does", () => {
    expect(isSafeUri("https://meet.example.invalid/room")).toBe(true);
    expect(isSafeUri("javascript:alert(1)")).toBe(false);
    expect(isSafeUri("teams.example.invalid/x")).toBe(false);
  });
});
