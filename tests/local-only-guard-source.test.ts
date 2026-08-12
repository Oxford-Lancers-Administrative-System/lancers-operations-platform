// @vitest-environment node
/**
 * The local-only database guards must be **unconditional**, and that is a
 * property of their source, not of their behaviour.
 *
 * ## Why a behavioural test cannot see this
 *
 * `tests/service-layer-guard-parity.test.ts` runs both guards over a table of
 * connection strings and proves they refuse the hosted ones. Add
 * `!process.env.ALLOW_REMOTE_DB &&` in front of a refusal and that suite stays
 * green — the variable is unset when the suite runs, so the conjunct is true,
 * so every case behaves exactly as before. Parity stays green too, because a
 * bypass added to *both* guards keeps them agreeing. The hole opens only on the
 * machine that sets the variable, which is the machine that should never have
 * been able to open it. LAN-97 demonstrated this: the whole suite passed with
 * both refusals made conditional.
 *
 * So this file reads the guards **as text** and pins the shape of the two
 * predicates that decide whether to throw. It never imports them and never
 * modifies them.
 *
 * ## Both guards, not one
 *
 * There are two implementations of this rule, on purpose:
 *
 * - `scripts/lib/local-db.mjs` → `resolveLocalDatabaseUrl()`, the seeding and
 *   schema-test path.
 * - `src/lib/db/url.ts` → `assertLocalDatabaseUrl()`, the service layer's
 *   direct PostgreSQL connection — a **second** privileged credential
 *   (ADR 0014), which that file's own header calls the one that matters more.
 *
 * Covering only the first would leave the identical hole in the second.
 *
 * The precedent for asserting on checked-in text as a test is
 * `tests/agent-harness.test.ts`; the reasoning is the same. A rule that only
 * holds by inspection is a rule that drifts.
 *
 * ## What this file deliberately does not attempt
 *
 * That the guard prevents *reaching* a hosted database. ADR 0001 forbids
 * pointing anywhere non-local in every environment, so there is nothing to
 * point at. And a loopback port forwarded to a hosted database — an SSH tunnel,
 * `socat` — defeats both guards completely; that residual risk is recorded in
 * ADR 0014 rather than papered over here.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), "utf8");

const SCRIPTS_GUARD = "scripts/lib/local-db.mjs";
const SERVICE_GUARD = "src/lib/db/url.ts";

// ---------------------------------------------------------------------------
// Reading a predicate out of a guard
// ---------------------------------------------------------------------------

/**
 * Collapses whitespace and strips comments, so the assertions below survive
 * ordinary Prettier reformatting, a re-wrap, and a comment edit — and fail on a
 * change to what the predicate actually tests.
 */
function normalise(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The body of a named function declaration, from its opening brace to the
 * matching close.
 *
 * Scoped to the **body** on purpose. `resolveLocalDatabaseUrl(raw =
 * process.env.SUPABASE_DB_URL)` reads the environment in its parameter list,
 * and that read is the guard's default *input*, not part of any predicate — a
 * check that simply banned `process.env` from the function would be red today
 * and would be deleted tomorrow. `src/lib/db/url.ts` has the same shape one
 * level out: `resolveDatabaseUrl` legitimately reads `DATABASE_URL` and
 * `SUPABASE_DB_URL`, and is a different function from the one pinned here.
 *
 * Throws if the function cannot be found. A guard that has been renamed, moved
 * or restructured out of recognition must fail this suite loudly; silently
 * checking nothing is the failure mode this file exists to prevent.
 */
function functionBody(source: string, name: string): string {
  const signature = new RegExp(String.raw`function\s+${name}\s*\(`).exec(source);
  if (!signature) {
    throw new Error(`Cannot find function ${name}(). If it moved, this check must move with it.`);
  }

  const open = source.indexOf("{", signature.index + signature[0].length);
  if (open === -1) throw new Error(`Cannot find the body of ${name}().`);

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`The body of ${name}() is unbalanced; this check cannot read it.`);
}

/**
 * The condition of the first `if` in `body` whose condition mentions `marker` —
 * that is, the predicate that decides whether that refusal throws.
 *
 * Throws when there is no such `if`. A refusal that has been rewritten as a
 * ternary, a guard clause on another statement, or removed altogether reports a
 * failure rather than an empty pass.
 */
