// @vitest-environment node
/**
 * The capability map is the only place a role code decides anything, and
 * LAN-73 added no database privilege — test-matrix rows 8 and 17.
 *
 * Both are properties of the repository rather than of a function, so both are
 * asserted by reading the source. That is unusual and deliberate: "no screen
 * carries its own inline role list" is not observable from any single call, and
 * the failure it guards against — a second, divergent copy of the policy — is
 * invisible until the two disagree in production.
 *
 * The scan is narrow on purpose. It looks for a **role code in a string
 * literal** anywhere under `src/` outside the one module allowed to have them,
 * which is exactly the shape an inline policy takes, and it ignores tests,
 * which necessarily name codes in order to check them.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");

/** Every role code the catalogue defines — `scripts/seed-local.mjs` ROLE_SPEC. */
const ROLE_CODES = [
  "president",
  "vice_president",
  "secretary",
  "treasurer",
  "social_secretary",
  "gameday_secretary",
  "kit_manager",
  "media_secretary",
  "it_officer",
  "general_manager",
  "head_coach",
  "offence_coach",
  "defence_coach",
];

/** The one module permitted to name a role code, and the tests that check it. */
const ALLOWED = [join("src", "lib", "auth", "capabilities.ts")];

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  return entries.flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(full)) return [];
    if (/\.test\.tsx?$/.test(full)) return [];
    return [full];
  });
}

const files = sourceFiles(join(root, "src")).map((file) => relative(root, file));

describe("row 8 — one module decides what a role may do", () => {
  it("found the application source to scan", () => {
    // A scan that silently found nothing would pass every assertion below.
    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain(ALLOWED[0].split("/").join(sep));
  });

  it("names a role code nowhere but the capability map", () => {
    const offenders: string[] = [];

    for (const file of files) {
      if (ALLOWED.some((allowed) => file === allowed.split("/").join(sep))) continue;

      const source = readFileSync(join(root, file), "utf8");
      for (const code of ROLE_CODES) {
        // Quoted, i.e. used as a value — not a word inside a sentence in a
        // comment, which is documentation rather than a policy.
        if (new RegExp(`["'\`]${code}["'\`]`).test(source)) {
          offenders.push(`${file} → ${code}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the capability map free of anything but data and its own helpers", () => {
    const source = readFileSync(join(root, ALLOWED[0]), "utf8");

    // No session, no database, no request. The map answers "who may", from a
    // list, and cannot be made to depend on who is asking.
    expect(source).not.toMatch(/from "@\/lib\/supabase/);
    expect(source).not.toMatch(/from "@\/lib\/db/);
    expect(source).not.toMatch(/resolveOperator|getUser|cookies\(\)/);
  });
});

describe("row 17 — no database privilege was added anywhere in this work", () => {
  const surface = files.filter(
    (file) =>
      file.startsWith(join("src", "app", "operate")) || file.startsWith(join("src", "lib", "auth")),
  );

  it("found the LAN-73 surface", () => {
    expect(surface.length).toBeGreaterThan(5);
  });

  it("contains no grant, policy, or row-level-security statement", () => {
    for (const file of surface) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, `${file} contains SQL that changes privileges`).not.toMatch(
        /\bgrant\s+(all|select|insert|update|delete|usage)\b/i,
      );
      expect(source, `${file} creates a policy`).not.toMatch(/create\s+policy/i);
      expect(source, `${file} alters row level security`).not.toMatch(/row\s+level\s+security/i);
    }
  });

  it("runs no SQL of its own at all — the service layer owns data access", () => {
    for (const file of surface) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, `${file} issues SQL directly`).not.toMatch(
        /\bselect\s+[\w*",\s]+\s+from\s+(public|auth)\./i,
      );
    }
  });

  it("declares no fixed width a 375px phone could not fit", () => {
    // Row 16 is a rendered property and is checked by eye against the phone
    // wireframes; this is the part of it a machine can hold. A `width: 900`
    // dropped into an `sx` is the way a shell starts scrolling sideways on a
    // phone, and it is invisible in review until somebody opens it on one.
    // `maxWidth` and `minWidth` are deliberately not matched: a `maxWidth` is a
    // ceiling, not a demand for space.
    for (const file of surface) {
      const source = readFileSync(join(root, file), "utf8");
      for (const [, value] of source.matchAll(/(?<![a-zA-Z])width:\s*(\d+)/g)) {
        expect(Number(value), `${file} demands ${value}px of width`).toBeLessThanOrEqual(375);
      }
    }
  });
});
