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

  /** Every scenario's reserved block, for files that belong to no one scenario. */
  const ALL_SCENARIO_BLOCKS = filesUnder("scripts/pilot")
    .filter((file) => file.endsWith("cleanup.sql"))
    .map(scenarioBlock)
    .filter((block): block is RegExp => block !== null);

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
    expect(PUBLIC_SURFACE.length).toBeGreaterThanOrEqual(6);
    expect(PUBLIC_SURFACE).toContain(`${SCENARIO_DIR}/setup.sql`);
    expect(PUBLIC_SURFACE).toContain(`${SCENARIO_DIR}/cleanup.sql`);
  });

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

  it.each(PUBLIC_SURFACE)("%s contains no email address", (file) => {
    // Placeholders are angle-bracketed tokens, which cannot match this.
    expect(stripped(file)).not.toMatch(/[\w.%+-]+@[\w-]+\.[A-Za-z]{2,}/);
  });

  it.each(PUBLIC_SURFACE)("%s contains no identifier outside the scenario block", (file) => {
    expect(stripped(file).match(ANY_UUID) ?? []).toEqual([]);
  });

  it.each(PUBLIC_SURFACE)("%s contains no phone number or long digit run", (file) => {
    expect(stripped(file)).not.toMatch(/\+\d[\d\s()-]{9,}/);
    expect(stripped(file)).not.toMatch(/\b\d{7,}\b/);
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

  /**
   * Every pilot script in the repository, not just the worked example's.
   *
   * These rules were scoped to LAN-93 and were therefore asserted against one
   * scenario while claiming to be conventions. That mattered the moment
   * LAN-74's cleanup became the first pilot script to contain DDL at all
   * (`create temporary table`) — the exact construct "is not a migration in
   * disguise" exists to adjudicate, adjudicated by nothing.
   */
  const ALL_SCRIPTS: readonly (readonly [name: string, sql: string])[] = filesUnder("scripts/pilot")
    .filter((file) => file.endsWith(".sql"))
    .map((file) => [file.replace(/^scripts\/pilot\//, ""), read(file)] as const);

  it("covers every pilot script in the repository", () => {
    // A list that silently stops growing is the way this rule fails.
    expect(ALL_SCRIPTS.length).toBeGreaterThanOrEqual(6);
    for (const scenario of ["lan-93", "lan-76", "lan-74"]) {
      expect(ALL_SCRIPTS.map(([name]) => name)).toContain(`${scenario}/cleanup.sql`);
    }
  });

  it.each(ALL_SCRIPTS)("%s never writes to auth or storage", (_name, sql) => {
    expect(sql).not.toMatch(/\binsert\s+into\s+auth\./i);
    expect(sql).not.toMatch(/\bupdate\s+auth\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\s+auth\./i);
    expect(sql).not.toMatch(/\b(insert\s+into|update|delete\s+from)\s+storage\./i);
  });

  /**
   * A script reduced to its executable text: comments and string literals
   * replaced by whitespace, dollar-quoted **delimiters** blanked and their
   * bodies kept.
   *
   * ## READ THIS BEFORE TRUSTING ANYTHING BELOW
   *
   * This is a **fast pre-filter, not a security boundary.** It is a
   * hand-written approximation of PostgreSQL's lexer, and four consecutive
   * independent reviews defeated it — each through a different corner of SQL
   * it does not model, and each time the fix opened the next hole. Known gaps
   * that remain: double-quoted identifiers containing an apostrophe,
   * `U&'…'` strings, and anything `standard_conforming_strings` changes.
   *
   * **The authoritative check is elsewhere.** `tests/pilot-scenario-lan-74.test.ts`
   * § "what the scripts actually execute, according to PostgreSQL" installs
   * event triggers and watches the scripts run, so no spelling can hide a DDL,
   * a grant or a drop. Nothing may cite the rules below as evidence that a
   * pilot script is safe.
   *
   * What the rules below are still worth: they run without a database, they
   * catch the obvious mistake early, and they cover the three things event
   * triggers cannot see — `truncate`, role/database/tablespace statements, and
   * `copy … from program` — because PostgreSQL fires no event for those.
   *
   * ## Why this is a scanner and not three regular expressions
   *
   * It was three regular expressions, and they were wrong in a way that hid
   * real DDL. SQL comments in these files contain apostrophes — "the scenario's
   * own rows" — and a regex string-stripper cannot tell that apostrophe from
   * the start of a literal. `scripts/pilot/lan-76/setup.sql` has an **odd**
   * number of `'` characters for exactly that reason, so the stripper ran out
   * of phase over the whole file and swallowed everything after it. An injected
   * `create table` in that region vanished, and the rule below passed it.
   *
   * Order cannot fix that: whichever of comments and literals you strip first,
   * the other one's delimiters appear inside it. The only correct reading is
   * left to right, one state at a time — which is what this does, including
   * `''` escapes and `$tag$ … $tag$` bodies.
   *
   * Newlines are preserved so that line-oriented checks elsewhere still line up.
   */
  function statementsOnly(sql: string): string {
    let out = "";
    let i = 0;
    const dollarTags: string[] = [];

    const blank = (text: string) => text.replace(/[^\n]/g, " ");

    while (i < sql.length) {
      const rest = sql.slice(i);

      if (rest.startsWith("--")) {
        const end = sql.indexOf("\n", i);
        const stop = end === -1 ? sql.length : end;
        out += blank(sql.slice(i, stop));
        i = stop;
        continue;
      }

      if (rest.startsWith("/*")) {
        const end = sql.indexOf("*/", i + 2);
        const stop = end === -1 ? sql.length : end + 2;
        out += blank(sql.slice(i, stop));
        i = stop;
        continue;
      }

      // Closing FIRST. The opening pattern matches any `$tag$`, including the
      // one already open, so checking it first meant the closing branch was
      // never reached and the stack only ever grew — dead code that a reviewer
      // spotted and the fail-closed check above then proved.
      const closing = dollarTags[dollarTags.length - 1];
      if (closing && rest.startsWith(closing)) {
        out += blank(closing);
        i += closing.length;
        dollarTags.pop();
        continue;
      }

      // A dollar-quoted body is NOT a literal to be blanked. `do $x$ … $x$` is
      // PL/pgSQL that PostgreSQL executes, and PL/pgSQL runs DDL, `grant`,
      // `drop` and `alter` directly. Blanking it hid the only DDL statement in
      // any pilot script, and hid an injected `grant all on public.people to
      // anon` that a worse stripper had caught.
      //
      // So: blank the delimiters, keep scanning the contents.
      const dollar = /^\$([A-Za-z_]\w*)?\$/.exec(rest);
      if (dollar) {
        const tag = dollar[0];
        out += blank(tag);
        i += tag.length;
        dollarTags.push(tag);
        continue;
      }

      // `E'…'` uses backslash escapes, so `\'` does not close it. Without this
      // the scanner closes early and every subsequent literal is out of phase —
      // which is how the version this replaced blanked the rest of a file.
      const escapeString = /^[eE]'/.exec(rest);
      if (escapeString) {
        let j = i + 2;
        while (j < sql.length) {
          if (sql[j] === "\\") j += 2;
          else if (sql[j] === "'") {
            if (sql[j + 1] === "'") j += 2;
            else {
              j += 1;
              break;
            }
          } else j += 1;
        }
        out += blank(sql.slice(i, j));
        i = j;
        continue;
      }

      if (rest.startsWith("'")) {
        let j = i + 1;
        while (j < sql.length) {
          if (sql[j] === "'") {
            if (sql[j + 1] === "'") j += 2;
            else {
              j += 1;
              break;
            }
          } else j += 1;
        }
        out += blank(sql.slice(i, j));
        i = j;
        continue;
      }

      out += sql[i];
      i += 1;
    }

    // Fail closed. An unterminated literal, comment or dollar body means the
    // scan ran to end of file blanking everything, and a blanked file passes
    // every rule below. That must be an error, not a pass.
    if (dollarTags.length > 0) {
      throw new Error(
        `unterminated ${dollarTags[dollarTags.length - 1]} body — scan is unreliable`,
      );
    }

    return out;
  }

  /**
   * The same scan, but with dollar-quoted bodies blanked out as well.
   *
   * Exactly one rule needs this. `select … into <table> … from …` creates a
   * permanent table without the word `create` appearing, but the identical
   * syntax inside PL/pgSQL — `select count(*) into open_seasons from …` —
   * assigns to a variable, and is how every preflight here reads a count. The
   * distinction is positional and nothing else.
   *
   * Every other rule uses `statementsOnly`, which keeps body contents, because
   * PL/pgSQL runs real DDL and hiding it there is exactly what went wrong.
   */
  function withoutPreflightBodies(sql: string): string {
    // Re-scan the ORIGINAL text for the bodies, and blank those regions in the
    // stripped output, so the result is "top level, comments and literals gone".
    const code = statementsOnly(sql).split("");
    const tag = /\$([A-Za-z_]\w*)?\$/g;
    let match: RegExpExecArray | null;
    let open: number | null = null;
    let openTag = "";

    while ((match = tag.exec(sql)) !== null) {
      if (open === null) {
        open = match.index;
        openTag = match[0];
      } else if (match[0] === openTag) {
        for (let k = open; k < match.index + match[0].length; k += 1) {
          if (code[k] !== "\n") code[k] = " ";
        }
        open = null;
      }
    }

    return code.join("");
  }

  it("reads a script left to right, so nothing hides inside anything else", () => {
    // A `--` inside a literal must not eat the closing quote …
    expect(statementsOnly("select 'a -- b';\ncreate table public.evil (id int);")).toMatch(
      /create table public\.evil/i,
    );
    // … an apostrophe inside a comment must not open one …
    expect(
      statementsOnly("-- the scenario's own rows\ncreate table public.evil (id int);"),
    ).toMatch(/create table public\.evil/i);
    // … a quote inside a dollar-quoted body must not either …
    expect(
      statementsOnly(
        "do $x$ begin raise notice 'it''s fine'; end $x$;\ncreate view public.v as select 1;",
      ),
    ).toMatch(/create view public\.v/i);
    // … and genuine literals and comments are still removed.
    expect(statementsOnly("select 'create table public.nope (id int)';")).not.toMatch(
      /create table/i,
    );
    expect(statementsOnly("-- create table public.nope (id int)")).not.toMatch(/create table/i);
  });

  it("survives the real scripts without going out of phase", () => {
    // The specific failure this replaced: `lan-76/setup.sql` has an odd number
    // of `'` characters, because its comments contain apostrophes. A regex
    // stripper lost phase there and blanked the rest of the file.
    //
    // Length preservation is NOT the check. `blank()` swaps each character for
    // a space and the fallthrough appends one character, so equal length is
    // structurally guaranteed on every input — it cannot fail, and in
    // particular a total loss of phase does not change it. What proves phase is
    // that specific known text survives and specific known text does not.
    for (const [name, sql] of ALL_SCRIPTS) {
      const code = statementsOnly(sql);

      // Executable text at the very end of the file must still be there. A
      // scanner that lost phase anywhere earlier blanks everything after it.
      expect(code, `${name}: nothing survives to the end of the script`).toMatch(/commit\s*;\s*$/i);

      // Literal content must be gone — proving the scanner is doing its job at
      // all, not merely returning its input.
      expect(code, `${name}: string literals were not removed`).not.toMatch(/PILOT-LAN-\d+/);
    }
  });

  it("keeps the executable contents of a preflight body visible", () => {
    // The regression this exists to prevent: `do $x$ … $x$` was treated as a
    // literal and blanked, which hid every statement in every preflight —
    // including the one `create temporary table` in the repository, and any
    // `grant` or `drop` an edit put there.
    const cleanup = read("scripts/pilot/lan-74/cleanup.sql");
    const code = statementsOnly(cleanup);

    expect(code, "the preflight's own statements must be visible").toMatch(
      /create temporary table/i,
    );
    // …while the messages inside it are still removed.
    expect(code).not.toMatch(/pilot cleanup refused/i);
  });

  it.each(ALL_SCRIPTS)("%s is not a migration in disguise", (name, sql) => {
    // Permanent DDL is a migration's job. A TEMPORARY table is not — it lives
    // for the transaction, adds no schema concept, and LAN-74 uses one to hold
    // the set its preflight validated so the deletes cannot re-derive a wider
    // one. So the rule is: no permanent DDL, and a temp table must say so.
    const code = statementsOnly(sql);

    const DDL =
      "table|type|schema|index|view|function|procedure|policy|extension|sequence|trigger|role|" +
      "user|group|database|domain|aggregate|operator|rule|server|publication|subscription|" +
      "tablespace|collation|cast|statistics";

    // Modifiers may sit between `create` and the object keyword — `or replace`,
    // `unlogged`, `unique`, `materialized`, `recursive`. Matching only
    // `create <keyword>` let every one of them through, which injection
    // confirmed: `create or replace view`, `create unlogged table` and
    // `create unique index` were all invisible.
    //
    // `temporary`/`temp` is the one modifier that makes the statement legal, so
    // it is the only one that stops the match.
    const MODIFIERS =
      "(?:or\\s+replace|unlogged|unique|materialized|recursive|concurrently|foreign|global|local)";
    const permanentDdl = [
      ...code.matchAll(
        new RegExp(
          `\\bcreate\\s+(?!(?:temporary|temp)\\b)(?:${MODIFIERS}\\s+)*(?:${DDL})\\b`,
          "gi",
        ),
      ),
    ].map((match) => match[0].replace(/\s+/g, " "));
    expect(permanentDdl, `${name} creates a permanent database object`).toEqual([]);

    expect(code, `${name} alters a database object`).not.toMatch(
      new RegExp(`\\balter\\s+(?:${MODIFIERS}\\s+)*(?:${DDL})\\b`, "i"),
    );

    // Every `drop`, not just `drop table`: dropping a view, a function or a
    // policy is as much a schema change as dropping a table. The one permitted
    // form is a temporary relation this script created itself, and it must be
    // `pg_temp.`-qualified so it cannot reach a permanent object through
    // `search_path`.
    for (const drop of [
      ...code.matchAll(
        new RegExp(
          `\\bdrop\\s+(?:${MODIFIERS}\\s+)*(${DDL})\\s+(?:if\\s+exists\\s+)?([\\w.]+)`,
          "gi",
        ),
      ),
    ]) {
      expect(
        `${drop[1]} ${drop[2]}`,
        `${name} drops "${drop[2]}", which is not a pg_temp relation`,
      ).toMatch(/^table pg_temp\./i);
    }

    expect(code, `${name} grants or revokes`).not.toMatch(/\b(grant|revoke)\b/i);

    // The three classes PostgreSQL fires NO event trigger for, so this textual
    // rule is their only cover anywhere in the repository. Probed and
    // confirmed: `truncate` raised no event, and shared objects — roles,
    // databases, tablespaces — are documented as exempt.
    expect(code, `${name} executes COPY … FROM/TO PROGRAM`).not.toMatch(
      /\bcopy\b[\s\S]{0,200}?\bprogram\b/i,
    );
    expect(code, `${name} changes a role, database or tablespace`).not.toMatch(
      /\b(create|alter|drop)\s+(role|user|group|database|tablespace)\b/i,
    );
    expect(code, `${name} changes cluster configuration`).not.toMatch(/\balter\s+system\b/i);

    // `truncate` is not DDL, and is the single most destructive statement a
    // hand-run production script could contain. It has no undo and, until this
    // line, no test in the repository mentioned it.
    expect(code, `${name} truncates a table`).not.toMatch(/\btruncate\b/i);

    // `select … into <table>` creates a permanent table without the word
    // `create` appearing anywhere. Checked at TOP LEVEL only: the same syntax
    // inside a PL/pgSQL body assigns to a variable, which every preflight here
    // does to read a count.
    expect(withoutPreflightBodies(sql), `${name} creates a table via SELECT INTO`).not.toMatch(
      /\binto\s+(?!strict\b)[\w.]+\s+from\b/i,
    );

    // `drop owned by` / `reassign owned by` change role ownership wholesale.
    expect(code, `${name} changes role ownership`).not.toMatch(/\b(drop|reassign)\s+owned\s+by\b/i);
  });

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

  /**
   * The second legitimate ownership shape, pinned scenario by scenario.
   *
   * A scenario whose rows are created by the **application** — a human pressing
   * Save in the deployed product — has no deterministic key to delete by,
   * because PostgreSQL generates it at insert time. LAN-76 is the first such
   * scenario, and the owner's locked handoff on that issue directs exactly this
   * shape: an assertion-only setup, and a cleanup keyed on the sentinel.
   *
   * It is pinned here the same way `EXPECTED_DELETES` pins the worked example —
   * the table, and the exact conjuncts, written out — rather than described by
   * a rule the assertion then tries to recognise. The first draft of this test
   * did the latter, requiring only "the sentinel plus one further conjunct",
   * and independent review demonstrated two ways through it: LAN-76's status
   * restriction could be replaced with `created_at is not null` and the test
   * stayed green, and a new scenario could delete from `public.people` by
   * sentinel and `id is not null`. A predicate cannot be told from a *narrowing*
   * predicate by pattern-matching, so the predicate itself is the contract.
   *
   * Adding a scenario here is therefore a deliberate line in a diff, naming the
   * table it may delete from and every condition it may delete by. That is the
   * point: relaxing the runbook's ownership marker is Brian's decision, and
   * this list is where each such decision is recorded.
   */
  const SENTINEL_ONLY_DELETES: Readonly<
    Record<string, readonly (readonly [table: string, conjuncts: readonly string[]])[]>
  > = {
    // LAN-74's returner intake. Its setup script writes eight rows with
    // deterministic identifiers; these five statements remove what the
    // APPLICATION writes — the returner a tester enters through the form, and
    // the membership they create by selecting an existing candidate. Neither
    // has an identifier any script can know.
    //
    // The sentinel is matched against `known_as` OR `family_name` because two
    // kinds of row carry it: setup.sql puts it in `known_as` (person …0001 is
    // deliberately first-name-only and has no surname to use), and the intake
    // form puts it in `family_name`, which is the field it has. Pinned by value
    // here, so widening it to a third column is a line in a diff.
    "lan-74": [
      [
        "public.season_membership_status_events",
        [
          "season_membership_id in (select id from public.season_memberships where person_id in (select person_id from pilot_lan_74_targets))",
          "season_membership_id in (select id from public.season_memberships where person_id in (select id from public.people where 'PILOT-LAN-74' in (upper(btrim(known_as)), upper(btrim(family_name)))))",
        ],
      ],
      [
        "public.season_memberships",
        [
          "person_id in (select person_id from pilot_lan_74_targets)",
          "person_id in (select id from public.people where 'PILOT-LAN-74' in (upper(btrim(known_as)), upper(btrim(family_name))))",
        ],
      ],
      [
        "public.contact_points",
        [
          "person_id in (select person_id from pilot_lan_74_targets)",
          "person_id in (select id from public.people where 'PILOT-LAN-74' in (upper(btrim(known_as)), upper(btrim(family_name))))",
        ],
      ],
      [
        "public.person_aliases",
        [
          "person_id in (select person_id from pilot_lan_74_targets)",
          "person_id in (select id from public.people where 'PILOT-LAN-74' in (upper(btrim(known_as)), upper(btrim(family_name))))",
        ],
      ],
      [
        "public.people",
        [
          "id in (select person_id from pilot_lan_74_targets)",
          "'PILOT-LAN-74' in (upper(btrim(known_as)), upper(btrim(family_name)))",
        ],
      ],
    ],
    "lan-76": [
      [
        "public.events",
        ["name like '%PILOT-LAN-76%'", "status in ('draft', 'pending_approval', 'withdrawn')"],
      ],
    ],
    // LAN-75's roster and activation scenario. Its setup script writes nine
    // rows with deterministic identifiers, and these six statements remove the
    // rows that have no identifier any script can know: the returner a tester
    // enters through the form, everything hanging off a sentinel-carrying
    // person, and the onboarding items the APPLICATION generates from this
    // scenario's item types.
    //
    // The `onboarding_items` entry is the one that is not keyed on a person,
    // and it is deliberate. `onboarding_item_types` belongs to a season, so
    // while the scenario is installed every membership the application confirms
    // receives its three items — including memberships that are not scenario
    // data. Those rows are pilot rows wherever they landed, so the delete is
    // keyed on the item TYPE: the scenario's own three identifiers, conjoined
    // with the sentinel on the type's label. The memberships they hung off are
    // untouched, which `tests/pilot-scenario-lan-75.test.ts` proves with a
    // whole-database digest.
    //
    // The sentinel is matched against `known_as` OR `family_name` for the same
    // reason as LAN-74: setup.sql puts it in `known_as`, and the intake form
    // puts it in `family_name`, which is the only name field it has. Written as
    // an `in (…)` rather than a disjunction so the predicate cannot widen.
    "lan-75": [
      [
        "public.onboarding_items",
        [
          "item_type_id in (select id from public.onboarding_item_types where id in ('00750075-0075-4075-8075-000000000001', '00750075-0075-4075-8075-000000000002', '00750075-0075-4075-8075-000000000003'))",
          "item_type_id in (select id from public.onboarding_item_types where label like '%PILOT-LAN-75%')",
        ],
      ],
      // The second onboarding-items delete: every OTHER item on a membership
      // this scenario is about to remove entirely. `generateOnboardingItems`
      // inserts one row per item type configured on the season, not just this
      // scenario's three, so a returner created through the interface carries
      // the club's items too — and without this the membership delete aborts on
      // `onboarding_items_membership_season`. Scoped to the target memberships,
      // so it cannot reach an item belonging to anybody not already being
      // removed whole.
      [
        "public.onboarding_items",
        [
          "season_membership_id in (select id from public.season_memberships where person_id in (select person_id from pilot_lan_75_targets))",
          "season_membership_id in (select id from public.season_memberships where person_id in (select id from public.people where 'PILOT-LAN-75' in (upper(btrim(known_as)), upper(btrim(family_name)))))",
        ],
      ],
      [
        "public.season_membership_status_events",
        [
          "season_membership_id in (select id from public.season_memberships where person_id in (select person_id from pilot_lan_75_targets))",
          "season_membership_id in (select id from public.season_memberships where person_id in (select id from public.people where 'PILOT-LAN-75' in (upper(btrim(known_as)), upper(btrim(family_name)))))",
        ],
      ],
      [
        "public.season_memberships",
        [
          "person_id in (select person_id from pilot_lan_75_targets)",
          "person_id in (select id from public.people where 'PILOT-LAN-75' in (upper(btrim(known_as)), upper(btrim(family_name))))",
        ],
      ],
      [
        "public.contact_points",
        [
          "person_id in (select person_id from pilot_lan_75_targets)",
          "person_id in (select id from public.people where 'PILOT-LAN-75' in (upper(btrim(known_as)), upper(btrim(family_name))))",
        ],
      ],
      [
        "public.person_aliases",
        [
          "person_id in (select person_id from pilot_lan_75_targets)",
          "person_id in (select id from public.people where 'PILOT-LAN-75' in (upper(btrim(known_as)), upper(btrim(family_name))))",
        ],
      ],
      [
        "public.people",
        [
          "id in (select person_id from pilot_lan_75_targets)",
          "'PILOT-LAN-75' in (upper(btrim(known_as)), upper(btrim(family_name)))",
        ],
      ],
    ],
  };

  /** The heading a scenario must carry to use the shape at all. */
  const SENTINEL_ONLY_HEADING = "## Ownership marker: sentinel only";

  it("holds every pilot scenario to that shape, not just this one", () => {
    // Written generically because the runbook says this scenario is meant to be
    // copied: a future `scripts/pilot/<issue>/cleanup.sql` inherits the rule.
    const cleanups = filesUnder("scripts/pilot").filter((file) => file.endsWith("cleanup.sql"));
    expect(cleanups.length).toBeGreaterThanOrEqual(1);

    for (const file of cleanups) {
      const scenario = path.basename(path.dirname(file));
      const sentinel = new RegExp(`PILOT-${scenario}`, "i");
      const pinned = SENTINEL_ONLY_DELETES[scenario];
      const usedPins = new Set<string>();

      for (const statement of parseDeletes(read(file))) {
        expect(statement.where, `${file}: ${statement.table}`).not.toMatch(/\bor\b/i);
        expect(statement.conjuncts.length, `${file}: ${statement.table}`).toBeGreaterThanOrEqual(2);

        const keyed = statement.conjuncts.some((part) => /^id = '[0-9a-f-]{36}'$/i.test(part));

        if (!keyed) {
          // Two independent permissions, and both are required. The list above
          // says which table and which conditions; the scenario's own README
          // says it knows it is using the shape. Either one alone would be a
          // way in — the list without the heading hides the relaxation from
          // whoever reads the scenario, and the heading without the list is the
          // pattern-match that review got through twice.
          expect(
            pinned,
            `${file}: ${statement.table} is not keyed on a deterministic id, and ${scenario} ` +
              `has no entry in SENTINEL_ONLY_DELETES. Adding one is an owner decision.`,
          ).toBeDefined();
          expect(
            read(`scripts/pilot/${scenario}/README.md`),
            `scripts/pilot/${scenario}/README.md does not declare the sentinel-only shape`,
          ).toContain(SENTINEL_ONLY_HEADING);

          // Every pinned predicate for this table, not just the first.
          //
          // A scenario may legitimately need two deletes against one table with
          // different predicates — LAN-75 removes onboarding items twice, once
          // by item type (which reaches memberships that are not scenario data)
          // and once by target membership (which reaches items of types that
          // are not the scenario's). `find` matched only the first entry, so
          // the second statement could never be pinned at all.
          //
          // This is not a relaxation: the statement must still equal one of the
          // pinned predicate sets **exactly**, and `usedPins` below requires
          // every pinned entry to be matched by a real statement, so an unused
          // entry cannot sit here quietly permitting something.
          const candidates = (pinned ?? []).filter(([table]) => table === statement.table);
          expect(
            candidates.length,
            `${file}: ${statement.table} is not a table ${scenario} may delete from`,
          ).toBeGreaterThan(0);

          const matchIndex = candidates.findIndex(
            ([, conjuncts]) =>
              conjuncts.length === statement.conjuncts.length &&
              conjuncts.every((part, at) => part === statement.conjuncts[at]),
          );
          expect(
            matchIndex,
            `${file}: ${statement.table}: unexpected delete predicate\n` +
              `  got:      ${JSON.stringify(statement.conjuncts, null, 2)}\n` +
              `  pinned:   ${JSON.stringify(
                candidates.map(([, c]) => c),
                null,
                2,
              )}`,
          ).toBeGreaterThanOrEqual(0);
          usedPins.add(`${statement.table}#${matchIndex}`);

          // And the pinned predicate itself still has to prove ownership, so a
          // future edit to the list cannot quietly drop the sentinel half.
          expect(
            statement.conjuncts.filter((part) => sentinel.test(part)).length,
            `${file}: ${statement.table} must be qualified by the ${scenario} sentinel`,
          ).toBe(1);
          continue;
        }

        // … and the rest prove ownership, by the sentinel or by the scenario's
        // own parent identifiers.
        const ownership = statement.conjuncts.filter((part) => !/^id = /i.test(part));
        expect(
          ownership.every((part) => sentinel.test(part) || /'[0-9a-f-]{36}'/i.test(part)),
          `${file}: ${statement.table} has a conjunct that proves nothing`,
        ).toBe(true);
      }

      // Every pinned predicate must be used by a real statement. Without this,
      // allowing more than one entry per table would let a stale or speculative
      // predicate sit in the list permitting a delete nothing performs — which
      // is exactly the "a stale entry is worse than none" failure the next test
      // guards against at scenario granularity, one level finer.
      for (const [index, [table]] of (pinned ?? []).entries()) {
        const key = `${table}#${(pinned ?? [])
          .filter(([each]) => each === table)
          .findIndex((entry) => entry === (pinned ?? [])[index])}`;
        expect(
          usedPins.has(key),
          `${scenario}: the pinned ${table} predicate at index ${index} matches no delete in ${file}`,
        ).toBe(true);
      }
    }
  });

  it("pins no scenario that does not exist, and none that is keyed anyway", () => {
    // A stale entry is worse than none: it would sit here permitting a
    // sentinel-only delete for a scenario that has since been rewritten, or
    // removed, and nothing would say so.
    for (const scenario of Object.keys(SENTINEL_ONLY_DELETES)) {
      const cleanup = `scripts/pilot/${scenario}/cleanup.sql`;
      expect(filesUnder("scripts/pilot"), `${scenario} is pinned but has no cleanup`).toContain(
        cleanup,
      );
      expect(read(`scripts/pilot/${scenario}/README.md`)).toContain(SENTINEL_ONLY_HEADING);

      const unkeyed = parseDeletes(read(cleanup)).filter(
        (statement) => !statement.conjuncts.some((part) => /^id = '[0-9a-f-]{36}'$/i.test(part)),
      );
      expect(
        unkeyed.length,
        `${scenario} is pinned for the sentinel-only shape but every delete is keyed`,
      ).toBeGreaterThanOrEqual(1);
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

  /**
   * Every preflight in the repository, and the smallest number of guard blocks
   * it is allowed to shrink to.
   *
   * Enumerated rather than hard-coded to the worked example: the runbook says a
   * scenario is meant to be copied, and a copy whose preflight was gutted would
   * otherwise be checked by nothing. The minimum is per file because these
   * scripts are not the same size — LAN-93 creates six rows and guards each of
   * them; LAN-76 writes nothing and guards the state of the database it is
   * about to be tested against. Lowering one of these numbers is the change a
   * reviewer has to see.
   */
  const PREFLIGHTS = [
    ["lan-93/setup.sql", setup, 10] as const,
    ["lan-93/cleanup.sql", cleanup, 17] as const,
    ["lan-76/setup.sql", read("scripts/pilot/lan-76/setup.sql"), 5] as const,
    ["lan-76/cleanup.sql", read("scripts/pilot/lan-76/cleanup.sql"), 6] as const,
    ["lan-74/setup.sql", read("scripts/pilot/lan-74/setup.sql"), 10] as const,
    ["lan-74/cleanup.sql", read("scripts/pilot/lan-74/cleanup.sql"), 14] as const,
    ["lan-75/setup.sql", read("scripts/pilot/lan-75/setup.sql"), 9] as const,
    ["lan-75/cleanup.sql", read("scripts/pilot/lan-75/cleanup.sql"), 12] as const,
  ];

  it("checks the preflight of every scenario in the repository", () => {
    const scenarios = new Set(
      filesUnder("scripts/pilot")
        .filter((file) => file.endsWith(".sql"))
        .map((file) => file.replace(/^scripts\/pilot\//, "")),
    );

    expect(new Set(PREFLIGHTS.map(([name]) => name))).toEqual(scenarios);
  });

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
    /** Column name → the expression assigned to it, in statement order. */
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

  /** What a write may be wrong about. Two categories, one per surviving rule. */
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
   * scanned too, README and SQL alike: `cleanup.sql` already touches
   * `role_assignments` (reads only, today) and was previously outside the scan
   * entirely, which the issue calls out. Enumerating the directory rather than
   * the files means a future `scripts/pilot/<issue>/` is scanned the moment it
   * is added, with nobody having to remember this list exists.
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
    expect(GRANT_SCAN).toContain("scripts/pilot/lan-93/README.md");
    expect(GRANT_SCAN).toContain("scripts/pilot/lan-93/cleanup.sql");

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

  it("cannot be satisfied by a statement it failed to recognise", () => {
    /**
     * The self-check, made non-self-referential (matrix row 2).
     *
     * The old version counted candidates with `/insert\s+into\s+public\.role_
     * assignments/` and parsed with the same expression, so "some grant was
     * never parsed" was true by construction for every statement the expression
     * could not see. Here the count comes from a pattern that recognises verbs
     * the parser deliberately cannot decompose, and the parser throws rather
     * than skipping — so the two can only disagree loudly.
     *
     * The second half is the honest limit and where the tension sits: a write
     * whose verb is not adjacent to the table would be missed by the finder
     * too. So every *mention* of the identifier that is not inside a found
     * statement is checked for a writing verb close in front of it. That is
     * deliberately conservative — it will also fire on prose that puts "insert"
     * within thirty characters of the table name, and the answer to that is to
     * reword the sentence or widen the finder, never to loosen this. Prose that
     * merely names the table, a heading, a column reference and
     * `select … from role_assignments` all stay green, which is the other half
     * of the requirement.
     */
    const MENTION = /\brole_assignments\b/gi;
    const WRITING_VERB_JUST_BEFORE = /\b(insert|update|merge|upsert|copy|truncate)\b[^;]{0,30}$/i;

    for (const file of GRANT_SCAN) {
      const normalised = normaliseSql(read(file));
      const statements = candidateStatements(normalised);

      expect(() => statements.map((candidate) => parseWrite(candidate.text))).not.toThrow();

      for (const mention of normalised.matchAll(MENTION)) {
        const inside = statements.some(
          (candidate) =>
            mention.index >= candidate.index &&
            mention.index < candidate.index + candidate.text.length,
        );
        if (inside) continue;

        const before = normalised.slice(Math.max(0, mention.index - 40), mention.index);
        expect(
          before,
          `${file}: a mention of role_assignments has a writing verb in front of it but was not parsed as a statement — widen the finder rather than the tolerance. Context: "${before}"`,
        ).not.toMatch(WRITING_VERB_JUST_BEFORE);
      }
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