function refusalCondition(body: string, marker: RegExp): string {
  for (const match of body.matchAll(/\bif\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < body.length; i += 1) {
      if (body[i] === "(") depth += 1;
      else if (body[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          const condition = normalise(body.slice(open + 1, i));
          if (marker.test(condition)) return condition;
          break;
        }
      }
    }
  }
  throw new Error(`No refusal whose condition matches ${marker} — the guard has changed shape.`);
}

/** Splits a condition on its top-level `&&`, ignoring those inside parentheses. */
function topLevelConjuncts(condition: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (let i = 0; i < condition.length; i += 1) {
    const character = condition[i];
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0 && character === "&" && condition[i + 1] === "&") {
      parts.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    current += character;
  }
  if (current.trim() !== "") parts.push(current.trim());
  return parts;
}

// ---------------------------------------------------------------------------
// The checks themselves, as a pure function over a guard's source
// ---------------------------------------------------------------------------

/** Every way an environment lookup could get into a predicate. */
const ENVIRONMENT_LOOKUP =
  /\bprocess\s*\.\s*env\b|\bimport\s*\.\s*meta\s*\.\s*env\b|\bDeno\s*\.\s*env\b|\bgetenv\b|\benv\s*[[.]/i;

/** One refusal, named so a failure says which predicate moved. */
interface Refusal {
  /** How the refusal is recognised inside the function body. */
  readonly marker: RegExp;
  /** What its condition must read, once whitespace and comments are gone. */
  readonly expected: string;
  readonly name: string;
}

const REFUSALS: readonly Refusal[] = [
  {
    name: "the non-loopback host refusal",
    marker: /LOOPBACK_HOSTS/,
    expected: "!LOOPBACK_HOSTS.has(parsed.hostname)",
  },
  {
    name: "the hosted-connection-string refusal",
    marker: /supabase\\\.|pooler/,
    expected: "/supabase\\.(co|com|in)/i.test(value) || /pooler/i.test(parsed.hostname)",
  },
];

/** The four loopback hosts, and no others. ADR 0001. */
const LOOPBACK_HOSTS = ["127.0.0.1", "::1", "[::1]", "localhost"];

/**
 * The allow-list literal, read out of a normalised guard source.
 *
 * Non-greedy up to the closing `])` rather than "everything that is not a
 * bracket", because `"[::1]"` is itself bracketed — a detail that made the
 * first draft of this check silently find nothing.
 */
const ALLOW_LIST_LITERAL = /LOOPBACK_HOSTS\s*=\s*new Set\(\[(.*?)\]\s*\)\s*;/;

/**
 * Everything wrong with one guard's source, as human-readable findings.
 *
 * Returning findings rather than asserting inline is what lets the positive
 * controls below feed this same function a **deliberately bypassed** guard and
 * require it to object. A check that is never shown a bad input is a check
 * nobody has tested.
 *
 * Findings quote the predicate only — never the file, and never a connection
 * string. `DEFAULT_URL` sits a few lines above both predicates and carries a
 * password; a failure message must not print it into CI output.
 */
function inspectGuard(label: string, source: string, functionName: string): string[] {
  const findings: string[] = [];
  const body = functionBody(source, functionName);

  for (const refusal of REFUSALS) {
    const condition = refusalCondition(body, refusal.marker);

    if (ENVIRONMENT_LOOKUP.test(condition)) {
      findings.push(
        `${label}: ${refusal.name} consults the environment, so it can be switched off: ${condition}`,
      );
    }

    const conjuncts = topLevelConjuncts(condition);
    if (conjuncts.length !== 1) {
      findings.push(
        `${label}: ${refusal.name} has ${conjuncts.length} top-level conditions, expected 1: ${condition}`,
      );
    }

    if (condition !== refusal.expected) {
      findings.push(
        `${label}: ${refusal.name} reads "${condition}", expected "${refusal.expected}"`,
      );
    }
  }

  const allowList = ALLOW_LIST_LITERAL.exec(normalise(source));
  if (!allowList) {
    findings.push(`${label}: no LOOPBACK_HOSTS allow-list could be read at all`);
  } else {
    const hosts = allowList[1]
      .split(",")
      .map((entry) => entry.trim().replace(/^["']|["']$/g, ""))
      .filter((entry) => entry !== "");
    const unexpected = hosts.filter((host) => !LOOPBACK_HOSTS.includes(host));
    const missing = LOOPBACK_HOSTS.filter((host) => !hosts.includes(host));
    if (unexpected.length > 0) {
      findings.push(`${label}: the loopback allow-list has been widened with ${unexpected}`);
    }
    if (missing.length > 0) {
      findings.push(`${label}: the loopback allow-list has lost ${missing}`);
    }
  }

  return findings;
}

/** The two guards this file pins, and the function in each that does the refusing. */
const GUARDS = [
  { label: "scripts/lib/local-db.mjs", file: SCRIPTS_GUARD, fn: "resolveLocalDatabaseUrl" },
  { label: "src/lib/db/url.ts", file: SERVICE_GUARD, fn: "assertLocalDatabaseUrl" },
] as const;

// ---------------------------------------------------------------------------
// Rows 1, 2 and 3 — both refusals in both guards are unconditional
// ---------------------------------------------------------------------------

describe("the local-only guards are unconditional", () => {
  it.each(GUARDS)("$label has nothing to object to today", ({ file, label, fn }) => {
    expect(inspectGuard(label, read(file), fn)).toEqual([]);
  });

  it.each(GUARDS)(
    "$label's non-loopback refusal consults no environment variable",
    ({ file, fn }) => {
      const condition = refusalCondition(functionBody(read(file), fn), /LOOPBACK_HOSTS/);

      // Row 1 and row 3. The reproduction in LAN-97 is exactly this conjunct.
      expect(condition).not.toMatch(ENVIRONMENT_LOOKUP);
      // And nothing else may be conjoined either: a module-level constant that
      // itself read the environment would pass the check above.
      expect(topLevelConjuncts(condition)).toHaveLength(1);
      expect(condition).toBe("!LOOPBACK_HOSTS.has(parsed.hostname)");
    },
  );

  it.each(GUARDS)(
    "$label's hosted-connection-string refusal consults no environment variable",
    ({ file, fn }) => {
      // Row 2 and row 3, kept separate from the row above because a bypass
      // added to only one of the two refusals is the realistic mistake.
      const condition = refusalCondition(functionBody(read(file), fn), /supabase\\\.|pooler/);

      expect(condition).not.toMatch(ENVIRONMENT_LOOKUP);
      expect(topLevelConjuncts(condition)).toHaveLength(1);
      expect(condition).toBe(
        "/supabase\\.(co|com|in)/i.test(value) || /pooler/i.test(parsed.hostname)",
      );
    },
  );

  it("does not object to the legitimate environment read in the signature", () => {
    // The sharp edge. `resolveLocalDatabaseUrl(raw = process.env.SUPABASE_DB_URL)`
    // reads the environment for its default INPUT, and `resolveDatabaseUrl`
    // reads DATABASE_URL and SUPABASE_DB_URL to decide what to check. Both are
    // correct. A check that banned `process.env` from either file would be red
    // on a correct repository — and a red check on correct code is a check
    // somebody deletes.
    expect(read(SCRIPTS_GUARD)).toMatch(/raw = process\.env\.SUPABASE_DB_URL/);
    expect(read(SERVICE_GUARD)).toMatch(/DATABASE_URL_VARIABLES/);
    expect(inspectGuard("scripts", read(SCRIPTS_GUARD), "resolveLocalDatabaseUrl")).toEqual([]);
    expect(inspectGuard("service", read(SERVICE_GUARD), "assertLocalDatabaseUrl")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Row 4 — the loopback allow-list is exactly the four documented values
// ---------------------------------------------------------------------------

describe("the loopback allow-list", () => {
  it.each(GUARDS)("$label allows exactly the four documented hosts", ({ file }) => {
    const allowList = ALLOW_LIST_LITERAL.exec(normalise(read(file)));
    expect(allowList, "the allow-list must be readable, or nothing below constrains it").not.toBe(
      null,
    );

    const hosts = allowList![1].split(",").map((entry) => entry.trim().replace(/^["']|["']$/g, ""));
    expect([...hosts].sort()).toEqual([...LOOPBACK_HOSTS].sort());
    expect(hosts).toHaveLength(4);
  });

  it("is consulted by exact membership, never by prefix or suffix", () => {
    // `LOOPBACK_HOSTS.has(parsed.hostname)` is an exact lookup. A `startsWith`
    // or a `some(...)` would accept `localhost.evil.example`, which the parity
    // suite's CASES table proves is refused today — this is the source-form
    // half of the same rule.
    for (const { file, fn } of GUARDS) {
      const condition = refusalCondition(functionBody(read(file), fn), /LOOPBACK_HOSTS/);
      expect(condition).toContain(".has(");
      expect(condition).not.toMatch(/startsWith|endsWith|includes|some\s*\(|test\s*\(/);
    }
  });
});

// ---------------------------------------------------------------------------
// Row 5 — the positive controls, so this file cannot rot into a no-op
// ---------------------------------------------------------------------------

describe("the check itself still bites", () => {
  /**
   * The real guard, with a bypass spliced in **in memory**. Nothing on disk is
   * touched: these are strings.
   */
  function withBypass(source: string, before: string): string {
    return source.replace(before, `!process.env.ALLOW_REMOTE_DB && ${before}`);
  }

  it.each(GUARDS)(
    "$label: an env conjunct on the non-loopback refusal is caught",
    ({ file, fn }) => {
      const bypassed = withBypass(read(file), "!LOOPBACK_HOSTS.has(parsed.hostname)");
      expect(bypassed, "the splice must have applied, or this control proves nothing").not.toBe(
        read(file),
      );

      const findings = inspectGuard("under test", bypassed, fn);
      expect(findings.join("\n")).toMatch(/non-loopback host refusal consults the environment/);
      expect(findings.join("\n")).toMatch(/2 top-level conditions/);
    },
  );

  it.each(GUARDS)("$label: an env conjunct on the hosted refusal is caught", ({ file, fn }) => {
    const bypassed = withBypass(read(file), "/supabase\\.(co|com|in)/i.test(value)");
    expect(bypassed).not.toBe(read(file));

    const findings = inspectGuard("under test", bypassed, fn);
    expect(findings.join("\n")).toMatch(
      /hosted-connection-string refusal consults the environment/,
    );
  });

  it.each(GUARDS)("$label: a widened allow-list is caught", ({ file, fn }) => {
    const widened = read(file).replace(`"[::1]"`, `"[::1]", "10.0.0.7"`);
    expect(widened).not.toBe(read(file));

    expect(inspectGuard("under test", widened, fn).join("\n")).toMatch(
      /allow-list has been widened with 10\.0\.0\.7/,
    );
  });

  it.each(GUARDS)("$label: a narrowed allow-list is caught too", ({ file, fn }) => {
    const narrowed = read(file).replace(`"localhost", `, "");
    expect(narrowed).not.toBe(read(file));

    expect(inspectGuard("under test", narrowed, fn).join("\n")).toMatch(
      /allow-list has lost localhost/,
    );
  });

  it.each(GUARDS)(
    "$label: a prefix match instead of exact membership is caught",
    ({ file, fn }) => {
      const loosened = read(file).replace(
        "!LOOPBACK_HOSTS.has(parsed.hostname)",
        "![...LOOPBACK_HOSTS].some((h) => parsed.hostname.startsWith(h))",
      );
      expect(loosened).not.toBe(read(file));

      expect(inspectGuard("under test", loosened, fn).join("\n")).toMatch(/expected/);
    },
  );

  it("fails loudly when the guard function cannot be found at all", () => {
    // Zero matches must never be a pass. If a guard is renamed, moved, or
    // restructured so that extraction finds nothing, this suite has to go red
    // rather than quietly assert about an empty string.
    expect(() =>
      inspectGuard("missing", "export const nothing = 1;", "assertLocalDatabaseUrl"),
    ).toThrow(/Cannot find function assertLocalDatabaseUrl/);

    const withoutRefusal = read(SERVICE_GUARD).replace(
      "if (!LOOPBACK_HOSTS.has(parsed.hostname))",
      "if (false)",
    );
    expect(() => inspectGuard("gutted", withoutRefusal, "assertLocalDatabaseUrl")).toThrow(
      /No refusal whose condition matches/,
    );
  });

  it("names the guard and the predicate, and quotes no connection string", () => {
    // Row 6. A finding a reader cannot act on is a finding that gets ignored,
    // and a finding that echoes DEFAULT_URL prints a password into CI output.
    const findings = inspectGuard(
      "src/lib/db/url.ts",
      withBypass(read(SERVICE_GUARD), "!LOOPBACK_HOSTS.has(parsed.hostname)"),
      "assertLocalDatabaseUrl",
    );

    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding).toContain("src/lib/db/url.ts");
      expect(finding).toMatch(/refusal/);
      expect(finding).not.toMatch(/postgresql:\/\//);
      expect(finding).not.toMatch(/postgres:postgres@/);
    }
  });
});
