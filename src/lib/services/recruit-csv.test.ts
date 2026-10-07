/**
 * The recruit import's pure half — LAN-487. What a row's own shape means,
 * without a server; the database half is `./recruit-import.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { parseCsv } from "./csv";
import {
  OPT_IN_HEADER,
  RECRUIT_IMPORT_COLUMNS,
  readOptIn,
  readRecruitImport,
  recruitImportTemplateCsv,
  refuseOversizedRecruitFile,
} from "./recruit-csv";
import { RECRUITMENT_ADD_OPT_IN_OPTIONS } from "./recruitment-vocabulary";

const HEADER = "first_name,last_name,mobile,college_email,personal_email,opt_in,opt_in_note";

function file(...rows: string[]): string {
  return [HEADER, ...rows].join("\r\n") + "\r\n";
}

function rowsOf(csvText: string) {
  const read = readRecruitImport({ csvText });
  if (!read.ok) throw new Error(read.reason);
  return read.read.rows;
}

describe("the template", () => {
  it("is the hand-add's fields, and its opt_in header documents every key and label", () => {
    const parsed = parseCsv(recruitImportTemplateCsv());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const header = parsed.rows[0];
    expect(header).toHaveLength(RECRUIT_IMPORT_COLUMNS.length);
    expect(header.slice(0, 3)).toEqual(["first_name", "last_name", "mobile"]);
    expect(header).toContain(OPT_IN_HEADER);
    for (const option of RECRUITMENT_ADD_OPT_IN_OPTIONS) {
      expect(OPT_IN_HEADER).toContain(option.value);
      expect(OPT_IN_HEADER).toContain(option.label);
    }
  });

  it("reads back as a header the importer recognises", () => {
    const csvText = recruitImportTemplateCsv() + "Synthia,Testcase,07700900001" + ",".repeat(15);
    const rows = rowsOf(csvText);
    expect(rows).toHaveLength(1);
    expect(rows[0].reasons).toEqual([]);
  });
});

describe("the opt-in cell", () => {
  it("takes the key or the full label, ignoring case, and blank", () => {
    expect(readOptIn("gave_it")).toBe("gave_it");
    expect(readOptIn("  PASSED_ON ")).toBe("passed_on");
    expect(readOptIn("they gave it to us themselves")).toBe("gave_it");
    expect(readOptIn("It is publicly listed and they expect to hear from clubs")).toBe("public");
    expect(readOptIn("")).toBeNull();
  });

  it("refuses the row for anything else, naming the value", () => {
    const [row] = rowsOf(file("Synthia,Testcase,07700900001,,,maybe,"));
    expect(row.line).toBe(2);
    expect(row.reasons.join(" ")).toContain('"opt_in" reads "maybe"');
  });

  it("is normalised to its key once read", () => {
    const [row] = rowsOf(file("Synthia,Testcase,07700900001,,,Something else — written below,"));
    expect(row.reasons).toEqual([]);
    expect(row.cells.opt_in).toBe("other");
  });
});

describe("a row's own shape", () => {
  it("refuses a row with no mobile", () => {
    const [row] = rowsOf(file("Synthia,Testcase,,,,,"));
    expect(row.reasons.join(" ")).toContain('"mobile" is empty');
  });

  it("refuses a missing first or last name", () => {
    const [row] = rowsOf(file(",,07700900001,,,,"));
    expect(row.reasons).toEqual(
      expect.arrayContaining(['"first_name" is empty.', '"last_name" is empty.']),
    );
  });

  it("refuses a college email that is not a university address", () => {
    const [row] = rowsOf(file("Synthia,Testcase,07700900001,synthia@example.com,,,"));
    expect(row.reasons.join(" ")).toContain('"college_email" reads "synthia@example.com"');
  });

  it("keeps physical line numbers across blank lines", () => {
    const rows = rowsOf(
      [HEADER, "Synthia,Testcase,07700900001,,,,", "", "Tobiah,Testcase,,,,,"].join("\r\n"),
    );
    expect(rows.map((row) => row.line)).toEqual([2, 4]);
  });
});

describe("the same person twice in one file", () => {
  it("refuses the later line, naming the earlier, as the roster does", () => {
    const rows = rowsOf(
      file("Synthia,Testcase,07700900001,,,,", "synthia,testcase,+44 7700 900001,,,,"),
    );
    expect(rows[0].reasons).toEqual([]);
    expect(rows[1].reasons).toEqual([
      "Line 2 in this file is the same person — same first name, last name and mobile.",
    ]);
  });

  it("refuses a later line that carries an earlier line's mobile or email under another name", () => {
    const rows = rowsOf(
      file(
        "Synthia,Testcase,07700900001,,shared@example.com,,",
        "Tobiah,Othercase,07700900001,,,,",
        "Ursula,Thirdcase,07700900003,,SHARED@example.com,,",
      ),
    );
    expect(rows[1].reasons).toEqual(["Line 2 in this file has the same mobile."]);
    expect(rows[2].reasons).toEqual(["Line 2 in this file has the same email."]);
  });
});

describe("the file as a whole", () => {
  it("refuses a file without the required header columns", () => {
    const read = readRecruitImport({ csvText: "first_name,last_name\r\nA,B\r\n" });
    expect(read).toEqual({
      ok: false,
      reason: "The header is missing mobile. Download the template and compare the first line.",
    });
  });

  it("refuses more than 500 rows", () => {
    const body = Array.from({ length: 501 }, (_, index) => `A${index},B,0770090${index}`);
    const read = readRecruitImport({ csvText: file(...body) });
    expect(read.ok).toBe(false);
  });

  it("refuses a file over the roster's size limit", () => {
    expect(refuseOversizedRecruitFile("x".repeat(1_048_577))).not.toBeNull();
    expect(refuseOversizedRecruitFile(file("Synthia,Testcase,07700900001,,,,"))).toBeNull();
  });
});
