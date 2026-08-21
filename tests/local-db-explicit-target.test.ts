/**
 * The destructive local scripts name their database, or they do not run.
 *
 * ## The defect this closes
 *
 * `resolveLocalDatabaseUrl()` used to fall back to
 * `postgresql://postgres:postgres@127.0.0.1:54322/postgres` when
 * `SUPABASE_DB_URL` was unset. Port 54322 is not a placeholder — it is the
 * **`primary` slot** of the local Supabase coordinator, and the coordinator
 * exists precisely so two pieces of work do not share one stack.
 *
 * Everything that reads this guard is destructive. `scripts/seed-local.mjs`
 * truncates and reloads the entire synthetic dataset; `link-test-operator.mjs`
 * and `link-review-coach.mjs` rewrite the fixed review logins. Run by hand with
 * nothing exported — which is the ordinary way anybody runs a script — they did
 * that to whichever stack held `primary`, printed a success summary, and never
 * named the database they had rewritten. A `review-ready` stack was re-seeded
 * out from under its owner that way. The URL was not wrong; it was **unstated**,
 * and an unstated destructive target is the whole defect.
 *
 * ## What this file pins, and what it deliberately does not
 *
 * It pins that an unnamed target is refused, that the refusal comes **before**
 * the loopback and hosted checks rather than instead of them, and that the
 * scripts do not quietly reintroduce a default of their own at the call site —
 * which is the next layer out, and the layer a fix confined to the guard would
 * leave open.
 *
 * It does not re-prove the loopback allow-list, the query-parameter refusal or
 * the hosted-connection refusal beyond confirming they still bite. Those belong
 * to `tests/local-only-guard-source.test.ts` and
 * `tests/service-layer-guard-parity.test.ts`, and this change is strictly a
 * narrowing: no URL those files refuse became reachable, so their assertions are
 * unchanged and still authoritative. ADR 0001 and ADR 0014 are untouched.
 *
 * `src/lib/db/url.ts` keeps its own default deliberately and is out of scope
 * here: it serves the running application, which is configured by `.env.local`
 * rather than by a person typing a command, and it opens no destructive path.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveLocalDatabaseUrl } from "../scripts/lib/local-db.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), "utf8");

/** A legitimate explicit target: the `overflow` slot, so it is not the old default. */
const EXPLICIT_LOCAL = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

/** The address the removed default named. */
const THE_OLD_DEFAULT = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * Every script that opens the local database through this guard.
 *
 * All three are destructive, and all three are invoked by
 * `scripts/local-supabase-command.mjs`, which reads the caller's lease and
 * exports `SUPABASE_DB_URL` for the slot that lease names. That is why removing
 * the default breaks no guarded command: the guarded path always said which
 * database it meant.
 */
const DESTRUCTIVE_SCRIPTS = [
  "scripts/seed-local.mjs",
  "scripts/link-test-operator.mjs",
  "scripts/link-review-coach.mjs",
];

/**
 * Runs `body` with `SUPABASE_DB_URL` genuinely absent.
 *
 * The argument defaults to `process.env.SUPABASE_DB_URL`, so passing
 * `undefined` reads the environment rather than bypassing it — which is the
 * behaviour under test, not a way around it. The unconfigured case only exists
 * when the variable is really unset, and the suite itself runs with it set.
 */
function withNoEnvironmentTarget<T>(body: () => T): T {
  const saved = process.env.SUPABASE_DB_URL;
  delete process.env.SUPABASE_DB_URL;
  try {
    return body();
  } finally {
    if (saved === undefined) delete process.env.SUPABASE_DB_URL;
    else process.env.SUPABASE_DB_URL = saved;
  }
}

