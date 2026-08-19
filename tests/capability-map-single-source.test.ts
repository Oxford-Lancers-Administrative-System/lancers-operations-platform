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

/** Every role code the catalogue defines — `supabase/migrations/20260819090100_role_catalogue.sql`. */
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
  "quarterbacks_coach",
  "offensive_line_coach",
  "wide_receivers_coach",
  "defensive_line_coach",
  "linebackers_coach",
  "defensive_backs_coach",
  "special_teams_coach",
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

/**
 * Row 17 in part, and the part is the point.
 *
 * This block was called "no database privilege was added anywhere in this work"
 * and a level-3 reviewer showed the name was a lie: they added a real migration
 * granting `select on public.people to authenticated`, and the suite stayed
 * green, because nothing here reads `supabase/migrations/`.
 *
 * It is renamed rather than widened, deliberately. The obvious widening — assert
 * `supabase/migrations/` is unchanged relative to `main` — is a test that is
 * **false for every legitimate future migration**, in a shared file that the
 * next nine issues inherit. It would have to be deleted by whoever first adds a
 * migration, which makes it a tripwire against doing correct work rather than a
 * guard against incorrect work, and a test people learn to delete is worse than
 * no test.
 *
 * What actually holds row 17 for LAN-73: `npm run check:rls` in CI, which reads
 * every migration and fails on a table without RLS; the `git diff --stat` in the
 * pull request, which shows no file under `supabase/migrations/` at all; and
 * review. What this block holds is narrower and genuinely local — that the
 * application surface this issue wrote reaches the database only through the
 * service layer, and carries no SQL, no privilege change and no policy of its
 * own. That property stays true and stays checkable as the slice grows.
 */
describe("the LAN-73 application surface carries no SQL and no privilege change", () => {
  const surface = files.filter(
    (file) =>
      file.startsWith(join("src", "app", "operate")) || file.startsWith(join("src", "lib", "auth")),
  );

  it("found the LAN-73 surface", () => {
    expect(surface.length).toBeGreaterThan(5);
  });

  it("does not claim to check migrations, and does not check them", () => {
    // Stated as an assertion so the scope cannot quietly drift back to the
    // name it used to have. `supabase/migrations/` is out of this file's reach
    // by design — see the note above for what covers it instead.
    expect(surface.every((file) => file.startsWith(join("src", "")))).toBe(true);
    expect(surface.some((file) => file.includes("supabase"))).toBe(false);
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
