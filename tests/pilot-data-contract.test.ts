// @vitest-environment node
/**
 * The pilot-data contract (LAN-93 / ADR 0016) is documentation and a
 * pull-request template. Nothing else in the repository fails if the
 * real-roster prohibition is quietly softened, if the Production handoff block
 * loses the line about migrations, if a workflow starts running a pilot script,
 * or if somebody commits a real email address into a public repository.
 *
 * These assertions are that missing failure. They read checked-in files only —
 * no database, no network, no agent.
 *
 * The slice's scenarios under `scripts/pilot/` were retired with their suites
 * on 2026-09-26 (LAN-436, ADR 0016's amendment). What stays is the procedure,
 * so what stays here is the contract on the procedure: the runbook, the
 * manifest, the template, and the directory's README. A future scenario brings
 * its own local suite, as the runbook's checklist requires.
 *
 * Checks over a list of files collect every offender and assert the list is
 * empty, rather than generating one test per file: the failure still names
 * each offending file.
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

  it("no automatic path references scripts/pilot/", () => {
    const offenders = candidates.filter((file) => /scripts\/pilot/.test(read(file)));
    expect(offenders, "these files reference scripts/pilot/").toEqual([]);
  });

  it("says so in the runbook", () => {
    expect(read(PILOT_RUNBOOK)).toMatch(/Nothing runs these automatically/i);
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

  it("is the guard the database fixtures connect through", () => {
    const parity = read("tests/service-layer-guard-parity.test.ts");
    expect(parity).toMatch(/from "\.\.\/scripts\/lib\/local-db\.mjs"/);
    for (const host of ["db.abcdefghijklmnop.supabase.co", "pooler.supabase.com", "10.0.0.7"])
      expect(parity).toContain(host);
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
  const ANY_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
  const MIGRATION_VERSION = /\b20\d{12}\b/g;

  /**
   * A scenario's own reserved identifier block, derived from its directory name
   * rather than hard-coded — the zero-padded issue number written five times.
   * LAN-93 reserves `00930093-0093-4093-8093-…`, LAN-74
   * `00740074-0074-4074-8074-…`.
   *
   * Deriving it holds each scenario to **its own** block, which is stricter
   * than one shared pattern: a file quoting another scenario's identifiers now
   * fails where it would once have passed.
   */
  function scenarioBlock(file: string): RegExp | null {
    const issue = /^lan-(\d+)$/i.exec(path.basename(path.dirname(file)));
    if (!issue) return null;
    const n = issue[1].padStart(4, "0");
    const tail = n.slice(1);
    return new RegExp(`${n}${n}-${n}-4${tail}-8${tail}-(?:[0-9a-f]{12}|…)`, "gi");
  }

  /**
   * Contact values that cannot reach a human being.
   *
   * `example.invalid` and the rest of RFC 2606 §2 are reserved by the IETF and
   * can never resolve; `07700 900000`–`900999` is Ofcom's drama range and is
   * never allocated. A scenario exercising a contact-matching feature — LAN-74's
   * duplicate check is the first — cannot be written without contact values, and
   * refusing these would mean either no such scenario or a real address in a
   * public repository. The rule this carves out of is "no REAL name, email,
   * phone"; these are the values standards bodies reserve so they can never be
   * anybody's.
   *
   * The domain must END at the reserved label: `\b` would let
   * `someone@example.invalid.co.uk` — a registrable domain — strip to a residue
   * with no `@` that the email check below then cannot see.
   */
  const UNROUTABLE_EMAIL = /[\w.%+-]+@(?:[\w-]+\.)*example\.(?:invalid|com|org|net)(?![\w.-])/gi;
  const RESERVED_PHONE = /(?:\+44\s?|0)7700\s?900\d{3}\b/g;

  /**
   * Any scenario's reserved block, for files that belong to no one scenario —
   * `0NNN0NNN-0NNN-4NNN-8NNN-…` for any issue number, exactly the shape
   * `scenarioBlock` derives for one.
   */
  const ALL_SCENARIO_BLOCKS = [/0(\d{3})0\1-0\1-4\1-8\1-(?:[0-9a-f]{12}|…)/gi];

  /**
   * Everything a value-free check may ignore, removed.
   *
   * A file inside `scripts/pilot/<issue>/` is held to that issue's block alone.
   * The runbook, the manifest and the pull-request template belong to no single
   * scenario and legitimately quote several, so they may use any reserved
   * block — and still nothing else.
   */
  function stripped(file: string): string {
    const own = scenarioBlock(file);
    const blocks = own ? [own] : ALL_SCENARIO_BLOCKS;

    let content = read(file);
    for (const block of blocks) content = content.replace(block, "");
    return content
      .replace(MIGRATION_VERSION, "")
      .replace(UNROUTABLE_EMAIL, "")
      .replace(RESERVED_PHONE, "");
  }

  it("checks every pilot artifact", () => {
    expect(PUBLIC_SURFACE.length).toBeGreaterThanOrEqual(4);
    expect(PUBLIC_SURFACE).toContain("scripts/pilot/README.md");
    expect(PUBLIC_SURFACE).toContain(PILOT_RUNBOOK);
  });

  it("recognises any scenario's reserved identifier block, and only that shape", () => {
    const [block] = ALL_SCENARIO_BLOCKS;
    expect("00930093-0093-4093-8093-000000000001".replace(block, "")).toBe("");
    expect("01100110-0110-4110-8110-…".replace(block, "")).toBe("");
    expect("00930093-0094-4093-8093-000000000001".replace(block, "")).not.toBe("");
  });

  /** Every file in the public surface whose stripped content matches. */
  const offending = (pattern: RegExp): string[] =>
    PUBLIC_SURFACE.filter((file) => pattern.test(stripped(file)));

  it("recognises a reserved contact value, and only a reserved one", () => {
    // The carve-out is the one place this file gets more permissive, so its
    // boundary is asserted rather than assumed.
    expect("avery@example.invalid".replace(UNROUTABLE_EMAIL, "")).toBe("");
    expect("avery@ox.ac.uk".replace(UNROUTABLE_EMAIL, "")).toBe("avery@ox.ac.uk");
    expect("+44 7700 900174".replace(RESERVED_PHONE, "")).toBe("");
    expect("07700 900174".replace(RESERVED_PHONE, "")).toBe("");
    expect("+44 7911 123456".replace(RESERVED_PHONE, "")).toBe("+44 7911 123456");

    // A registrable domain that merely starts with a reserved label is not
    // reserved, and must survive whole — asserting on the residue is not
    // enough, because a partial strip removes the `@` and blinds the check.
    for (const routable of [
      "brian@example.invalid.co.uk",
      "brian@example.community",
      "brian@example.nettle.org",
    ]) {
      expect(routable.replace(UNROUTABLE_EMAIL, "")).toBe(routable);
    }
  });

  it("contains no email address", () => {
    // Placeholders are angle-bracketed tokens, which cannot match this.
    expect(offending(/[\w.%+-]+@[\w-]+\.[A-Za-z]{2,}/), "files with an email address").toEqual([]);
  });

  it("contains no identifier outside the scenario block", () => {
    const found = PUBLIC_SURFACE.flatMap((file) =>
      (stripped(file).match(ANY_UUID) ?? []).map((uuid) => `${file}: ${uuid}`),
    );
    expect(found).toEqual([]);
  });

  it("contains no phone number or long digit run", () => {
    expect(offending(/\+\d[\d\s()-]{9,}/), "files with a phone number").toEqual([]);
    expect(offending(/\b\d{7,}\b/), "files with a long digit run").toEqual([]);
  });

  it("contains no key, token or connection string", () => {
    const SECRET_SHAPES = [
      /sb_secret_|sb_publishable_/,
      /eyJ[A-Za-z0-9_-]{10,}/, // a JWT
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /postgres(ql)?:\/\//,
    ];
    const found = PUBLIC_SURFACE.flatMap((file) =>
      SECRET_SHAPES.filter((shape) => shape.test(read(file))).map((shape) => `${file}: ${shape}`),
    );
    expect(found).toEqual([]);
  });

  it("says why, where a future author will read it", () => {
    expect(read(PILOT_MANIFEST)).toMatch(/Value-free by rule/i);
    expect(read(PILOT_RUNBOOK)).toMatch(/placeholder/i);
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

  it("requires every Production handoff line", () => {
    const missing = [
      "Supabase schema migration",
      "Compatibility and deployment order",
      "Pilot setup required",
      "Pilot cleanup required",
      "Other Brian action",
      "Verification after Brian acts",
    ].filter((line) => !template.includes(line));
    expect(missing, "Production handoff lines missing from the template").toEqual([]);
  });

  it("requires every superset field", () => {
    const missing = [
      "need pilot data",
      "Artifacts supplied",
      "Data created",
      "Data preserved",
      "Retention recommendation",
      "Application rollback",
      "Schema forward-fix and restore",
      "External or human-only steps",
    ].filter((field) => !template.includes(field));
    expect(missing, "superset fields missing from the template").toEqual([]);
  });

  it("asks how the change was verified, and points at the runbooks", () => {
    expect(template).toMatch(/How it was verified/);
    expect(template).toContain("docs/pilot-data-runbook.md");
    expect(template).toContain("docs/migration-runbook.md");
  });
});