describe("an unnamed database is refused", () => {
  it("refuses an unset environment rather than choosing a slot", () => {
    // The exact shape of the incident: a script run by hand, nothing exported,
    // no argument. This used to return the `primary` slot's URL.
    withNoEnvironmentTarget(() => {
      expect(() => resolveLocalDatabaseUrl()).toThrow(/SUPABASE_DB_URL is not set/i);
      expect(() => resolveLocalDatabaseUrl(undefined)).toThrow(/SUPABASE_DB_URL is not set/i);
    });
  });

  it.each([
    ["an empty string", ""],
    ["whitespace", "   "],
  ])("refuses %s rather than choosing a slot", (_label, value) => {
    // A variable that is exported but empty is the other half of "unset", and
    // `raw?.trim() || DEFAULT_URL` treated it as the default too.
    expect(() => resolveLocalDatabaseUrl(value)).toThrow(/SUPABASE_DB_URL is not set/i);
  });

  /**
   * The message has to be actionable, because the person reading it is at a
   * terminal deciding what to type next. A bare "SUPABASE_DB_URL is not set"
   * sends them to export the first local URL they can remember — which is the
   * default that was just removed, and the defect all over again.
   */
  it("says what to run instead, not merely that something is missing", () => {
    let message = "";
    try {
      resolveLocalDatabaseUrl("");
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/npm run db:(seed|reset|start)/);
    expect(message).toMatch(/db:status/);
    // The reason, not just the rule: `primary` is somebody's working stack.
    expect(message).toMatch(/primary/);
  });

  it("does not name the address it used to default to", () => {
    let message = "";
    try {
      resolveLocalDatabaseUrl("");
    } catch (error) {
      message = (error as Error).message;
    }

    // Quoting the old default in the refusal would hand the reader the exact
    // string that caused the incident — and it carries a password besides.
    expect(message).not.toContain(THE_OLD_DEFAULT);
    expect(message).not.toContain("54322");
  });
});

describe("the refusal narrows the guard and never widens it", () => {
  it("still accepts an explicit loopback target", () => {
    expect(resolveLocalDatabaseUrl(EXPLICIT_LOCAL)).toBe(EXPLICIT_LOCAL);
    // Including the address that used to be the default. It was never the
    // wrong database — only the unstated one.
    expect(resolveLocalDatabaseUrl(THE_OLD_DEFAULT)).toBe(THE_OLD_DEFAULT);
  });

  it.each([
    ["a hosted project", "postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres"],
    ["the pooler", "postgresql://u:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres"],
    ["an off-machine host", "postgresql://postgres:pw@10.0.0.7:5432/postgres"],
    ["a redirecting query parameter", `${EXPLICIT_LOCAL}?host=203.0.113.9`],
  ])("still refuses %s", (_label, value) => {
    expect(() => resolveLocalDatabaseUrl(value)).toThrow();
  });

  /**
   * The ordering that makes the sentence above true. If the empty check were
   * added *after* the loopback check it would be unreachable, and if it replaced
   * one of them the guard would have been widened rather than narrowed.
   */
  it("refuses an unnamed target with its own message, not a parse error", () => {
    expect(() => resolveLocalDatabaseUrl("")).toThrow(/SUPABASE_DB_URL is not set/i);
    expect(() => resolveLocalDatabaseUrl("")).not.toThrow(/not a valid URL/i);
  });

  it("keeps no loopback default anywhere in the guard's source", () => {
    const source = read("scripts/lib/local-db.mjs");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    // Comments explain the removed default at length and must stay readable, so
    // this looks at code only. A reintroduced `?? DEFAULT_URL`, or the literal
    // spliced back in, lands here.
    expect(code).not.toMatch(/postgresql:\/\//);
    expect(code).not.toMatch(/\bDEFAULT_URL\b/);
  });
});

describe("the scripts do not put the default back at the call site", () => {
  it.each(DESTRUCTIVE_SCRIPTS)("%s names no database of its own", (relative) => {
    const code = read(relative)
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    // The realistic regression: a maintainer hits the new refusal while running
    // the script by hand and "fixes" it with a fallback here instead of
    // exporting the variable, restoring the incident one layer out.
    expect(code).not.toMatch(/postgresql:\/\//);
    expect(code).not.toMatch(/resolveLocalDatabaseUrl\(\s*['"`]/);
    expect(code).not.toMatch(/SUPABASE_DB_URL\s*(\?\?|\|\|)/);
  });

  /**
   * And the guarded path still supplies one, which is why nothing legitimate
   * broke. `local-supabase-command.mjs` builds the environment for these three
   * scripts from the lease it just validated.
   */
  it("the guarded command exports the slot's own URL for them", () => {
    const command = read("scripts/local-supabase-command.mjs");

    expect(command).toMatch(/SUPABASE_DB_URL:\s*`postgresql:\/\/[^`]*\$\{lease\.ports\.db\}/);
    for (const relative of DESTRUCTIVE_SCRIPTS) {
      expect(
        command,
        `${relative} must still be run through the lease-aware environment`,
      ).toContain(relative);
    }
  });
});
