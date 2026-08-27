import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const app = path.join(root, "src", "app");

function filesBelow(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(absolute) : [absolute];
  });
}

const TOKEN_ACCESS =
  /searchParams\.get\("token_hash"\)|hub\.verify_token|resolveRsvpTokenIn|form\.get\("token"\)/;

const expected = [
  {
    source: "src/app/api/webhooks/whatsapp/route.ts",
    test: "src/app/api/webhooks/whatsapp/route.test.ts",
    refusal: /the wrong token[\s\S]*no token[\s\S]*status\)\.toBe\(403\)/,
  },
  {
    source: "src/app/auth/invitation/route.ts",
    test: "src/app/auth/invitation/route.test.ts",
    refusal: /an injected token[\s\S]*verifyOtp\)\.not\.toHaveBeenCalled/,
  },
  {
    source: "src/app/auth/recovery/route.ts",
    test: "src/app/auth/recovery/route.test.ts",
    refusal: /an injected token[\s\S]*verifyOtp\)\.not\.toHaveBeenCalled/,
  },
  {
    source: "src/app/rsvp/[token]/actions.ts",
    test: "src/app/rsvp/[token]/actions.test.ts",
    refusal: /refuses an anonymous injected token[\s\S]*error=\$\{CLOSED_ERROR\}/,
  },
  {
    source: "src/app/rsvp/[token]/page.tsx",
    test: "src/app/rsvp/[token]/screens.test.tsx",
    refusal:
      /TERMINAL: TokenState\[\] = \["unknown", "expired", "revoked", "superseded", "event_started"\]/,
  },
  {
    source: "src/app/a/[token]/actions.ts",
    test: "src/app/a/[token]/actions.test.ts",
    refusal:
      /refuses an anonymous injected token[\s\S]*consumeAnswerTokenIn\)\.toHaveBeenCalledWith/,
  },
  {
    source: "src/app/me/[token]/actions.ts",
    test: "src/app/me/[token]/actions.test.ts",
    refusal:
      /refuses an anonymous injected token[\s\S]*resolvePersonTokenIn\)\.toHaveBeenCalledWith/,
  },
];

describe("anonymous abuse of every token-bearing route", () => {
  it("keeps the executable negative-suite inventory exhaustive", () => {
    const discovered = filesBelow(app)
      .filter((file) => /\/(route\.ts|page\.tsx|actions\.ts)$/.test(file))
      .filter((file) => TOKEN_ACCESS.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file))
      .sort();

    expect(discovered).toEqual(expected.map((entry) => entry.source).sort());
  });

  it.each(expected)("$source executes an anonymous negative case in $test", ({ test, refusal }) => {
    expect(fs.readFileSync(path.join(root, test), "utf8")).toMatch(refusal);
  });
});
