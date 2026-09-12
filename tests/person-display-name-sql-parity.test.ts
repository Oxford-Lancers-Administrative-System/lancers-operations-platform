/**
 * One naming rule, two runtimes — LAN-306.
 *
 * The application composes a person's name in SQL through
 * `personDisplayNameSql`; the owner-run `.mjs` scripts cannot import
 * TypeScript, so they carry the same expression in
 * `scripts/lib/person-display-name-sql.mjs`. Nothing made the two agree, and
 * they did not: LAN-306 changed the rule to the formal given and family name
 * and two script copies kept substituting the Known-as alias, so the filed
 * showcase report said "Vee Frayne" where every page said "Verity Frayne".
 *
 * `tests/showcase-loader.test.ts` catches that one report against real data,
 * at the cost of a minute and a loaded database. This is the cheap half: the
 * expressions are compared as text, and the two scripts that had their own
 * copies are held to the shared one.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { personDisplayNameSql } from "@/lib/services/sql-text";
import { personDisplayNameSql as scriptDisplayNameSql } from "../scripts/lib/person-display-name-sql.mjs";

/** Indentation differs between the two files and means nothing to Postgres. */
function flatten(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

const root = resolve(import.meta.dirname, "..");

function read(relative: string): string {
  return readFileSync(join(root, relative), "utf8");
}

const OWNS_A_NAME_EXPRESSION = [
  "scripts/production/showcase/report.mjs",
  "scripts/production/bootstrap/database.mjs",
] as const;

describe("the scripts name a person the way the application does", () => {
  it("says the same thing in both runtimes", () => {
    expect(flatten(scriptDisplayNameSql("p"))).toBe(flatten(personDisplayNameSql("p")));
  });

  it("holds for whatever alias the caller uses", () => {
    expect(flatten(scriptDisplayNameSql("actor"))).toBe(flatten(personDisplayNameSql("actor")));
  });

  it("never substitutes the Known-as alias for the given name", () => {
    // The shape of the defect, rather than the shape of the fix: an alias
    // lookup inside the name expression is the thing LAN-306 removed.
    expect(scriptDisplayNameSql("p")).not.toContain("person_aliases");
    expect(scriptDisplayNameSql("p")).not.toContain("is_display_name");
  });

  for (const path of OWNS_A_NAME_EXPRESSION) {
    it(`is where ${path} gets its name expression`, () => {
      // Each of these two kept a private copy that drifted. A copy cannot
      // drift from itself, so the guard is that they still read the shared one.
      expect(read(path)).toContain("person-display-name-sql.mjs");
    });
  }

  /**
   * The named list above was the closing round's guard, and it named the two
   * scripts that were known to have copies. Two more still had them —
   * `link-test-operator.mjs` and `link-review-coach.mjs`, both substituting the
   * Known-as alias for the given name months after the rule changed — and a
   * list cannot catch the copy nobody has noticed yet. So the guard is the
   * shape rather than the roster: every `.mjs` under `scripts/` is read, and
   * one that composes a person's name in SQL must get the expression from the
   * shared module.
   *
   * The two shapes below are the two that have actually appeared. Writing an
   * alias is not one of them — `is_display_name` in an `insert` or a seed row
   * is the club recording a Known as, which is exactly what the rule keeps as
   * its own value.
   */
  describe("no script keeps a private copy of the expression", () => {
    /** Every `.mjs` under `scripts/`, at any depth, except the shared module. */
    function scriptFiles(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return scriptFiles(path);
        return entry.isFile() && entry.name.endsWith(".mjs") ? [path] : [];
      });
    }

    /** The shared expression's own shape: a `case` that reads both name parts. */
    const INLINE_CASE =
      /\bcase\b[\s\S]{0,400}?\bgiven_name\b[\s\S]{0,400}?\bfamily_name\b[\s\S]{0,400}?\bend\b/;

    /** The other shape the defect took: selecting the display alias to stand in for the name. */
    const SELECTS_THE_ALIAS = /\bas\s+display_alias\b/;

    const shared = resolve(root, "scripts/lib/person-display-name-sql.mjs");
    const scripts = scriptFiles(resolve(root, "scripts")).filter((path) => path !== shared);

    it("reads every script in the tree", () => {
      // A walker that silently found nothing would pass this whole block.
      expect(scripts.length).toBeGreaterThan(10);
    });

    it.each(scripts.map((path) => relative(root, path)))("%s", (path) => {
      const source = read(path);
      const composesAName = INLINE_CASE.test(source) || SELECTS_THE_ALIAS.test(source);
      if (!composesAName) return;
      expect(source, `${path} composes a person's name in SQL of its own`).toContain(
        "person-display-name-sql.mjs",
      );
    });
  });
});
