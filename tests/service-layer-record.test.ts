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

describe("the deployed revision matches what the documents claim about it", () => {
  // Three artifacts state the production pool size as fact — ADR 0026,
  // src/lib/db/connection.ts, and .env.example — and for one round none of them
  // was true: nothing set the variable, so the code default of 10 shipped.
  // Across three instances that is 30 client connections, over both the
  // pooler's 15-connection pool and the role's `connection limit 20`, failing
  // only under concurrency and only in production. A document asserting a
  // number no deployment sets is worse than no document.
  const deploy = read(".github/workflows/deploy.yml");

  it("deploys only when a human dispatches the workflow", () => {
    const triggers = /\non:\n([\s\S]*?)\nconcurrency:/.exec(deploy)?.[1] ?? "";
    expect(triggers).toMatch(/^ {2}workflow_dispatch:/m);
    expect(triggers).not.toMatch(/^ {2}push:/m);
  });

  it("sets DATABASE_POOL_MAX on the revision", () => {
    expect(deploy).toMatch(/--set-env-vars=DATABASE_POOL_MAX=5/);
  });

  it("sets the value the documents say it does", () => {
    const claimed = /DATABASE_POOL_MAX=(\d+)/.exec(deploy)?.[1];
    expect(claimed).toBe("5");

    expect(read("docs/adr/0026-hosted-runtime-database-connection.md")).toMatch(
      /Five connections per instance/,
    );
    expect(read("src/lib/db/connection.ts")).toMatch(/`max` is set to 5/);
    expect(read(".env.example")).toMatch(/Hosted uses 5/);
  });

  it("injects the database secret into the revision", () => {
    expect(deploy).toMatch(
      /DATABASE_URL=\$\{\{ vars\.DATABASE_URL_SECRET \|\| 'database-url' \}\}/,
    );
  });

  it("gates on databaseConfigured for a build, and only warns on a rollback", () => {
    // Gating the rollback path would turn every rollback red during the
    // incident the rollback exists to fix: an image built before this field
    // existed cannot report it, and the revision is already serving by then.
    // Line-based, because substring search for the shell keywords finds them
    // inside words — `fi` matches inside "con**fi**gured", which silently
    // truncated the rollback branch to nothing and made the assertion below
    // vacuous on the first attempt at this test.
    const lines = deploy.split("\n");
    const isKeyword = (line: string, keyword: string) => line.trim() === keyword;

    const start = lines.findIndex((line) =>
      line.includes('if [ -z "${{ inputs.image_tag }}" ]; then'),
    );
    expect(start, "the conditional must exist").toBeGreaterThan(-1);

    const elseAt = lines.findIndex((line, index) => index > start && isKeyword(line, "else"));
    const endAt = lines.findIndex((line, index) => index > elseAt && isKeyword(line, "fi"));
    expect(elseAt, "an else branch must exist").toBeGreaterThan(start);
    expect(endAt, "the conditional must be closed").toBeGreaterThan(elseAt);

    // Scoped to each branch separately. Slicing to end-of-file instead let the
    // retry loop's own trailing `exit 1` satisfy the assertion, so inverting the
    // branches — build warns, rollback fails, the precise inversion of the
    // defect this gate exists to fix — passed. Independent review found that by
    // performing the inversion.
    const buildBranch = lines.slice(start, elseAt).join("\n");
    const rollbackBranch = lines.slice(elseAt, endAt).join("\n");

    expect(buildBranch, "the build path must fail closed").toMatch(
      /grep -q '"databaseConfigured":true'[\s\S]*?exit 1/,
    );
    // The assertion above spans the whole branch, so its `exit 1` need not
    // belong to the databaseConfigured check. A future edit that adds a second
    // hard-gated health field while downgrading this one to a warning would
    // satisfy it and silently stop the deploy failing closed on DATABASE_URL.
    // Found by independent review, which built exactly that edit.
    expect(buildBranch, "the build path must not merely warn").not.toMatch(
      /::warning title=Database not configured::/,
    );
    expect(buildBranch, "the build path must prove the current schema").toMatch(
      /grep -q '"schemaCompatible":true'[\s\S]*?exit 1/,
    );
    expect(rollbackBranch, "the rollback path must only warn").toMatch(
      /::warning title=Database not configured::/,
    );
    expect(rollbackBranch, "an old rollback image may lack the new field").toMatch(
      /::warning title=Schema compatibility not reported::/,
    );
    expect(rollbackBranch, "the rollback path must not fail the workflow").not.toMatch(/exit 1/);
  });

  it("says so in the runbook, so the rollback instructions are not contradicted", () => {
    expect(read("docs/deployment.md")).toMatch(/build path only[\s\S]*?degrades to a warning/i);
  });
});

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

  it("still names the four hosted questions, and now points at the ADR that answers them", () => {
    // These were open when ADR 0014 was written and are decided by ADR 0026.
    // The questions stay on the record — each one turned out to matter — but a
    // reader must not be left believing they are still open.
    const adr = read(ADR);
    expect(adr).toMatch(/runtime PostgreSQL role/i);
    expect(adr).toMatch(/grants/i);
    expect(adr).toMatch(/bypasses RLS/i);
    expect(adr).toMatch(/connection mode|pooling/i);

    expect(adr).toContain("0026-hosted-runtime-database-connection.md");
    expect(adr).not.toContain("LAN-83");
  });

  it("no longer claims the local suite proves nothing about the hosted posture", () => {
    // It still says so of every test that connects as `postgres` — which is
    // nearly all of them — but two files now build the approved role
    // deliberately, and the record has to say which is which.
    const adr = read(ADR);
    expect(adr).toMatch(/hosted-role-posture\.test\.ts/);
    expect(adr).toMatch(/negative control/i);
  });

  it("has ADR 0026, listed in the index, deciding the hosted credential", () => {
    const decision = read("docs/adr/0026-hosted-runtime-database-connection.md");

    expect(read("docs/adr/README.md")).toContain("0026-hosted-runtime-database-connection.md");
    expect(decision).toMatch(/app_runtime/);
    expect(decision).toMatch(/service_role/);
    expect(decision).toMatch(/BYPASSRLS/);
    expect(decision).toMatch(/transaction mode/i);
    // The distinction the issue requires the record to draw explicitly.
    expect(decision).toMatch(/accident prevention/i);
    expect(decision).toMatch(/security boundary/i);
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

  /**
   * `a revoke` is matched on what a `REVOKE` statement actually looks like,
   * rather than on the word.
   *
   * It was `/\brevoke\s+/i`, and LAN-78 is where that stopped working: token
   * revocation is a domain concept the club has — "Revoke and reissue link" is
   * an approved control on UX-52 — so `src/lib/services/delivery.ts` contains
   * the word "revoke" followed by a space several times, in prose and in copy,
   * while issuing no SQL at all.
   *
   * The replacement is symmetric with the `grant` pattern above and covers both
   * forms the statement takes: privileges (`revoke all on …`, `revoke select on
   * …`) and role membership (`revoke <role> from <user>`). It is narrower in
   * what it matches and no weaker in what it catches — the injection cases
   * below prove that, and would fail if somebody loosened it further.
   */
  const REVOKE =
    /\brevoke\s+(all|select|insert|update|delete|truncate|references|trigger|create|connect|temporary|temp|usage|execute|maintain|grant\s+option)\b|\brevoke\s+\w+\s+from\b/i;

  /**
   * Symmetric with `REVOKE`. Widening one and not the other left
   * `grant truncate on … to service_role` passing a file whose whole point is
   * that the service layer issues no privilege statements at all.
   */
  const GRANT =
    /\bgrant\s+(all|select|insert|update|delete|truncate|references|trigger|create|connect|temporary|temp|usage|execute|maintain)\b/i;

  it.each([
    ["a grant", GRANT],
    ["a revoke", REVOKE],
    ["an RLS policy", /\bcreate\s+policy\b/i],
    ["an RLS toggle", /\brow\s+level\s+security\b/i],
    ["a role change", /\b(create|alter)\s+role\b/i],
    ["schema DDL", /\b(create|drop)\s+(table|view|schema)\b/i],
  ])("issues no %s", (_label, pattern) => {
    for (const source of sources) {
      expect(source.contents, `${source.file} matched ${pattern}`).not.toMatch(pattern);
    }
  });

  it.each([
    "revoke all on table public.people from anon",
    "REVOKE SELECT ON public.invitations FROM authenticated",
    "revoke update on public.events from service_role",
    "revoke club_admin from service_role",
    // The privileges the first narrowing lost. Independent review pointed out
    // that the four above did not cover them, so the list they justify did not
    // either. Every one is a real statement the service layer must never carry.
    "revoke truncate on public.audit_events from service_role",
    "revoke references on public.people from authenticated",
    "revoke trigger on public.events from service_role",
    "revoke connect on database postgres from anon",
    "revoke temporary on database postgres from authenticated",
    "revoke grant option for select on public.people from service_role",
  ])("still catches %s", (statement) => {
    // Narrowing a pattern is only safe if it is shown to still bite. Each of
    // these is a real revoke the service layer must never contain.
    expect(REVOKE.test(statement)).toBe(true);
  });

  it.each([
    "Revoke and reissue link",
    "revokeTokensIn(tx, invitationId, reason)",
    "the operator may revoke a link that went to the wrong person",
  ])("does not mistake %s for one", (prose) => {
    expect(REVOKE.test(prose)).toBe(false);
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
