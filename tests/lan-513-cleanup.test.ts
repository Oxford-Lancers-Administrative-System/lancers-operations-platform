// @vitest-environment node
/**
 * LAN-513 — the one-time college and degree cleanup Brian runs against hosted
 * (`scripts/pilot/lan-513/`), proved against the local database with
 * synthetic people holding the kinds of free text the club's records carry.
 *
 * The review sheet must map only what is certain, mark an inference as one,
 * and leave the rest for a person; the update must write exactly the approved
 * rows, refuse the whole run on anything unexpected, and be a dry run unless
 * its last line is changed. Both scripts carry LAN-512's lists, and this file
 * keeps them equal to the application's own.
 *
 * Every case runs inside a transaction that is rolled back; each script's own
 * `begin;` and closing `rollback;` are stripped so it runs inside it.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openLocalClient, type Client } from "./helpers/domain-fixture";
import {
  DEGREE_LETTER_ENTRIES,
  OXFORD_COLLEGES,
  OXFORD_EXTERNAL_COLLEGES,
  OXFORD_PERMANENT_PRIVATE_HALLS,
  SUBJECTS_BY_LETTERS,
} from "@/lib/services/oxford-academic-data";

const root = resolve(import.meta.dirname, "..");
const DIRECTORY = join(root, "scripts", "pilot", "lan-513");
const REVIEW = readFileSync(join(DIRECTORY, "review-sheet.sql"), "utf8");
const APPLY = readFileSync(join(DIRECTORY, "apply-approved.sql"), "utf8");

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.DATABASE_URL);
if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but the local database is not configured.");
}

const MARKER = "LAN513Fixture";

/** The SQL string literal a value is written as in the lists. */
function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function listBlock(sql: string): string {
  const start = sql.indexOf("-- BEGIN LISTS");
  const end = sql.indexOf("-- END LISTS");
  return sql.slice(start, end);
}

/** The values inserted into one list table, in order, as their SQL text. */
function insertedRows(block: string, table: string): string[] {
  const match = new RegExp(`insert into ${table} \\([^)]*\\) values\\n([\\s\\S]*?);\\n`).exec(
    block,
  );
  if (!match) throw new Error(`no insert into ${table}`);
  return match[1].split(",\n").map((row) => row.trim());
}

function withoutOuterTransaction(sql: string): string {
  const lines = sql.split("\n");
  const begin = lines.findIndex((line) => line.trim() === "begin;");
  let end = -1;
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    if (lines[at].trim() === "rollback;" || lines[at].trim() === "commit;") {
      end = at;
      break;
    }
  }
  return lines.filter((_, at) => at !== begin && at !== end).join("\n");
}

describe("the LAN-513 scripts carry LAN-512's lists, exactly", () => {
  for (const [name, sql] of [
    ["review-sheet.sql", REVIEW],
    ["apply-approved.sql", APPLY],
  ] as const) {
    it(`${name}: colleges, letters and subjects match oxford-academic-data.ts`, () => {
      const block = listBlock(sql);
      expect(insertedRows(block, "lan513_colleges")).toEqual(
        [...OXFORD_COLLEGES, ...OXFORD_PERMANENT_PRIVATE_HALLS, ...OXFORD_EXTERNAL_COLLEGES].map(
          (college) => `(${literal(college)})`,
        ),
      );
      expect(insertedRows(block, "lan513_letters")).toEqual(
        DEGREE_LETTER_ENTRIES.map(([letters]) => `(${literal(letters)})`),
      );
      expect(insertedRows(block, "lan513_subjects")).toEqual(
        DEGREE_LETTER_ENTRIES.flatMap(([letters]) =>
          SUBJECTS_BY_LETTERS[letters].map(
            (subject) => `(${literal(letters)}, ${literal(subject)})`,
          ),
        ),
      );
    });
  }

  it("leaves out the ambiguous informal names the research flagged", () => {
    const variants = insertedRows(listBlock(REVIEW), "lan513_college_variants").join("\n");
    for (const ambiguous of ["'CCC'", "'UC'", "'SJC'", "'Manchester'", "'Magdalene'"]) {
      expect(variants).not.toContain(`(${ambiguous},`);
    }
  });

  it("is a dry run unless its last line is changed", () => {
    const statements = APPLY.split("\n").filter(
      (line) => line.trim() !== "" && !line.trim().startsWith("--"),
    );
    expect(statements[0]).toBe("begin;");
    expect(statements.at(-1)).toBe("rollback;");
    const review = REVIEW.split("\n").filter(
      (line) => line.trim() !== "" && !line.trim().startsWith("--"),
    );
    expect(review.at(-1)).toBe("rollback;");
    const code = REVIEW.split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(code).not.toMatch(/\b(update|delete from|insert into public)\b/i);
  });
});