// ---------------------------------------------------------------------------
// Matrix row 10 — the migration runbook is reconciled, not weakened
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
   * A statement that WRITES to `role_assignments`, parsed into the columns it
   * assigns and the expression assigned to each.
   *
   * Asserting that the word `effective_to` appears somewhere in the block is not
   * a constraint on the grant: it survives in the `returning` clause of a
   * template that has stopped setting it, and `role_assignments.effective_to` is
   * nullable, so an open-ended grant would be accepted by the database in
   * silence. This is the one grant defect with no database backstop, so the
   * assigned columns and the assigned values are read separately and paired.
   */
  interface Write {
    kind: "insert" | "update";
    /** Column name → the expression assigned to it, in statement order. Empty for a delete. */
    assignments: { column: string; value: string }[];
    statement: string;
  }

  /**
   * Everything that has to disappear before a statement can be read reliably:
   * comments, blockquote and list markers, quoted identifiers, schema
   * qualification, and line wrapping.
   *
   * LAN-99's instruction was to **normalise before parsing rather than add
   * structural rules**, and this is where that is paid. Once `"public"."role_
   * assignments"`, `public.role_assignments` and `role_assignments` are all the
   * same six-and-a-bit characters, one small parser reads every spelling of the
   * statement class instead of one literal opener.
   *
   * Blockquote markers go because a grant written inside a `>` block is still a
   * grant. Fences are deliberately NOT considered: the fence tag, the fence
   * itself, and the position in the file stay irrelevant, which is the ground
   * won in LAN-93's third review round and must not be given back.
   */
  function normaliseSql(document: string): string {
    return (
      document
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/--[^\n]*/g, " ")
        // Blockquote and unordered-list markers at the start of a line.
        .replace(/^[ \t]*(?:[>*+-][ \t]?)+/gm, " ")
        // `"role_assignments"` → `role_assignments`, for any quoted identifier.
        .replace(/"([A-Za-z_][A-Za-z0-9_$]*)"/g, "$1")
        .replace(/\s+/g, " ")
        // Any schema qualifier immediately in front of the table.
        .replace(/\b[A-Za-z_][A-Za-z0-9_$]*\s*\.\s*(role_assignments)\b/gi, "$1")
    );
  }

  /**
   * Anything that could be a write to `role_assignments`, whatever the verb.
   *
   * **Deliberately broader than the parser below can read.** `merge`, `delete`,
   * `truncate` and `copy` are in here precisely because `parseWrite` cannot
   * decompose them: a statement in one of those forms is found, handed to a
   * parser that refuses it, and the suite goes **red with a message**. That is
   * the whole fix for the self-referential completeness check — the finder and
   * the parser are no longer the same expression, and the direction they differ
   * in is "shout", not "vanish".
   */
  const WRITE_STATEMENT =
    /\b(?:insert\s+into|update|merge\s+into|upsert\s+into|delete\s+from|truncate(?:\s+table)?|copy)\s+role_assignments\b/gi;

  /** Truncated for a readable failure message; the file is what you go and read. */
  const quote = (statement: string): string =>
    statement.length > 240 ? `${statement.slice(0, 240)}…` : statement;

  /** A candidate statement, from its verb to its terminator. */
  function candidateStatements(normalised: string): { text: string; index: number }[] {
    const found: { text: string; index: number }[] = [];
    for (const match of normalised.matchAll(WRITE_STATEMENT)) {
      const start = match.index;
      const terminator = normalised.indexOf(";", start);
      found.push({
        index: start,
        text: normalised
          .slice(start, terminator === -1 ? normalised.length : terminator + 1)
          .trim(),
      });
    }
    return found;
  }

  /**
   * Decomposes one candidate. **Throws on anything it cannot read**, so an
   * unrecognised form fails loudly instead of slipping past unconstrained.
   */
  function parseWrite(statement: string): Write {
    if (/^insert\s+into\b/i.test(statement)) {
      const columnList = /^insert\s+into\s+role_assignments\s*\(([^)]*)\)/i.exec(statement);
      if (!columnList) {
        throw new Error(
          `A write to role_assignments has no column list, so nothing can be paired with it: ${quote(statement)}`,
        );
      }

      // Either `insert … select <values> from …` or `insert … values (<values>)`.
      // `returning` is deliberately outside both: it reports, it does not write.
      const fromSelect = /\)\s*select\s+(.*?)\s+from\s+/i.exec(statement);
      const fromValues = /\)\s*values\s*\((.*?)\)\s*(?:returning|;|$)/i.exec(statement);
      const valueList = fromSelect?.[1] ?? fromValues?.[1];
      if (valueList === undefined) {
        throw new Error(`A write to role_assignments supplies no values: ${quote(statement)}`);
      }

      const columns = splitExpressions(columnList[1]);
      const values = splitExpressions(valueList);
      if (columns.length !== values.length) {
        throw new Error(
          `A write to role_assignments pairs ${columns.length} columns with ${values.length} values: ${quote(statement)}`,
        );
      }

      return {
        kind: "insert",
        assignments: columns.map((column, index) => ({ column, value: values[index] })),
        statement,
      };
    }

    if (/^update\b/i.test(statement)) {
      const setClause = /^update\s+role_assignments\s+set\s+([\s\S]*)$/i.exec(statement);
      if (!setClause) {
        throw new Error(`An update of role_assignments has no set clause: ${quote(statement)}`);
      }

      // `where` and `returning` restrict and report; neither assigns anything.
      const assigned = setClause[1]
        .replace(/;\s*$/, "")
        .split(/\s+where\s+/i)[0]
        .split(/\s+returning\s+/i)[0];

      return {
        kind: "update",
        assignments: splitExpressions(assigned).map((part) => {
          const pair = /^([A-Za-z_][A-Za-z0-9_$]*)\s*=\s*([\s\S]+)$/.exec(part.trim());
          if (!pair) {
            throw new Error(
              `An update of role_assignments assigns something this check cannot read — "${part.trim()}" in: ${quote(statement)}`,
            );
          }
          return { column: pair[1].toLowerCase(), value: pair[2].trim() };
        }),
        statement,
      };
    }

    throw new Error(
      `A statement writes role_assignments in a form this check cannot read, so nothing constrains it: ${quote(statement)}`,
    );
  }

  /** Every write to `role_assignments` in one already-normalised document. */
  function findWrites(normalised: string): Write[] {
    return candidateStatements(normalised).map((candidate) => parseWrite(candidate.text));
  }

  /** The expression assigned to a named column, or undefined. */
  function valueFor(write: Write, column: string): string | undefined {
    return write.assignments.find((assignment) => assignment.column === column)?.value;
  }

  /** Is this value read from `public.roles`, rather than asserted by the author? */
  function isDerivedFromTheRole(value: string | undefined): boolean {
    if (value === undefined) return false;
    return /^r\./i.test(value) || /select[\s\S]*from\s+public\.roles\b/i.test(value);
  }

  /**
   * An end date, anchored at the start of the assigned expression.
   *
   * Anchored on purpose. An unterminated statement runs on into whatever
   * follows it in the document, and an unanchored pattern would happily find a
   * `date '` fifty words later and call an open-ended grant time-bounded.
   */
  const END_DATE = /^(?:date\s+'|timestamptz?\s+'|current_date\b|now\(\)|'[^']*'\s*::|<[a-z-]*>)/i;

  /** What a write may be wrong about. One category per surviving rule. */
  interface Violation {
    rule: "truthful" | "time-bound";
    message: string;
  }

  /**
   * Every rule the grant templates must satisfy, expressed once.
   *
   * The `it` blocks below assert this is empty for the real documents; the
   * injection block at the end feeds it deliberately broken copies of the same
   * documents and requires it to object. One implementation, judged both ways —
   * a rule that is only ever shown correct input is a rule nobody has tested.
   *
   * **How the rule is expressed for an `update`.** An `update` has no column
   * list, so the positional pairing an `insert` needs does not apply to it: its
   * assignments come from the `set` clause, and the rule is about the **value
   * assigned**, not about which columns are present. Concretely — an `insert`
   * creates the assignment, so it must supply `role_id`, `scope`,
   * `is_constitutional_office`, `effective_from` and `effective_to`; an
   * `update` need supply none of them, but whichever of them it *does* assign
   * is held to exactly the same standard. That is what makes
   * `set effective_to = null` a violation while the deprovisioning template's
   * `set effective_to = date '<end-date>'` stays correct, and it is why an
   * `update` that only touches `note` is not treated as a grant.
   */
  function violations(normalised: string): Violation[] {
    const found: Violation[] = [];

    for (const write of findWrites(normalised)) {
      const columns = write.assignments.map((assignment) => assignment.column);

      // The office flag and the scope are read FROM the role, never asserted by
      // the person writing the grant. A literal here is how a template starts
      // disagreeing with `public.roles` about what a seat is — and an
      // authorization record that disagrees with the seat is the untruthful
      // grant this whole section exists to prevent.
      for (const column of ["role_id", "scope", "is_constitutional_office"]) {
        if (write.kind === "insert" && !columns.includes(column)) {
          found.push({
            rule: "truthful",
            message: `a grant must write ${column}: ${quote(write.statement)}`,
          });
          continue;
        }
        if (!columns.includes(column)) continue;
        if (!isDerivedFromTheRole(valueFor(write, column))) {
          found.push({
            rule: "truthful",
            message: `${column} must be read from public.roles, not written as ${valueFor(write, column)}: ${quote(write.statement)}`,
          });
        }
      }

      // And no constitutional office is named anywhere in the statement —
      // including the `where r.code = …` that chooses which seat is granted.
      if (/'(president|vice_president|secretary|treasurer)'/i.test(write.statement)) {
        found.push({
          rule: "truthful",
          message: `a constitutional office is named in: ${quote(write.statement)}`,
        });
      }

      // An insert creates the assignment, so it must bound it at that moment.
      if (write.kind === "insert") {
        for (const column of ["effective_from", "effective_to"]) {
          if (!columns.includes(column)) {
            found.push({
              rule: "time-bound",
              message: `a grant must write ${column}: ${quote(write.statement)}`,
            });
          }
        }
      }

      // And whoever assigns `effective_to` must assign it an end date. A column
      // present with `null` or `default` is an open-ended grant wearing the
      // right column name, and `role_assignments.effective_to` is nullable —
      // the database accepts it in silence, so this assertion is the only
      // control, for the `insert` that opens access and for the `update` that
      // could re-open it alike.
      if (columns.includes("effective_to")) {
        const end = valueFor(write, "effective_to");
        if (end === undefined || end.trim() === "" || !END_DATE.test(end.trim())) {
          found.push({
            rule: "time-bound",
            message: `effective_to must be an end date, not "${end}", in: ${quote(write.statement)}`,
          });
        }
      }
    }

    return found;
  }

  /**
   * The files this scan reads, and why these (matrix row 7).
   *
   * `docs/pilot-data-runbook.md` is the procedure Brian executes by hand against
   * the one production database. `docs/pilot-data-manifest.md` records what is
   * in hosted and mentions the table zero times today — it is scanned so that
   * the first grant written into it is constrained on the day it appears rather
   * than the day somebody remembers. Everything under `scripts/pilot/` is
   * scanned too, README and SQL alike: the retired LAN-93 `cleanup.sql` touched
   * `role_assignments` and was once outside the scan entirely, which the issue
   * called out. Enumerating the directory rather than the files means a future
   * `scripts/pilot/<issue>/` is scanned the moment it is added, with nobody
   * having to remember this list exists.
   *
   * What stays out, said plainly: `supabase/migrations/` and `src/`. Those are
   * code, not a hand-executed procedure, and the grants they contain — none
   * today — would be reviewed as code and proved against the local database.
   */
  const GRANT_SCAN: readonly string[] = [
    PILOT_RUNBOOK,
    PILOT_MANIFEST,
    ...filesUnder("scripts/pilot"),
  ];

  it("scans every hand-executed pilot document, and finds writes in them", () => {
    expect(GRANT_SCAN).toContain(PILOT_RUNBOOK);
    expect(GRANT_SCAN).toContain(PILOT_MANIFEST);
    expect(GRANT_SCAN).toContain("scripts/pilot/README.md");

    const writes = GRANT_SCAN.flatMap((file) => findWrites(normaliseSql(read(file))));

    // The templated grant, and the deprovisioning update that ends it. A pass
    // produced by finding nothing at all is not a pass.
    expect(writes.length, "no write to role_assignments was found anywhere").toBeGreaterThanOrEqual(
      2,
    );
    expect(writes.map((write) => write.kind)).toContain("insert");
    expect(writes.map((write) => write.kind)).toContain("update");

    for (const write of writes) {
      expect(write.assignments.length).toBeGreaterThan(0);
    }
  });

  it("never templates a grant of a constitutional office", () => {
    const writes = GRANT_SCAN.flatMap((file) => findWrites(normaliseSql(read(file))));
    expect(writes.length).toBeGreaterThanOrEqual(2);

    for (const write of writes) {
      if (write.kind === "insert") {
        for (const column of ["role_id", "scope", "is_constitutional_office"]) {
          const value = valueFor(write, column);
          const columns = write.assignments.map((assignment) => assignment.column);
          expect(columns, `a grant must write ${column}`).toContain(column);
          expect(
            isDerivedFromTheRole(value),
            `${column} must be read from public.roles, not written as ${value}`,
          ).toBe(true);
        }
      }

      expect(write.statement).not.toMatch(/'(president|vice_president|secretary|treasurer)'/i);
    }

    expect(
      GRANT_SCAN.flatMap((file) => violations(normaliseSql(read(file)))).filter(
        (violation) => violation.rule === "truthful",
      ),
    ).toEqual([]);
  });

  it("time-bounds every grant at the moment it is made", () => {
    const writes = GRANT_SCAN.flatMap((file) => findWrites(normaliseSql(read(file))));
    expect(writes.length).toBeGreaterThanOrEqual(2);

    for (const write of writes) {
      const columns = write.assignments.map((assignment) => assignment.column);

      if (write.kind === "insert") {
        expect(columns, "a grant must write effective_to").toContain("effective_to");
        expect(columns).toContain("effective_from");
      }

      if (columns.includes("effective_to")) {
        const end = valueFor(write, "effective_to");
        expect(end, "effective_to must be supplied a value").toBeDefined();
        expect(end?.trim()).not.toBe("");
        expect(end, "effective_to must not be null or defaulted").not.toMatch(/^(null|default)\b/i);
        expect(end, "effective_to must be an end date").toMatch(END_DATE);
      }
    }

    expect(
      GRANT_SCAN.flatMap((file) => violations(normaliseSql(read(file)))).filter(
        (violation) => violation.rule === "time-bound",
      ),
    ).toEqual([]);

    expect(runbook).toMatch(/`effective_to` is set\s+in the same statement/i);
    expect(runbook).toMatch(/expires or is deactivated at handoff/i);
  });

  // -------------------------------------------------------------------------
  // The check is shown broken documents, so it cannot rot into a no-op
  // -------------------------------------------------------------------------

  describe("an open-ended grant turns this suite red, however it is written", () => {
    /** The real runbook with one thing changed. Nothing on disk is touched. */
    const mutated = (find: string | RegExp, replace: string): string => {
      const result = runbook.replace(find, replace);
      expect(result, `the injection did not apply: ${find}`).not.toBe(runbook);
      return normaliseSql(result);
    };

    /** An open-ended grant in every spelling the issue names. */
    const OPEN_ENDED = {
      "an unqualified insert, relying on search_path":
        "insert into role_assignments (person_id, role_id, scope, is_constitutional_office, " +
        "committee_year_id, effective_from, effective_to, note) values " +
        "('p', 'r', 'committee_year', false, 'c', current_date, null, 'x');",
      "a fully quoted insert":
        'insert into "public"."role_assignments" (person_id, role_id, scope, ' +
        "is_constitutional_office, committee_year_id, effective_from, effective_to, note) values " +
        "('p', 'r', 'committee_year', false, 'c', current_date, null, 'x');",
      "an unqualified-and-quoted insert":
        'insert into "role_assignments" (person_id, role_id, scope, is_constitutional_office, ' +
        "committee_year_id, effective_from, effective_to, note) values " +
        "('p', 'r', 'committee_year', false, 'c', current_date, null, 'x');",
      "a new open-ended update":
        "update public.role_assignments set effective_to = null where person_id = 'p';",
      "an update that clears it with a default":
        "update role_assignments set effective_to = default where person_id = 'p';",
      "an insert … select with a null end date":
        "insert into public.role_assignments (person_id, role_id, scope, " +
        "is_constitutional_office, committee_year_id, effective_from, effective_to, note) select " +
        "'p', r.id, r.scope, r.is_constitutional_office, 'c', current_date, null, 'x' " +
        "from public.roles r where r.code = 'it_officer';",
    };

    it("the runbook as it stands today is clean", () => {
      // Row 5. A false positive on the correct document is a failure of this
      // check, not a finding about the runbook.
      expect(violations(normaliseSql(runbook))).toEqual([]);
      for (const file of GRANT_SCAN) {
        expect(violations(normaliseSql(read(file))), `${file} must be clean today`).toEqual([]);
      }
    });

    it("catches the mutated deprovisioning template, which adds no statement at all", () => {
      // The sharpest injection: it changes a literal in a template that already
      // exists, so anything keyed on counting new statements misses it entirely.
      const document = mutated("set effective_to = date '<end-date>'", "set effective_to = null");
      const found = violations(document);
      expect(found.map((violation) => violation.message).join("\n")).toMatch(
        /effective_to must be an end date/,
      );
      expect(found.some((violation) => violation.rule === "time-bound")).toBe(true);
    });

    it.each(Object.entries(OPEN_ENDED))("catches %s", (_label, statement) => {
      // Appended to the end of the document, outside any fence — the position,
      // the fence and the fence's tag are all irrelevant by construction.
      const found = violations(normaliseSql(`${runbook}\n\n${statement}\n`));
      expect(found.map((violation) => violation.message).join("\n")).toMatch(
        /effective_to must be an end date/,
      );
    });

    it.each([
      ["inside a blockquote", (sql: string) => `> ${sql}`],
      ["inside an HTML comment", (sql: string) => `<!--\n${sql}\n-->`],
      ["indented as a code block", (sql: string) => `    ${sql}`],
      ["in a fence tagged text", (sql: string) => "```text\n" + sql + "\n```"],
      ["in a fence tagged sql", (sql: string) => "```sql\n" + sql + "\n```"],
      ["outside any fence at all", (sql: string) => sql],
    ])("catches an open-ended grant %s", (_label, wrap) => {
      // The regression row. Fence tag, fence presence and position must all stay
      // irrelevant — this is the ground won in LAN-93's third review round.
      const statement = OPEN_ENDED["a new open-ended update"];
      const found = violations(normaliseSql(`${runbook}\n\n${wrap(statement)}\n`));
      expect(found.length, `an open-ended grant ${_label} was not caught`).toBeGreaterThan(0);
    });

    it("catches a grant of a constitutional office, and one asserting its own scope", () => {
      const office = violations(
        normaliseSql(
          `${runbook}\n\ninsert into role_assignments (person_id, role_id, scope, ` +
            "is_constitutional_office, committee_year_id, effective_from, effective_to, note) " +
            "select 'p', r.id, r.scope, r.is_constitutional_office, 'c', current_date, " +
            "date '2026-12-31', 'x' from public.roles r where r.code = 'president';\n",
        ),
      );
      expect(office.map((violation) => violation.message).join("\n")).toMatch(
        /a constitutional office is named/,
      );

      const asserted = violations(
        normaliseSql(
          `${runbook}\n\ninsert into role_assignments (person_id, role_id, scope, ` +
            "is_constitutional_office, committee_year_id, effective_from, effective_to, note) " +
            "values ('p', 'r', 'committee_year', true, 'c', current_date, date '2026-12-31', 'x');\n",
        ),
      );
      expect(asserted.map((violation) => violation.message).join("\n")).toMatch(
        /is_constitutional_office must be read from public\.roles/,
      );
    });

    it("refuses a write it cannot decompose, instead of ignoring it", () => {
      // A form the parser was never taught. It must shout, not vanish — this is
      // the property that stops the completeness check being satisfied by
      // construction ever again.
      for (const statement of [
        "merge into role_assignments using x on true when matched then update set effective_to = null;",
        "copy role_assignments from stdin;",
        "insert into role_assignments select * from staging;",
        "update role_assignments set (effective_to, note) = (null, 'x') where person_id = 'p';",
      ]) {
        expect(
          () => findWrites(normaliseSql(`${runbook}\n\n${statement}\n`)),
          `this check must object to: ${statement}`,
        ).toThrow(/role_assignments/);
      }
    });

    it("stays green on reads and on prose that merely names the table", () => {
      // The other half of row 2: too broad is a test that is red on a correct
      // document, which is how it gets weakened later.
      for (const harmless of [
        "select id, effective_to from public.role_assignments where person_id = 'p';",
        "select 1 from role_assignments ra join people p on p.id = ra.person_id;",
        "Access is `role_assignments`, and it is effective-dated.",
        "## What `role_assignments` records",
        "| Examples | `operator_accounts`, `role_assignments` |",
        "`cleanup.sql` also writes to `role_assignments` and is read by this scan.",
      ]) {
        const document = normaliseSql(`${runbook}\n\n${harmless}\n`);
        expect(violations(document), `must stay green: ${harmless}`).toEqual([]);
        expect(() => findWrites(document)).not.toThrow();
      }
    });
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

  it("deletes a retired scenario's executable suite and scripts in the same change", () => {
    const retired = manifest.split("## Retired scenarios")[1] ?? "";
    const issues = [...new Set([...retired.matchAll(/\bLAN-(\d+)\b/g)].map((match) => match[1]))];
    // The eleven slice scenarios, at least; a pass over an empty section is not a pass.
    expect(issues.length).toBeGreaterThanOrEqual(11);

    const tests = new Set(filesUnder("tests"));
    const pilot = filesUnder("scripts/pilot");
    const lingering = issues.flatMap((issue) => [
      ...(tests.has(`tests/pilot-scenario-lan-${issue}.test.ts`)
        ? [`tests/pilot-scenario-lan-${issue}.test.ts`]
        : []),
      ...pilot.filter((file) => file.startsWith(`scripts/pilot/lan-${issue}/`)),
    ]);
    expect(lingering, "retired scenarios whose suite or scripts remain").toEqual([]);
  });

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

  it("records the retired worked example, and that it was never applied to hosted", () => {
    const retired = manifest.split("## Retired scenarios")[1] ?? "";
    expect(retired).toMatch(/\|\s*`LAN-93`\s*\|\s*`scripts\/pilot\/lan-93\/`\s*\|\s*\*\*No\*\*/);
    expect(retired).toMatch(/None was ever applied to\s+hosted/);
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
    // The retirement is recorded, and the procedure is kept for future scenarios.
    expect(adr).toMatch(/## Amendment, 2026-09-26 — the LAN-74 … LAN-110 scenarios are retired/);
    expect(adr).toMatch(/remain the procedure\s+for any future scenario/);
  });
});
