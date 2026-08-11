// @vitest-environment node
/**
 * The pilot-data contract (LAN-93 / ADR 0016) is documentation, a pull-request
 * template and two SQL files. Nothing else in the repository fails if the
 * real-roster prohibition is quietly softened, if the Production handoff block
 * loses the line about migrations, if a workflow starts running a pilot script,
 * or if somebody commits a real email address into a public repository.
 *
 * These assertions are that missing failure. They read checked-in files only —
 * no database, no network, no agent. The behaviour of the scripts themselves is
 * proved separately, against local Supabase, in
 * `tests/pilot-scenario-lan-93.test.ts`.
 *
 * The precedent for asserting on documentation as a test is
 * `tests/agent-harness.test.ts`; the reasoning is the same. A rule that only
 * exists in prose is a rule that drifts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveLocalDatabaseUrl } from "../scripts/lib/local-db.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), "utf8");

const PILOT_RUNBOOK = "docs/pilot-data-runbook.md";
const PILOT_MANIFEST = "docs/pilot-data-manifest.md";
const MIGRATION_RUNBOOK = "docs/migration-runbook.md";
const PR_TEMPLATE = ".github/PULL_REQUEST_TEMPLATE.md";
const SCENARIO_DIR = "scripts/pilot/lan-93";

/** Every file under a directory, recursively, as repo-relative paths. */
function filesUnder(relativeDir: string): string[] {
  const absolute = path.join(repoRoot, relativeDir);
  return readdirSync(absolute, { recursive: true, encoding: "utf8" })
    .map((entry) => path.join(relativeDir, entry))
    .filter((entry) => statSync(path.join(repoRoot, entry)).isFile());
}

// ---------------------------------------------------------------------------
// Matrix row 6 — nothing executes the pilot scripts automatically
// ---------------------------------------------------------------------------

describe("nothing applies pilot data without a human", () => {
  /**
   * Every path from which a reference to `scripts/pilot/` would mean the
   * scripts could reach a database unattended: a rebuild from empty, the seed,
   * CI or the deploy, the container image, or the app itself.
   */
  const AUTOMATIC_PATHS = [
    "supabase/migrations",
    ".github/workflows",
    "src",
    "scripts/seed-local.mjs",
    "scripts/create-test-user.mjs",
    "scripts/link-test-operator.mjs",
    "scripts/generate-types.mjs",
    "scripts/check-rls-migrations.mjs",
    "scripts/lib/local-db.mjs",
    "supabase/seed.sql",
    "supabase/config.toml",
    "Dockerfile",
    ".dockerignore",
  ];

  const candidates = AUTOMATIC_PATHS.flatMap((entry) =>
    statSync(path.join(repoRoot, entry)).isDirectory() ? filesUnder(entry) : [entry],
  );

  it("checks a non-trivial set of files", () => {
    // A pass produced by an empty list is not a pass.
    expect(candidates.length).toBeGreaterThan(20);
  });

  it("would notice a reference if there were one", () => {
    // Positive control. Without it, a typo in the pattern below turns this
    // whole block into 30 assertions that nothing matches nothing.
    expect(read(PR_TEMPLATE)).toMatch(/scripts\/pilot/);
    expect(read("AGENTS.md")).toMatch(/scripts\/pilot/);
  });

  it.each(candidates)("%s does not reference scripts/pilot/", (file) => {
    expect(read(file)).not.toMatch(/scripts\/pilot/);
  });

  it("says so in the runbook and in the working agreement", () => {
    expect(read(PILOT_RUNBOOK)).toMatch(/Nothing runs these automatically/i);
    expect(read("AGENTS.md")).toMatch(/may reference `scripts\/pilot\/`/);
  });
});

// ---------------------------------------------------------------------------
// Matrix row 7 — the local-only guards are unchanged or stronger
// ---------------------------------------------------------------------------

