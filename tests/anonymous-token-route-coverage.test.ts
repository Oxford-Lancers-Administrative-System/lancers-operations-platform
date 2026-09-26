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

// LAN-441 moved the email-link token from the callback's query string to its
// page's `query.token_hash` and the exchange's form body, so both are matched.
const TOKEN_ACCESS =
  /get\("token_hash"\)|query\.token_hash|hub\.verify_token|resolveRsvpTokenIn|form\.get\("token"\)/;

const expected = [
  {
    source: "src/app/api/webhooks/whatsapp/route.ts",
    test: "src/app/api/webhooks/whatsapp/route.test.ts",
    refusal: /the wrong token[\s\S]*no token[\s\S]*status\)\.toBe\(403\)/,
  },
  {
    source: "src/app/auth/invitation/exchange/route.ts",
    test: "src/app/auth/invitation/exchange/route.test.ts",
    refusal: /an injected token[\s\S]*verifyOtp\)\.not\.toHaveBeenCalled/,
  },
  {
    source: "src/app/auth/invitation/page.tsx",
    test: "src/app/auth/invitation/screens.test.tsx",
    refusal: /an injected token[\s\S]*verifyOtp\)\.not\.toHaveBeenCalled/,
  },
  {
    source: "src/app/auth/recovery/exchange/route.ts",
    test: "src/app/auth/recovery/exchange/route.test.ts",
    refusal: /an injected token[\s\S]*verifyOtp\)\.not\.toHaveBeenCalled/,
  },
  {
    source: "src/app/auth/recovery/page.tsx",
    test: "src/app/auth/recovery/screens.test.tsx",
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
    source: "src/app/a/[answer]/[token]/actions.ts",
    test: "src/app/a/[answer]/[token]/actions.test.ts",
    refusal:
      /refuses an anonymous injected token[\s\S]*consumeAnswerTokenIn\)\.toHaveBeenCalledWith/,
  },
  {
    source: "src/app/events/[token]/actions.ts",
    test: "src/app/events/[token]/actions.test.ts",
    refusal:
      /refuses an anonymous injected token[\s\S]*resolvePersonTokenIn\)\.toHaveBeenCalledWith/,
  },
  // LAN-343. Three more routes reach a credential from a form, so three more
  // entries: the nudge's page and its write, and Questionnaire B's write, which
  // was `interest-actions.ts` and slipped this inventory on its filename alone
  // until it became its own route's `actions.ts`.
  {
    source: "src/app/questions/[token]/actions.ts",
    test: "src/app/questions/[token]/actions.test.ts",
    refusal: /refuses an anonymous injected token[\s\S]*resolveRsvpTokenIn\)\.toHaveBeenCalledWith/,
  },
  {
    source: "src/app/questions/[token]/page.tsx",
    test: "src/app/questions/[token]/screens.test.tsx",
    refusal:
      /TERMINAL: TokenState\[\] = \[[\s\S]*"unknown"[\s\S]*"expired"[\s\S]*"revoked"[\s\S]*"superseded"[\s\S]*"event_started"[\s\S]*"cancelled"/,
  },
  {
    source: "src/app/background/[token]/actions.ts",
    test: "src/app/background/[token]/actions.test.ts",
    refusal:
      /refuses an anonymous injected token[\s\S]*resolveRecruitmentInterestTokenIn\)\.toHaveBeenCalledWith/,
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
