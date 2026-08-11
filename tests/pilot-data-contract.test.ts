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
    // Not one of the paths matrix row 6 enumerates, but `npm run db:reset` is a
    // documented developer command and is the cheapest place for a pilot script
    // to acquire an automatic caller.
    "package.json",
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

  /**
   * The exact conjuncts each delete is allowed to have.
   *
   * Asserting that "a UUID appears somewhere in the statement" is not a
   * constraint: `where id = '…' or name like 'PILOT-LAN-93%'` satisfies it and
   * deletes every row carrying the sentinel, in seasons no preflight looked at.
   * One character is the whole distance between the narrowest possible delete
   * and an arbitrarily wide one, so the predicate is pinned literally.
   */
  const EXPECTED_DELETES: readonly (readonly [table: string, conjuncts: readonly string[]])[] = [
    ["public.events", ["id = '00930093-0093-4093-8093-000000000006'", "name like 'PILOT-LAN-93%'"]],
    [
      "public.season_memberships",
      [
        "id = '00930093-0093-4093-8093-000000000005'",
        "person_id = '00930093-0093-4093-8093-000000000004'",
        "season_id = '00930093-0093-4093-8093-000000000003'",
      ],
    ],
    ["public.people", ["id = '00930093-0093-4093-8093-000000000004'", "known_as = 'PILOT-LAN-93'"]],
    [
      "public.seasons",
      ["id = '00930093-0093-4093-8093-000000000003'", "label like 'PILOT-LAN-93%'"],
    ],
    [
      "public.positions",
      ["id = '00930093-0093-4093-8093-000000000002'", "label like 'PILOT-LAN-93%'"],
    ],
    [
      "public.position_vocabularies",
      ["id = '00930093-0093-4093-8093-000000000001'", "code = 'pilot-lan-93'"],
    ],
  ];

  /** `delete from X where a and b` -> { table: "X", conjuncts: ["a", "b"] }. */
  function parseDeletes(sql: string): { table: string; where: string; conjuncts: string[] }[] {
    return sql
      .replace(/--[^\n]*/g, "")
      .split(";")
      .filter((statement) => /\bdelete\s+from\b/i.test(statement))
      .map((statement) => {
        const parsed = /\bdelete\s+from\s+([\w.]+)\s+where\s+([\s\S]+)$/i.exec(
          statement.replace(/\s+/g, " ").trim(),
        );
        if (!parsed) throw new Error(`A delete with no where clause: ${statement.trim()}`);
        return {
          table: parsed[1],
          where: parsed[2].trim(),
          conjuncts: parsed[2]
            .split(/\s+and\s+/i)
            .map((part) => part.trim())
            .filter(Boolean),
        };
      });
  }

  it("every delete in cleanup.sql conjoins its identifier with the sentinel", () => {
    const parsed = parseDeletes(cleanup);

    expect(parsed.map((statement) => statement.table)).toEqual(
      EXPECTED_DELETES.map(([table]) => table),
    );

    for (const [index, [table, conjuncts]] of EXPECTED_DELETES.entries()) {
      const statement = parsed[index];

      // No disjunction, anywhere. An `or` between the identifier and the
      // sentinel turns "this row" into "every row carrying the sentinel".
      expect(statement.where, `${table}: the where clause must not disjoin`).not.toMatch(/\bor\b/i);

      // And the conjuncts are exactly these — so dropping the sentinel half,
      // or adding a condition, is a failure rather than a silent widening.
      expect(statement.conjuncts, `${table}: unexpected delete predicate`).toEqual([...conjuncts]);
      expect(statement.conjuncts.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("holds every pilot scenario to that shape, not just this one", () => {
    // Written generically because the runbook says this scenario is meant to be
    // copied: a future `scripts/pilot/<issue>/cleanup.sql` inherits the rule.
    const cleanups = filesUnder("scripts/pilot").filter((file) => file.endsWith("cleanup.sql"));
    expect(cleanups.length).toBeGreaterThanOrEqual(1);

    for (const file of cleanups) {
      const sentinel = new RegExp(`PILOT-${path.basename(path.dirname(file))}`, "i");

      for (const statement of parseDeletes(read(file))) {
        expect(statement.where, `${file}: ${statement.table}`).not.toMatch(/\bor\b/i);
        expect(statement.conjuncts.length, `${file}: ${statement.table}`).toBeGreaterThanOrEqual(2);

        // One conjunct pins the row by its deterministic identifier …
        expect(
          statement.conjuncts.some((part) => /^id = '[0-9a-f-]{36}'$/i.test(part)),
          `${file}: ${statement.table} must be keyed on a deterministic id`,
        ).toBe(true);

        // … and the rest prove ownership, by the sentinel or by the scenario's
        // own parent identifiers.
        const ownership = statement.conjuncts.filter((part) => !/^id = /i.test(part));
        expect(
          ownership.every((part) => sentinel.test(part) || /'[0-9a-f-]{36}'/i.test(part)),
          `${file}: ${statement.table} has a conjunct that proves nothing`,
        ).toBe(true);
      }
    }
  });

  /**
   * A parsed preflight: its guard blocks, and any raise outside all of them.
   *
   * The rules below are stated as what a guard MUST be, never as a list of
   * things it must not be. A blacklist is how `raise notice` walked past the
   * previous version of this assertion — `raise warning` was forbidden and
   * every other level was not, and downgrading one word turned a refusal into a
   * message nobody reads while the whole suite stayed green.
   */
  interface GuardBlock {
    condition: string;
    body: string;
    raises: { level: string; line: string }[];
    hasNestedIf: boolean;
  }

  const RAISE_LEVELS = ["exception", "warning", "notice", "info", "log", "debug"];

  function parsePreflight(sql: string): { blocks: GuardBlock[]; looseRaises: string[] } {
    const preflight = /do \$preflight\$([\s\S]*?)\$preflight\$;/.exec(sql);
    if (!preflight) throw new Error("no do $preflight$ … $preflight$; block");

    const lines = preflight[1]
      .replace(/--[^\n]*/g, "")
      .split("\n")
      .map((line) => line.trim());

    const blocks: GuardBlock[] = [];
    const looseRaises: string[] = [];
    const open: {
      condition: string[];
      body: string[];
      raises: GuardBlock["raises"];
      nested: boolean;
    }[] = [];

    for (const line of lines) {
      if (/^if\b/.test(line)) {
        for (const enclosing of open) enclosing.nested = true;
        open.push({ condition: [line], body: [line], raises: [], nested: false });
        continue;
      }

      if (/^raise\b/i.test(line)) {
        const level = /^raise\s+([a-z]+)/i.exec(line)?.[1]?.toLowerCase() ?? "";
        if (open.length === 0) looseRaises.push(line);
        else open[open.length - 1].raises.push({ level, line });
      }

      for (const enclosing of open) enclosing.body.push(line);
      // The condition runs until `then`, which may be several lines below `if`.
      const innermost = open[open.length - 1];
      if (innermost && !innermost.condition.join(" ").includes(" then")) {
        if (innermost.condition[innermost.condition.length - 1] !== line) {
          innermost.condition.push(line);
        }
      }

      if (/^end if;$/.test(line)) {
        const finished = open.pop();
        if (!finished) throw new Error("an 'end if;' with no matching 'if'");
        blocks.push({
          condition: finished.condition.join(" "),
          body: finished.body.join(" "),
          raises: finished.raises,
          hasNestedIf: finished.nested,
        });
      }
    }

    if (open.length > 0) throw new Error("an 'if' with no matching 'end if;'");
    return { blocks, looseRaises };
  }

  const PREFLIGHTS = [["setup.sql", setup, 10] as const, ["cleanup.sql", cleanup, 17] as const];

  it.each(PREFLIGHTS)("%s carries a preflight of guard blocks, parsed", (_name, sql, minimum) => {
    const { blocks } = parsePreflight(sql);
    // A parser that found nothing must not be able to pass everything below.
    expect(blocks.length).toBeGreaterThanOrEqual(minimum);
  });

  it.each(PREFLIGHTS)("every guard in %s refuses — no other outcome exists", (name, sql) => {
    const { blocks, looseRaises } = parsePreflight(sql);

    for (const block of blocks) {
      // A guard that raises nothing is a guard that lets the run continue,
      // whether it was gutted, commented out, or never finished.
      expect(
        block.raises.length + (block.hasNestedIf ? 1 : 0),
        `${name}: this guard raises nothing — ${block.condition.slice(0, 90)}`,
      ).toBeGreaterThanOrEqual(1);

      for (const raise of block.raises) {
        // Positive requirement, not a blacklist: the level must BE exception.
        expect(
          raise.level,
          `${name}: a preflight guard must raise exception, not ${raise.level || "an unnamed level"} — ${raise.line.slice(0, 90)}`,
        ).toBe("exception");
      }

      // An innermost guard is exactly one refusal and nothing else.
      if (!block.hasNestedIf) {
        expect(block.raises.length, `${name}: ${block.condition.slice(0, 90)}`).toBe(1);
      }
    }

    // The only raise permitted outside a guard is the single "preflight passed"
    // notice, which reports rather than decides.
    expect(looseRaises.length).toBeLessThanOrEqual(1);
    for (const line of looseRaises) {
      expect(line.toLowerCase()).toMatch(/^raise notice /);
      expect(line).toMatch(/preflight passed/);
    }
  });

  it.each(PREFLIGHTS)("every raise in %s names its level explicitly", (name, sql) => {
    const { blocks, looseRaises } = parsePreflight(sql);
    const everyRaise = [
      ...blocks.flatMap((block) => block.raises.map((r) => r.line)),
      ...looseRaises,
    ];

    expect(everyRaise.length).toBeGreaterThan(0);
    for (const line of everyRaise) {
      // `raise 'text'` defaults to EXCEPTION, which is correct but invisible.
      // Requiring the word makes every later reading of this file unambiguous.
      const level = /^raise\s+([a-z]+)/i.exec(line)?.[1]?.toLowerCase();
      expect(RAISE_LEVELS, `${name}: ${line.slice(0, 90)}`).toContain(level);
    }
  });

  it.each(PREFLIGHTS)("%s raises nowhere except inside its preflight", (name, sql) => {
    // Otherwise a second `do $ … $;` block could carry guards the parser
    // above never looks at, and a weak one there would be invisible to every
    // structural rule in this file.
    const inFile = (sql.replace(/--[^\n]*/g, "").match(/^\s*raise\b/gim) ?? []).length;
    const { blocks, looseRaises } = parsePreflight(sql);
    const inPreflight =
      blocks.reduce((total, block) => total + block.raises.length, 0) + looseRaises.length;

    expect(inPreflight, `${name}: a raise exists outside the preflight block`).toBe(inFile);
    expect(sql.match(/do \$/g)?.length ?? 0, `${name}: exactly one anonymous block`).toBe(1);
  });

  it("cleanup.sql guards every foreign key PostgreSQL would follow unasked", () => {
    // The live-schema half of this — that these seven are ALL of them — is
    // `tests/pilot-scenario-lan-93.test.ts`, which reads pg_constraint and
    // requires a behavioural test per key. This half is structural: each guard
    // must be a real `if … then raise exception … end if;` block that queries
    // the table. A comment mentioning the table satisfies neither.
    const { blocks } = parsePreflight(cleanup);

    for (const table of [
      "public.person_aliases",
      "public.contact_points",
      "public.event_questions",
      "public.event_audience_members",
      "public.onboarding_item_types",
      "staging.legacy_roster_rows",
      "staging.legacy_event_rows",
    ]) {
      const guard = blocks.find(
        (block) =>
          new RegExp(`from \\s*${table.replace(".", "\\.")}\\b`).test(block.condition) &&
          block.raises.some((raise) => raise.level === "exception"),
      );

      expect(
        guard,
        `cleanup.sql has no guard block querying ${table} and raising an exception`,
      ).toBeDefined();
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

  /**
   * Splits a SQL expression list on its top-level commas, so a comma inside a
   * string literal or a function call does not shift every later position.
   */
  function splitExpressions(list: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quoted = false;
    let current = "";

    for (const character of list) {
      if (character === "'") quoted = !quoted;
      if (!quoted && character === "(") depth += 1;
      if (!quoted && character === ")") depth -= 1;
      if (!quoted && depth === 0 && character === ",") {
        parts.push(current.trim());
        current = "";
        continue;
      }
      current += character;
    }
    if (current.trim() !== "") parts.push(current.trim());
    return parts;
  }

  /**
   * A grant template, parsed into the columns it writes and the value supplied
   * for each — positionally.
   *
   * Asserting that the word `effective_to` appears somewhere in the block is not
   * a constraint on the grant: it survives in the `returning` clause of a
   * template that has stopped setting it, and `role_assignments.effective_to` is
   * nullable, so an open-ended grant would be accepted by the database in
   * silence. This is the one grant defect with no database backstop, so the
   * column list and the supplied values are read separately and paired.
   */
  interface Grant {
    columns: string[];
    values: string[];
    statement: string;
  }

  /** Every `insert into public.role_assignments` in the document, wherever it is. */
  const GRANT_OPENER = /insert\s+into\s+public\.role_assignments/gi;

  /**
   * Parses EVERY grant in the whole document — not one per fenced block, and not
   * only the fences tagged `sql`.
   *
   * The previous version filtered fences and then `exec`ed once per fence, so it
   * read the first grant in each and no other. A second `insert into
   * public.role_assignments` appended to an existing fence — the obvious next
   * edit, with a section headed "Brian's own elevated access" directly below
   * one — was never looked at. Scanning the raw document means the fence tag,
   * the fence itself, and the position in the file are all irrelevant.
   */
  function parseAllGrants(document: string): Grant[] {
    const flatDocument = document.replace(/--[^\n]*/g, "");
    const grants: Grant[] = [];

    for (const opener of flatDocument.matchAll(GRANT_OPENER)) {
      const start = opener.index ?? 0;
      const terminator = flatDocument.indexOf(";", start);
      const statement = flatDocument
        .slice(start, terminator === -1 ? flatDocument.length : terminator + 1)
        .replace(/\s+/g, " ")
        .trim();

      const columnList = /insert\s+into\s+public\.role_assignments\s*\(([^)]*)\)/i.exec(statement);
      if (!columnList) throw new Error(`Grant has no column list: ${statement}`);

      // Either `insert … select <values> from …` or `insert … values (<values>)`.
      // `returning` is deliberately outside both: it reports, it does not write.
      const fromSelect = /\)\s*select\s+(.*?)\s+from\s+/i.exec(statement);
      const fromValues = /\)\s*values\s*\((.*?)\)\s*(?:returning|;|$)/i.exec(statement);
      const valueList = fromSelect?.[1] ?? fromValues?.[1];
      if (valueList === undefined) throw new Error(`Grant supplies no values: ${statement}`);

      grants.push({
        columns: splitExpressions(columnList[1]),
        values: splitExpressions(valueList),
        statement,
      });
    }

    return grants;
  }

  /** The value the template supplies for a named column, or undefined. */
  function valueFor(grant: Grant, column: string): string | undefined {
    const index = grant.columns.indexOf(column);
    return index === -1 ? undefined : grant.values[index];
  }

  /** Is this value read from `public.roles`, rather than asserted by the author? */
  function isDerivedFromTheRole(value: string | undefined): boolean {
    if (value === undefined) return false;
    return /^r\./i.test(value) || /select[\s\S]*from\s+public\.roles\b/i.test(value);
  }

  it("parses every grant in the document, not the first one in each fence", () => {
    const occurrences = (runbook.match(/insert\s+into\s+public\.role_assignments/gi) ?? []).length;
    const grants = parseAllGrants(runbook);

    expect(occurrences).toBeGreaterThanOrEqual(1);
    // Self-detecting: a parser that reads one grant per fence, or skips a fence
    // it does not recognise, disagrees with a plain count of the document.
    expect(
      grants.length,
      "some grant in this document was never parsed, so nothing below constrains it",
    ).toBe(occurrences);

    for (const grant of grants) {
      // Without this, every positional assertion below could be reading the
      // wrong expression and still agreeing with itself.
      expect(grant.values.length).toBe(grant.columns.length);
    }
  });

  it("never templates a grant of a constitutional office", () => {
    const grants = parseAllGrants(runbook);
    expect(grants.length).toBeGreaterThanOrEqual(1);

    for (const grant of grants) {
      // The office flag and the scope are read FROM the role, never asserted by
      // the person writing the grant. A literal here is how a template starts
      // disagreeing with `public.roles` about what a seat is — and an
      // authorization record that disagrees with the seat is the untruthful
      // grant this whole section exists to prevent.
      for (const column of ["role_id", "scope", "is_constitutional_office"]) {
        const value = valueFor(grant, column);
        expect(grant.columns, `a grant must write ${column}`).toContain(column);
        expect(
          isDerivedFromTheRole(value),
          `${column} must be read from public.roles, not written as ${value}`,
        ).toBe(true);
      }

      // And no constitutional office is named anywhere in the statement —
      // including the `where r.code = …` that chooses which seat is granted.
      expect(grant.statement).not.toMatch(/'(president|vice_president|secretary|treasurer)'/i);
    }
  });

  it("time-bounds every grant at the moment it is made", () => {
    const grants = parseAllGrants(runbook);
    expect(grants.length).toBeGreaterThanOrEqual(1);

    for (const grant of grants) {
      expect(grant.columns, "a grant must write effective_to").toContain("effective_to");
      expect(grant.columns).toContain("effective_from");

      // And the value in its slot must be an end date. A column present with
      // `null` or `default` is an open-ended grant wearing the right column
      // name, and `role_assignments.effective_to` is nullable — the database
      // accepts it in silence, so this assertion is the only control.
      const end = valueFor(grant, "effective_to");
      expect(end, "effective_to must be supplied a value").toBeDefined();
      expect(end?.trim()).not.toBe("");
      expect(end, "effective_to must not be null or defaulted").not.toMatch(/^(null|default)$/i);
      expect(end, "effective_to must be an end date").toMatch(
        /<effective-to>|date\s+'|::date|current_date|now\(\)/i,
      );
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