describe("the local-only guard still refuses everything it refused before", () => {
  it.each([
    "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres",
    "postgresql://postgres.abc:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
    "postgresql://postgres:pw@10.0.0.7:5432/postgres",
    "postgresql://u:p@localhost.evil.example:5432/db",
    "postgresql://u:p@127.0.0.1.nip.io:5432/db",
  ])("refuses %s", (url) => {
    expect(() => resolveLocalDatabaseUrl(url)).toThrow();
  });

  it.each([
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "postgresql://postgres:postgres@localhost:54322/postgres",
    "postgresql://postgres:postgres@[::1]:54322/postgres",
  ])("still accepts %s", (url) => {
    expect(resolveLocalDatabaseUrl(url)).toBe(url);
  });

  it("is the guard the pilot scenario test connects through", () => {
    const test = read("tests/pilot-scenario-lan-93.test.ts");
    expect(test).toMatch(/from "\.\.\/scripts\/lib\/local-db\.mjs"/);
    expect(test).toMatch(/openLocalClient/);
    // `openLocalClient` is the fixture helper's wrapper around `connectLocal`,
    // which resolves its URL through the guard above.
    const fixture = read("tests/helpers/domain-fixture.ts");
    expect(fixture).toMatch(/import \{ connectLocal \}/);
    expect(fixture).toMatch(/from "\.\.\/\.\.\/scripts\/lib\/local-db\.mjs"/);
  });
});

// ---------------------------------------------------------------------------
// Matrix row 8 — no secret and no personal data enters the repository
// ---------------------------------------------------------------------------