interface SheetRow {
  person_id: string;
  name: string;
  current_college: string | null;
  current_degree: string | null;
  current_subject: string | null;
  proposed_college: string | null;
  proposed_degree: string | null;
  proposed_subject: string | null;
  confidence: string;
  approved_line: string | null;
}

describe.runIf(configured)("the LAN-513 cleanup, against the local database", () => {
  let client: Client;

  beforeAll(async () => {
    client = await openLocalClient();
  });

  beforeEach(async () => {
    await client.query("begin");
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  afterAll(async () => {
    await client?.end();
  });

  async function person(
    tag: string,
    values: { college?: string; degreeType?: string; degreeField?: string },
  ): Promise<string> {
    const inserted = await client.query<{ id: string }>(
      `insert into public.people (given_name, family_name, college, degree_type, degree_field)
       values ($1, $2, $3, $4, $5) returning id`,
      [MARKER, tag, values.college ?? null, values.degreeType ?? null, values.degreeField ?? null],
    );
    return inserted.rows[0].id;
  }

  /** The sheet, run as Brian would run it, inside a savepoint so its temporary tables go. */
  async function sheet(): Promise<Map<string, SheetRow>> {
    await client.query("savepoint lan513_review");
    const results = (await client.query(withoutOuterTransaction(REVIEW))) as unknown as {
      rows: SheetRow[];
    }[];
    await client.query("rollback to savepoint lan513_review");
    const rows = results.at(-1)!.rows;
    return new Map(rows.map((row) => [row.person_id, row]));
  }

  async function apply(lines: string[]): Promise<{ rows: Record<string, unknown>[] }[]> {
    const sql = withoutOuterTransaction(APPLY).replace(
      "-- BEGIN APPROVED\n-- END APPROVED",
      lines.join("\n").replace(/,$/, ""),
    );
    return (await client.query(sql)) as unknown as { rows: Record<string, unknown>[] }[];
  }

  async function onFile(id: string) {
    const row = await client.query<{
      college: string | null;
      degree_type: string | null;
      degree_field: string | null;
    }>("select college, degree_type, degree_field from public.people where id = $1", [id]);
    return row.rows[0];
  }

  it("maps what is certain, marks an inference, and leaves the rest for a person", async () => {
    const catz = await person("catz", { college: "St. Catz", degreeField: "BA Geography" });
    const christChurch = await person("cc", {
      college: "Christ church",
      degreeType: "msc",
      degreeField: "MSc in Education (Higher Education)",
    });
    const research = await person("research", {
      college: "keble",
      degreeType: "MSc by Research",
      degreeField: "Biology",
    });
    const inferred = await person("inferred", { college: "LMH", degreeField: "human sciences" });
    const ambiguous = await person("ambiguous", { college: "CCC", degreeField: "Biochemistry" });
    const clean = await person("clean", {
      college: "Balliol College",
      degreeType: "DPhil",
      degreeField: "Fusion Power (EPSRC CDT)",
    });

    const rows = await sheet();

    expect(rows.get(catz)).toMatchObject({
      proposed_college: "St Catherine's College",
      proposed_degree: "BA",
      proposed_subject: "Geography",
      confidence: "certain",
    });
    expect(rows.get(christChurch)).toMatchObject({
      proposed_college: "Christ Church",
      proposed_degree: "MSc",
      proposed_subject: "Education (Higher Education)",
      confidence: "certain",
    });
    expect(rows.get(research)).toMatchObject({
      proposed_college: "Keble College",
      proposed_degree: "MSc",
      proposed_subject: "Biology",
      confidence: "certain",
    });
    expect(rows.get(inferred)).toMatchObject({
      proposed_college: "Lady Margaret Hall",
      proposed_degree: "BA",
      proposed_subject: "Human Sciences",
      confidence: "likely - confirm",
    });
    // CCC could be Christ Church or Corpus; Biochemistry is offered with several letters.
    expect(rows.get(ambiguous)).toMatchObject({
      proposed_college: "CCC",
      proposed_degree: null,
      proposed_subject: "Biochemistry",
      confidence: "fix by hand",
    });
    expect(rows.get(clean)).toMatchObject({ confidence: "no change", approved_line: null });
    expect(rows.get(catz)?.approved_line).toBe(
      `('${catz}', 'St. Catz', NULL, 'BA Geography', 'St Catherine''s College', 'BA', 'Geography'),`,
    );

    // The sheet wrote nothing.
    expect(await onFile(catz)).toEqual({
      college: "St. Catz",
      degree_type: null,
      degree_field: "BA Geography",
    });
  });

  it("writes exactly the approved rows, with an audit row per column changed", async () => {
    const approved = await person("approved", { college: "St. Catz", degreeField: "BA Geography" });
    const notApproved = await person("not-approved", { college: "Univ" });
    const corrected = await person("corrected", { college: "LMH", degreeField: "Human Sciences" });

    const rows = await sheet();
    // Stewart confirms the first, corrects the third's subject, says nothing of the second.
    const lines = [
      rows.get(approved)!.approved_line!,
      rows
        .get(corrected)!
        .approved_line!.replace("'BA', 'Human Sciences')", "'BA', 'History and Economics')"),
    ];
    const results = await apply(lines);

    expect(await onFile(approved)).toEqual({
      college: "St Catherine's College",
      degree_type: "BA",
      degree_field: "Geography",
    });
    expect(await onFile(corrected)).toEqual({
      college: "Lady Margaret Hall",
      degree_type: "BA",
      degree_field: "History and Economics",
    });
    expect((await onFile(notApproved)).college).toBe("Univ");

    const audit = await client.query<{ action: string; from_state: string; to_state: string }>(
      `select action, from_state, to_state from public.audit_events
        where entity_table = 'people' and entity_id = $1 order by action`,
      [approved],
    );
    expect(audit.rows).toEqual([
      {
        action: "person_college_updated",
        from_state: "St. Catz",
        to_state: "St Catherine's College",
      },
      { action: "person_degree_field_updated", from_state: "BA Geography", to_state: "Geography" },
      { action: "person_degree_type_updated", from_state: null, to_state: "BA" },
    ]);
    const verification = results.at(-1)!.rows[0];
    expect(verification).toMatchObject({ people_changed: "2", not_as_approved: "0" });
  });

  it("refuses the whole run, writing nothing, when anything is unexpected", async () => {
    const one = await person("one", { college: "St. Catz" });
    const two = await person("two", { college: "Univ" });
    const merged = await person("merged", { college: "Christ church" });
    const survivor = await person("survivor", {});
    const erased = await person("erased", { college: "LMH", degreeType: "msc" });
    const rows = await sheet();
    const good = rows.get(one)!.approved_line!;
    const mergedLine = rows.get(merged)!.approved_line!;
    const erasedLine = rows.get(erased)!.approved_line!;

    // Merged into another record since the sheet was taken.
    await client.query(
      `update public.people
          set merged_into_person_id = $2, merged_at = now(), merged_by_person_id = $2,
              merge_reason = 'LAN-513 test duplicate'
        where id = $1`,
      [merged, survivor],
    );
    // Erased at their own request since the sheet was taken. The tombstone also
    // reads as changed; the erased reason is the one asserted.
    await client.query(
      `update public.people
          set family_name = null, college = null, degree_type = null, erased_at = now()
        where id = $1`,
      [erased],
    );
    await client.query("savepoint attempt");
    await expect(apply([good, mergedLine])).rejects.toThrow(
      new RegExp(`${merged}: no such person, or merged or erased since the sheet`),
    );
    await client.query("rollback to savepoint attempt");
    await expect(apply([good, erasedLine])).rejects.toThrow(
      new RegExp(`${erased}: no such person, or merged or erased since the sheet`),
    );
    await client.query("rollback to savepoint attempt");

    // The same person twice, so which line wins would be an accident.
    await expect(apply([good, good])).rejects.toThrow(new RegExp(`${one}: listed twice`));
    await client.query("rollback to savepoint attempt");
    expect(await onFile(merged)).toMatchObject({ college: "Christ church" });
    expect(await onFile(erased)).toEqual({ college: null, degree_type: null, degree_field: null });

    // Changed on the record since the sheet was taken.
    await client.query("update public.people set college = 'Wadham' where id = $1", [two]);
    await client.query("savepoint attempt");
    await expect(apply([good, rows.get(two)!.approved_line!])).rejects.toThrow(
      /changed since the sheet was taken/,
    );
    await client.query("rollback to savepoint attempt");

    // A value not on the lists.
    await expect(
      apply([good.replace("'St Catherine''s College'", "'St Catherines Collage'")]),
    ).rejects.toThrow(/is not on the list/);
    await client.query("rollback to savepoint attempt");
    expect((await onFile(one)).college).toBe("St. Catz");
  });
});
