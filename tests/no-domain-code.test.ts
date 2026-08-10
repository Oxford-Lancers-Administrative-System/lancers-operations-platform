/**
 * Guards the ticket's hard boundary: this repository contains zero club domain
 * schema. It is a test rather than a review convention so that the boundary
 * survives contact with an agent that has not read the ticket.
 *
 * Delete this test in the ticket that legitimately introduces the domain model.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

const DOMAIN_TERMS = [
  "player",
  "roster",
  "event",
  "rsvp",
  "attendance",
  "injury",
  "fixture",
  "squad",
  "membership",
  "communication",
];

function stripComments(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

describe("zero domain schema boundary", () => {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql"));

  it("has migrations to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("creates no tables at all", () => {
    for (const file of files) {
      const sql = stripComments(readFileSync(join(MIGRATIONS, file), "utf8"));
      expect(sql, `${file} creates a table`).not.toMatch(/\bcreate\s+(?:\w+\s+)*table\b/i);
    }
  });

  it("names no domain entity in executable SQL", () => {
    for (const file of files) {
      const sql = stripComments(readFileSync(join(MIGRATIONS, file), "utf8")).toLowerCase();
      for (const term of DOMAIN_TERMS) {
        expect(sql, `${file} references the domain term "${term}"`).not.toContain(term);
      }
    }
  });
});