describe("the pilot artifacts are value-free", () => {
  const PUBLIC_SURFACE = [
    ...filesUnder("scripts/pilot"),
    PILOT_RUNBOOK,
    PILOT_MANIFEST,
    PR_TEMPLATE,
  ];

  /**
   * The scenario's own deterministic identifier block, and nothing else —
   * either a full identifier, or the block written with an elided tail.
   */
  const SCENARIO_UUIDS = /00930093-0093-4093-8093-(?:[0-9a-f]{12}|…)/gi;
  const ANY_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
  const MIGRATION_VERSION = /\b20\d{12}\b/g;

  it("checks every pilot artifact", () => {
    expect(PUBLIC_SURFACE.length).toBeGreaterThanOrEqual(6);
    expect(PUBLIC_SURFACE).toContain(`${SCENARIO_DIR}/setup.sql`);
    expect(PUBLIC_SURFACE).toContain(`${SCENARIO_DIR}/cleanup.sql`);
  });

  it.each(PUBLIC_SURFACE)("%s contains no email address", (file) => {
    // Placeholders are angle-bracketed tokens, which cannot match this.
    expect(read(file)).not.toMatch(/[\w.%+-]+@[\w-]+\.[A-Za-z]{2,}/);
  });

  it.each(PUBLIC_SURFACE)("%s contains no identifier outside the scenario block", (file) => {
    const foreign = read(file).replace(SCENARIO_UUIDS, "").match(ANY_UUID) ?? [];
    expect(foreign).toEqual([]);
  });

  it.each(PUBLIC_SURFACE)("%s contains no phone number or long digit run", (file) => {
    const stripped = read(file).replace(SCENARIO_UUIDS, "").replace(MIGRATION_VERSION, "");
    expect(stripped).not.toMatch(/\+\d[\d\s()-]{9,}/);
    expect(stripped).not.toMatch(/\b\d{7,}\b/);
  });

  it.each(PUBLIC_SURFACE)("%s contains no key, token or connection string", (file) => {
    const content = read(file);
    expect(content).not.toMatch(/sb_secret_|sb_publishable_/);
    expect(content).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // a JWT
    expect(content).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    expect(content).not.toMatch(/postgres(ql)?:\/\//);
  });

  it("says why, where a future author will read it", () => {
    expect(read(PILOT_MANIFEST)).toMatch(/Value-free by rule/i);
    expect(read(PILOT_RUNBOOK)).toMatch(/placeholder/i);
  });
});

// ---------------------------------------------------------------------------
// Matrix rows 1–5, statically — what the scripts may and may not contain
// ---------------------------------------------------------------------------

describe("the scenario scripts stay inside the conventions", () => {
  const setup = read(`${SCENARIO_DIR}/setup.sql`);
  const cleanup = read(`${SCENARIO_DIR}/cleanup.sql`);

  it.each([
    ["setup.sql", setup],
    ["cleanup.sql", cleanup],
  ])("%s is one explicit transaction", (_name, sql) => {
    const statements = sql
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line === "begin;" || line === "commit;");
    expect(statements).toEqual(["begin;", "commit;"]);
  });

  it.each([
    ["setup.sql", setup],
    ["cleanup.sql", cleanup],
  ])("%s is not a migration in disguise", (_name, sql) => {
    // A pilot script never changes the schema. A schema change is a versioned
    // migration, identified to Brian before it is authored.
    expect(sql).not.toMatch(/\b(create|alter|drop)\s+(table|type|schema|index|policy|view)\b/i);
    expect(sql).not.toMatch(/^\s*(grant|revoke)\b/im);
  });

  it.each([
    ["setup.sql", setup],
    ["cleanup.sql", cleanup],
  ])("%s never writes to auth", (_name, sql) => {
    expect(sql).not.toMatch(/\b(insert\s+into|update|delete\s+from)\s+auth\./i);
  });

  it("setup.sql never rewrites a row it did not create", () => {
    expect(setup).toMatch(/on conflict \(id\) do nothing/);
    // `do update` would silently mutate whatever was already there.
    expect(setup).not.toMatch(/on conflict[^\n]*do update/i);
  });

  it("cleanup.sql deletes only from the scenario's own tables", () => {
    const targets = [...cleanup.matchAll(/delete\s+from\s+([\w.]+)/gi)].map((m) => m[1]);

    expect(targets).toEqual([
      "public.events",
      "public.season_memberships",
      "public.people",
      "public.seasons",
      "public.positions",
      "public.position_vocabularies",
    ]);

    for (const durable of [
      "auth.users",
      "public.operator_accounts",
      "public.role_assignments",
      "public.roles",
      "public.audit_events",
    ]) {
      expect(targets).not.toContain(durable);
    }
  });

  it("every delete in cleanup.sql is keyed on a deterministic identifier", () => {
    const statements = cleanup.split(";").filter((statement) => /delete\s+from/i.test(statement));

    expect(statements.length).toBe(6);
    for (const statement of statements) {
      expect(statement).toMatch(/where/i);
      expect(statement).toMatch(/00930093-0093-4093-8093-[0-9a-f]{12}/i);
    }
  });

  it("both scripts carry a preflight that raises rather than warns", () => {
    for (const sql of [setup, cleanup]) {
      expect(sql).toMatch(/do \$preflight\$/);
      expect(sql).toMatch(/raise exception/);
      expect(sql).not.toMatch(/raise warning/i);
    }
  });

  it("the scenario has a README carrying its verification query", () => {
    const readme = read(`${SCENARIO_DIR}/README.md`);
    expect(readme).toMatch(/```sql/);
    expect(readme).toMatch(/00930093-0093-4093-8093-000000000001/);
  });
});

// ---------------------------------------------------------------------------
// Matrix row 9 — the pull-request template forces disclosure
// ---------------------------------------------------------------------------

describe("the pull-request template", () => {
  const template = read(PR_TEMPLATE);

  it("exists and carries the Production handoff block", () => {
    expect(template).toMatch(/##\s+Production handoff/);
  });

  it.each([
    "Supabase schema migration",
    "Compatibility and deployment order",
    "Pilot setup required",
    "Pilot cleanup required",
    "Other Brian action",
    "Verification after Brian acts",
  ])("requires the line: %s", (line) => {
    expect(template).toContain(line);
  });

  it.each([
    "need pilot data",
    "Artifacts supplied",
    "Data created",
    "Data preserved",
    "Retention recommendation",
    "Application rollback",
    "Schema forward-fix and restore",
    "External or human-only steps",
  ])("requires the superset field: %s", (field) => {
    expect(template).toContain(field);
  });

  it("asks how the change was verified, and points at the runbooks", () => {
    expect(template).toMatch(/How it was verified/);
    expect(template).toContain("docs/pilot-data-runbook.md");
    expect(template).toContain("docs/migration-runbook.md");
  });
});

// ---------------------------------------------------------------------------
// Matrix row 10 — an agent can tell from AGENTS.md what to do
// ---------------------------------------------------------------------------

describe("the working agreement tells an agent what its pull request owes", () => {
  const agents = read("AGENTS.md");

  it("names the runbook that decides whether pilot artifacts are needed", () => {
    expect(agents).toContain("docs/pilot-data-runbook.md");
    expect(agents).toMatch(/Does this pull request need pilot-data artifacts\?/);
    expect(agents).toMatch(/scripts\/pilot\/<issue-id>\//);
  });

  it("requires the Production handoff block, by name and in full", () => {
    expect(agents).toMatch(/Production handoff/);

    // Line-wrap tolerant: the working agreement is prose, and a rule that
    // breaks because a sentence rewrapped is a rule nobody keeps.
    for (const line of [
      "schema migration",
      "compatibility and deployment order",
      "pilot setup required",
      "pilot cleanup required",
      "other Brian action",
      "verification after Brian acts",
    ]) {
      const pattern = new RegExp(line.split(" ").join("\\s+"), "i");
      expect(agents, `AGENTS.md must name "${line}"`).toMatch(pattern);
    }
  });

  it("states the timing rule: on discovery, in the pull request, and at handoff", () => {
    expect(agents).toMatch(/as soon as you discover/i);
    expect(agents).toMatch(/Repeat it in the pull request description/i);
    expect(agents).toMatch(/Repeat it again in the final\s+handoff/i);
    expect(agents).toMatch(/infer an action from a changed migration or SQL file/i);
  });

  it("forbids inventing a database concept to label test data", () => {
    expect(agents).toMatch(/never a new column and never a new table/i);
  });
});

// ---------------------------------------------------------------------------
// Matrix row 11 — the migration runbook is reconciled, not weakened
// ---------------------------------------------------------------------------

describe("the migration runbook", () => {
  const runbook = read(MIGRATION_RUNBOOK);

  it("still prohibits the real roster and real club operations", () => {
    expect(runbook).toMatch(
      /\*\*The real roster\*\*, or any bulk import of club records\s*\|\s*\*\*No\./,
    );
    expect(runbook).toMatch(/\*\*Real club operations\*\*[\s\S]{0,220}\*\*No\./);
    expect(runbook).toMatch(/Permitting synthetic data does \*\*not\*\* permit real data/i);
  });

  it("still names all three gates that hold the real data back", () => {
    expect(runbook).toMatch(/LAN-83/);
    expect(runbook).toMatch(/LAN-84/);
    expect(runbook).toMatch(/LAN-86/);
    expect(runbook).toMatch(/staging environment exists/i);
    expect(runbook).toMatch(/backup and restore have been verified by rehearsal/i);
  });

  it("permits the controlled pilot explicitly, so the gate cannot be read either way", () => {
    expect(runbook).toMatch(/Approved pilot identities and access/i);
    expect(runbook).toMatch(/Clearly synthetic feature scenarios/i);
  });

  it("links the pilot-data runbook and separates it from schema promotion", () => {
    expect(runbook).toContain("pilot-data-runbook.md");
    expect(runbook).toMatch(/this runbook owns schema promotion/i);
    expect(runbook).toMatch(/A migration never inserts scenario data/i);
  });

  it("still carries the whole two-clone model", () => {
    for (const rule of [
      "## The two-clone model",
      "Development clone",
      "Deployment clone",
      "npx supabase unlink",
      "### The development clone stays unlinked",
      "### Only merged, committed migrations are deployed",
      "### Never, in the deployment clone",
      "### Never, in any clone",
      "npx supabase db reset --linked",
    ]) {
      expect(runbook).toContain(rule);
    }
  });

  it("still refuses agent-run migrations and hosted credentials on a dev machine", () => {
    expect(runbook).toMatch(/No agent applies a migration to hosted Supabase/);
    expect(runbook).toMatch(/The local guards are not to be weakened/);
  });
});

// ---------------------------------------------------------------------------
// Matrix row 12 — elevated access is truthful and time-bounded
// ---------------------------------------------------------------------------

describe("the pilot runbook represents elevated access truthfully", () => {
  const runbook = read(PILOT_RUNBOOK);

  /** Every fenced SQL block in the runbook. */
  const sqlBlocks = [...runbook.matchAll(/```sql\n([\s\S]*?)```/g)].map((match) => match[1]);

  it("has SQL templates to assert about", () => {
    expect(sqlBlocks.length).toBeGreaterThanOrEqual(4);
  });

  it("uses the existing, non-constitutional it_officer seat", () => {
    expect(runbook).toMatch(/`it_officer`/);
    expect(runbook).toMatch(/is_constitutional_office = false|non-constitutional/);
    expect(runbook).toMatch(/Brian confirms he actually\s+holds it/i);
  });

  it("assigns no constitutional office and no invented seat", () => {
    expect(runbook).toMatch(
      /No constitutional office is assigned to him for testing[\s\S]{0,200}Treasurer/i,
    );
    expect(runbook).toMatch(/not a General Manager seat|no invented General Manager/i);
    expect(runbook).toMatch(/coaching seat/i);
  });

  it("never templates a grant of a constitutional office", () => {
    const grants = sqlBlocks.filter((block) => /insert into public\.role_assignments/i.test(block));
    expect(grants.length).toBeGreaterThanOrEqual(1);

    for (const grant of grants) {
      expect(grant).not.toMatch(/'(president|vice_president|secretary|treasurer)'/i);
      expect(grant).not.toMatch(/is_constitutional_office\s*(,|\))?\s*values[\s\S]*\btrue\b/i);
    }
  });

  it("time-bounds every grant at the moment it is made", () => {
    const grants = sqlBlocks.filter((block) => /insert into public\.role_assignments/i.test(block));
    for (const grant of grants) {
      expect(grant).toMatch(/effective_to/);
    }
    expect(runbook).toMatch(/`effective_to` is set\s+in the same statement/i);
    expect(runbook).toMatch(/expires or is deactivated at handoff/i);
  });

  it("deprovisions by end-dating and deactivating, never by deleting", () => {
    expect(runbook).toMatch(/Revocation is a\s+deactivation|deactivation, never a delete/i);
    expect(runbook).toMatch(/Never delete the `people` row/i);
    expect(runbook).toMatch(/invariant M2/);
  });

  it("keeps Auth user creation on the supported admin path", () => {
    expect(runbook).toMatch(/Never write to `auth\.users` with SQL/i);
    expect(runbook).toMatch(/Public signup is \*\*not\*\* reopened/i);
    expect(runbook).toMatch(
      /No Auth account is created and no invitation is sent[\s\S]{0,220}explicit authorization/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Matrix rows 13 and 14 — the manifest, and discoverability
// ---------------------------------------------------------------------------

describe("the pilot-data manifest", () => {
  const manifest = read(PILOT_MANIFEST);

  it("records the durable identities and the active scenarios separately", () => {
    expect(manifest).toMatch(/## Durable pilot identities and access/);
    expect(manifest).toMatch(/## Active synthetic scenarios/);
    expect(manifest).toMatch(/## Retired scenarios/);
  });

  it("names each approved tester as a role in the procedure", () => {
    for (const tester of ["Brian", "Stuart", "Garrett", "Glenn"]) {
      expect(manifest).toContain(tester);
    }
    expect(manifest).toMatch(/inventoried,\s*not duplicated/i);
    expect(manifest).toMatch(/Not provisioned/);
  });

  it("uses placeholders for every personal value", () => {
    expect(manifest).toContain("<auth-user-uuid>");
    expect(manifest).toContain("<person-uuid>");
    expect(manifest).toContain("<effective-to>");
  });

  it("records the worked example and that it has not been applied to hosted", () => {
    expect(manifest).toContain("LAN-93");
    expect(manifest).toContain("scripts/pilot/lan-93/");
    expect(manifest).toMatch(/\*\*No\.\*\* It is a worked example/);
  });
});

describe("the correct runbook is discoverable", () => {
  it("is linked from the README's documentation table", () => {
    const readme = read("README.md");
    expect(readme).toContain("docs/pilot-data-runbook.md");
    expect(readme).toContain("docs/pilot-data-manifest.md");
  });

  it("is distinguished from the real-roster gate in the README's limitations", () => {
    const readme = read("README.md");
    const limitations = readme.slice(readme.indexOf("## Known limitations"));
    expect(limitations).toMatch(/Controlled leadership pilot only/i);
    expect(limitations).toMatch(/remain prohibited\s+in every environment/i);
  });

  it("is linked from the working agreement and the ADR index", () => {
    expect(read("AGENTS.md")).toContain("docs/pilot-data-runbook.md");
    expect(read("docs/adr/README.md")).toContain("0016-controlled-production-pilot-data.md");
  });

  it("is a decision with an ADR behind it", () => {
    const adr = read("docs/adr/0016-controlled-production-pilot-data.md");
    expect(adr).toMatch(/\*\*Status:\*\* Accepted/);
    expect(adr).toMatch(/## Alternatives considered/);
    expect(adr).toMatch(/## Consequences/);
  });
});
