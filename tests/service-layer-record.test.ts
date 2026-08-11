// @vitest-environment node
/**
 * The parts of matrix rows 15 and 16 a machine can check.
 *
 * Both rows are ultimately review items — whether an ADR tells the truth is not
 * something a test can settle, and this file does not pretend otherwise. What
 * it does settle is the mechanical half, which is also the half that fails
 * silently: a real credential committed into `.env.example` in a public
 * repository, or an ADR that exists but was never indexed and so is never read.
 *
 * The judgements deliberately left to the reviewer are named at the bottom of
 * this file rather than glossed over.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const ADR = "docs/adr/0014-transactional-data-access.md";

describe("row 15 — .env.example carries placeholders, never values", () => {
  const envExample = read(".env.example");

  it("declares the service layer's connection variable", () => {
    expect(envExample).toMatch(/^DATABASE_URL=/m);
  });

  it.each([
    "DATABASE_URL",
    "DATABASE_POOL_MAX",
    "DATABASE_IDLE_TIMEOUT_MS",
    "DATABASE_CONNECT_TIMEOUT_MS",
  ])("leaves %s empty", (name) => {
    const line = envExample.split("\n").find((candidate) => candidate.startsWith(`${name}=`));
    expect(line).toBeDefined();
    expect(line!.slice(name.length + 1).trim()).toBe("");
  });

  it("holds no credential of any shape, on any line", () => {
    // This repository is public. Treat every committed byte as published.
    const assignments = envExample
      .split("\n")
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => line.slice(line.indexOf("=") + 1).trim())
      .filter((value) => value !== "");

    for (const value of assignments) {
      // A password inside a connection string.
      expect(value).not.toMatch(/^postgres(ql)?:\/\/[^@/]*:[^@/]+@/);
      // Supabase key shapes, current and legacy.
      expect(value).not.toMatch(/^sb_(secret|publishable)_/);
      expect(value).not.toMatch(/^eyJ[A-Za-z0-9_-]{10,}\./);
    }
  });

  it("still says plainly that this file never holds real values", () => {
    expect(envExample).toMatch(/NEVER put real values in this file/i);
  });
});

describe("row 16 — the record exists and is reachable", () => {
  it("has ADR 0014", () => {
    expect(() => read(ADR)).not.toThrow();
  });

  it("lists ADR 0014 in the index, so it is findable rather than merely present", () => {
    const index = read("docs/adr/README.md");
    expect(index).toContain("0014-transactional-data-access.md");
  });

  it("routes every hosted question to LAN-83 rather than answering it", () => {
    const adr = read(ADR);
    expect(adr).toContain("LAN-83");
    // The four the issue names explicitly.
    expect(adr).toMatch(/runtime PostgreSQL role/i);
    expect(adr).toMatch(/grants/i);
    expect(adr).toMatch(/bypasses RLS/i);
    expect(adr).toMatch(/connection mode|pooling/i);
  });

  it("does not claim the two credentials are the same principal", () => {
    const adr = read(ADR);
    expect(adr).toMatch(/separate credential|second privileged credential|not an equivalent one/i);
    expect(adr).toMatch(/not preserved unchanged|extended by it/i);
  });

  it("commits no hosted connection string anywhere in the documents it touches", () => {
    for (const file of [ADR, "docs/architecture.md", "docs/deployment.md", ".env.example"]) {
      const contents = read(file);
      expect(contents).not.toMatch(/postgres(ql)?:\/\/[^\s`"']*supabase\.(co|com|in)/i);
      expect(contents).not.toMatch(/postgres(ql)?:\/\/[^\s`"']*pooler[^\s`"']*/i);
    }
  });

  it("shows the service layer and the second connection path in architecture.md", () => {
    const architecture = read("docs/architecture.md");
    const requestPath = architecture.slice(
      architecture.indexOf("## Request path"),
      architecture.indexOf("## Security model"),
    );
    const securityModel = architecture.slice(
      architecture.indexOf("## Security model"),
      architecture.indexOf("## Authentication scope"),
    );

    expect(requestPath).toContain("src/lib/services");
    expect(requestPath).toContain("withTransaction");
    expect(securityModel).toContain("DATABASE_URL");
    expect(securityModel).toMatch(/two privileged credentials/i);
  });
});

describe("row 14 — the service layer grants nothing and exposes nothing", () => {
  // The posture halves of row 14 are proven where they live: `npm run check:rls`
  // over the migrations, tests/rls-posture.test.ts through PostgREST as a
  // browser would, and tests/schema-security.test.ts against the catalogue —
  // all three passing unchanged. What those cannot see is the service layer
  // itself quietly issuing DDL at runtime, which is what this asserts.
  const sources = ["src/lib/db", "src/lib/services"]
    .flatMap((directory) =>
      readdirSync(path.join(root, directory)).map((name) => path.join(directory, name)),
    )
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => ({ file, contents: read(file) }));

  it("reads more than nothing, so an empty glob cannot pass this vacuously", () => {
    expect(sources.length).toBeGreaterThanOrEqual(6);
  });

  it.each([
    ["a grant", /\bgrant\s+(all|select|insert|update|delete|usage|execute)\b/i],
    ["a revoke", /\brevoke\s+/i],
    ["an RLS policy", /\bcreate\s+policy\b/i],
    ["an RLS toggle", /\brow\s+level\s+security\b/i],
    ["a role change", /\b(create|alter)\s+role\b/i],
    ["schema DDL", /\b(create|drop)\s+(table|view|schema)\b/i],
  ])("issues no %s", (_label, pattern) => {
    for (const source of sources) {
      expect(source.contents, `${source.file} matched ${pattern}`).not.toMatch(pattern);
    }
  });
});

/**
 * What is deliberately NOT asserted here, and belongs to the reviewer:
 *
 *   * Whether ADR 0014's account of the two credentials is *correct*, not
 *     merely present. A grep for "separate credential" would pass on a
 *     document that then contradicted itself two paragraphs later.
 *   * Whether the ADR's statement of the open hosted questions is complete.
 *     A missing question is invisible to a test that only checks for the
 *     questions it already knows about.
 *   * Whether `docs/architecture.md` describes the request path *accurately*.
 *   * Whether the local test suite is being implicitly cited as evidence about
 *     the hosted posture anywhere. That is a claim about meaning, and the
 *     issue names it as the specific trap to avoid.
 */
