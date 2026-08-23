/**
 * What a row of the club's CSV means — LAN-155, matrix rows P1 to P20.
 *
 * These are the four locked rules of `W3`, checked one at a time: an `id`
 * updates, a blank `id` creates, an unmatched `id` refuses that row alone; a
 * blank or whitespace-only cell changes nothing; an import may not change an
 * approved or cancelled event, but an unchanged row is a no-op whatever the
 * status; and nothing here writes.
 *
 * There is no database, because there is nothing to ask one. `planImport` takes
 * the season as an argument precisely so the rules can be checked against a
 * hand-built one — including the case a live season cannot easily produce, which
 * is a file that is wrong in six different ways at once.
 */
import { describe, expect, it } from "vitest";

import {
  EXPORT_COLUMNS,
  formatSeasonExport,
  IMPORT_COLUMNS,
  IMPORT_PROMPT,
  importTemplateCsv,
  MAX_IMPORT_ROWS,
  planImport,
  plannedWrites,
  workedExampleCsv,
  type ImportableEvent,
  type ImportPlan,
  type PlannedRow,
} from "./event-csv";

const HEADER = IMPORT_COLUMNS.join(",");

const DRAFT: ImportableEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Practice — michaelmas week 3",
  eventType: "practice",
  status: "draft",
  scheduledOn: "2026-10-28",
  startsAt: "20:00",
  endsAt: "21:30",
  deliveryMode: "in_person",
  venue: "Iffley Road Astro",
  description: null,
  requiredEquipment: "Gumshield",
  joiningUrl: null,
  isMandatory: true,
};

const APPROVED: ImportableEvent = {
  ...DRAFT,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Practice — michaelmas week 1",
  status: "approved",
  scheduledOn: "2026-10-14",
};

const CANCELLED: ImportableEvent = {
  ...DRAFT,
  id: "33333333-3333-4333-8333-333333333333",
  name: "Chalk — michaelmas week 2",
  eventType: "chalk",
  status: "cancelled",
  scheduledOn: "2026-10-20",
};

const SEASON: readonly ImportableEvent[] = Object.freeze([DRAFT, APPROVED, CANCELLED]);

function plan(csvText: string, events: readonly ImportableEvent[] = SEASON): ImportPlan {
  const result = planImport({ csvText, events, fileName: "michaelmas-2026.csv" });
  if (!result.ok) throw new Error(`expected a plan, got: ${result.reason}`);
  return result.plan;
}

function refusalOf(csvText: string, events: readonly ImportableEvent[] = SEASON): string {
  const result = planImport({ csvText, events, fileName: null });
  if (result.ok) throw new Error("expected the file to be refused whole");
  return result.reason;
}

function only(plan: ImportPlan): PlannedRow {
  expect(plan.rows).toHaveLength(1);
  return plan.rows[0];
}

/** One CSV row in template column order. */
function row(values: Partial<Record<(typeof IMPORT_COLUMNS)[number], string>>): string {
  return IMPORT_COLUMNS.map((column) => quoted(values[column] ?? "")).join(",");
}

function quoted(value: string): string {
  return value.includes(",") ? `"${value}"` : value;
}

function file(...rows: string[]): string {
  return [HEADER, ...rows].join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// The file, refused whole
// ---------------------------------------------------------------------------

describe("a file refused whole, before any row is read", () => {
  it("refuses a file with no recognisable header", () => {
    // W3's exception table: "the file is not a CSV, or has no recognisable
    // header → refused whole, before any row is read".
    expect(refusalOf("Monday practice 8pm\nTuesday S&C 7pm\n")).toContain(
      "no header row this importer recognises",
    );
  });

  it("names the columns a nearly-right header is missing", () => {
    expect(refusalOf("id,name,venue\n,Practice,Astro\n")).toContain("missing type, date");
  });

  it("refuses a header that names one column twice", () => {
    expect(refusalOf("id,name,type,date,name\n,,,,\n")).toContain("twice");
  });

  it("refuses a header with no rows under it", () => {
    expect(refusalOf(file())).toContain("nothing to import");
  });

  it("refuses a file with more rows than a season could hold", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) =>
      row({ name: `Practice ${index}`, type: "Practice", date: "2026-10-14" }),
    );
    expect(refusalOf(file(...rows))).toContain(`at most ${MAX_IMPORT_ROWS}`);
  });

  it("refuses a file that is not a CSV at all", () => {
    expect(refusalOf("PK\u0000binary")).toContain("not a CSV");
  });
});

// ---------------------------------------------------------------------------
// Identity — REQ-upsert-only
// ---------------------------------------------------------------------------

describe("what a row's id does", () => {
  it("creates a draft when the id is blank", () => {
    const planned = only(
      plan(file(row({ name: "Alumni touch game", type: "Social", date: "2026-12-12" }))),
    );
    expect(planned.outcome).toBe("new");
    expect(planned.write).toEqual({
      kind: "create",
      input: expect.objectContaining({ name: "Alumni touch game", eventType: "social" }),
    });
  });

  it("updates the event when the id matches one in this season", () => {
    const planned = only(plan(file(row({ id: DRAFT.id, venue: "University Parks" }))));
    expect(planned.outcome).toBe("updated");
    expect(planned.eventId).toBe(DRAFT.id);
    expect(planned.write).toEqual({
      kind: "update",
      eventId: DRAFT.id,
      input: expect.objectContaining({ venue: "University Parks" }),
    });
  });

  it("refuses a row whose id matches nothing, and names the id", () => {
    const planned = only(plan(file(row({ id: "9c14e0aa-0000-4000-8000-000000000000" }))));
    expect(planned.outcome).toBe("refused");
    expect(planned.reasons.join(" ")).toContain("No event in this season has id 9c14e0…");
    expect(planned.write).toBeNull();
  });

  it("refuses an unmatched row and lets every other row proceed", () => {
    // The rule that makes a bad row survivable: "refuse that row, name it, and
    // let every other row proceed".
    const planned = plan(
      file(
        row({ id: "9c14e0aa-0000-4000-8000-000000000000" }),
        row({ id: DRAFT.id, venue: "University Parks" }),
        row({ name: "Alumni touch game", type: "Social", date: "2026-12-12" }),
      ),
    );
    expect(planned.totals).toEqual({ new: 1, updated: 1, unchanged: 0, refused: 1 });
    expect(plannedWrites(planned)).toHaveLength(2);
  });

  it("refuses both rows when one id appears twice, rather than picking", () => {
    const planned = plan(
      file(row({ id: DRAFT.id, venue: "One" }), row({ id: DRAFT.id, venue: "Two" })),
    );
    expect(planned.rows.map((planned) => planned.outcome)).toEqual(["refused", "refused"]);
    expect(planned.rows[0].reasons.join(" ")).toContain("same id");
    expect(plannedWrites(planned)).toHaveLength(0);
  });

  it("refuses an id that is not an identifier at all", () => {
    const planned = only(plan(file(row({ id: "practice-1" }))));
    expect(planned.outcome).toBe("refused");
    expect(planned.reasons.join(" ")).toContain("No event in this season has id");
  });

  it("never proposes a delete, whatever the file says", () => {
    // REQ-upsert-only. There is no column, no keyword and no empty row that
    // removes an event, and an event absent from the file is simply absent from
    // the plan.
    const planned = plan(file(row({ id: DRAFT.id, name: "Renamed" })));
    expect(plannedWrites(planned).every((write) => write.kind !== ("delete" as never))).toBe(true);
    expect(planned.rows.some((planned) => planned.eventId === APPROVED.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A blank cell means "leave it alone"
// ---------------------------------------------------------------------------

describe("a blank or whitespace-only cell", () => {
  it("changes nothing on a row that updates", () => {
    const planned = only(plan(file(row({ id: DRAFT.id }))));
    expect(planned.outcome).toBe("unchanged");
    expect(planned.changes).toEqual([]);
    expect(planned.write).toBeNull();
  });

  it.each([" ", "   ", "\t", "\u00a0", "\u2028"])(
    "treats %j as blank rather than as a value",
    (whitespace) => {
      const planned = only(plan(file(row({ id: DRAFT.id, venue: whitespace }))));
      expect(planned.outcome).toBe("unchanged");
    },
  );

  it("cannot clear a field, which is deliberate", () => {
    // "There is therefore no way to clear a field through an import, which is
    // the right trade" — W3. Clearing one takes one edit on the event itself.
    const planned = only(plan(file(row({ id: DRAFT.id, required_equipment: "   " }))));
    expect(planned.outcome).toBe("unchanged");
  });

  it("means unset on a row that creates", () => {
    const planned = only(plan(file(row({ name: "Meeting", type: "Meeting" }))));
    expect(planned.write).toEqual({
      kind: "create",
      input: expect.objectContaining({
        scheduledOn: null,
        startsAt: null,
        venue: null,
        description: null,
        requiredEquipment: null,
        // Blank is not an expectation. An event never quietly claims attendance
        // is required because nobody said it was not.
        isMandatory: false,
        deliveryMode: "in_person",
      }),
    });
  });

  it("reads a column the file omits entirely as blank", () => {
    const trimmed = "id,name,type,date\n" + `${DRAFT.id},,,\n`;
    expect(only(plan(trimmed)).outcome).toBe("unchanged");
  });
});

// ---------------------------------------------------------------------------
// Only drafts may be bulk-updated
// ---------------------------------------------------------------------------

describe("what an import may change", () => {
  it("refuses a row that would change an approved event, and names it", () => {
    const planned = only(plan(file(row({ id: APPROVED.id, venue: "Somewhere else" }))));
    expect(planned.outcome).toBe("refused");
    expect(planned.name).toBe(APPROVED.name);
    expect(planned.reasons.join(" ")).toContain("This event is approved");
    expect(planned.reasons.join(" ")).toContain("amend it on its own page");
  });

  it("refuses a row that would change a cancelled event", () => {
    const planned = only(plan(file(row({ id: CANCELLED.id, venue: "Somewhere else" }))));
    expect(planned.outcome).toBe("refused");
    expect(planned.reasons.join(" ")).toContain("This event is cancelled");
  });

  it("treats an unchanged row against an approved event as a no-op", () => {
    // The refusal is narrow on purpose: a straight export-and-reimport does
    // nothing at all, rather than producing a screen of refusals.
    const planned = only(plan(file(row({ id: APPROVED.id, venue: APPROVED.venue ?? "" }))));
    expect(planned.outcome).toBe("unchanged");
    expect(planned.reasons).toEqual([]);
  });

  it("refuses a row that would change an approved event while the rest apply", () => {
    const planned = plan(
      file(
        row({ id: APPROVED.id, venue: "Somewhere else" }),
        row({ id: DRAFT.id, venue: "University Parks" }),
      ),
    );
    expect(planned.totals).toEqual({ new: 0, updated: 1, unchanged: 0, refused: 1 });
  });
});

// ---------------------------------------------------------------------------
// Per-row refusals, never a whole-file failure
// ---------------------------------------------------------------------------

describe("a row that cannot be read", () => {
  it("refuses a type the club does not have, and lists the seven", () => {
    const planned = only(
      plan(file(row({ name: "Training", type: "Training", date: "2026-10-14" }))),
    );
    expect(planned.outcome).toBe("refused");
    expect(planned.reasons.join(" ")).toContain("“type” reads “Training”");
    expect(planned.reasons.join(" ")).toContain("Practice, S&C, Chalk, Game, Social");
  });

  it("refuses a date in the wrong shape", () => {
    const planned = only(plan(file(row({ id: DRAFT.id, date: "14/10/2026" }))));
    expect(planned.reasons.join(" ")).toContain("Dates are YYYY-MM-DD");
  });

  it("refuses a date that is not a real day", () => {
    expect(only(plan(file(row({ id: DRAFT.id, date: "2026-02-30" })))).outcome).toBe("refused");
  });

  it("refuses a time that is not a time", () => {
    expect(only(plan(file(row({ id: DRAFT.id, start: "7pm" })))).reasons.join(" ")).toContain(
      "24-hour clock",
    );
  });

  it("refuses a time that is not on a five-minute step", () => {
    expect(only(plan(file(row({ id: DRAFT.id, start: "19:32" })))).reasons.join(" ")).toContain(
      "five-minute steps",
    );
  });

  it("accepts the seconds a spreadsheet adds to a time", () => {
    const planned = only(plan(file(row({ id: DRAFT.id, start: "19:30:00" }))));
    expect(planned.outcome).toBe("updated");
    expect(planned.changes).toEqual([{ column: "start", from: "20:00", to: "19:30" }]);
  });

  it("refuses a yes/no column that says something else", () => {
    expect(only(plan(file(row({ id: DRAFT.id, online: "maybe" })))).reasons.join(" ")).toContain(
      "must be yes or no",
    );
  });

  it("refuses a new row with no name", () => {
    expect(only(plan(file(row({ type: "Practice", date: "2026-10-14" })))).reasons.join(" ")).toContain(
      "A new row needs a name",
    );
  });

  it("refuses a new row with no type", () => {
    expect(only(plan(file(row({ name: "Something", date: "2026-10-14" })))).reasons.join(" ")).toContain(
      "A new row needs a type",
    );
  });

  it("refuses a row whose end would not follow its start", () => {
    const planned = only(plan(file(row({ id: DRAFT.id, end: "19:00" }))));
    expect(planned.outcome).toBe("refused");
    // The comparison is against the *merged* row, not the file's cells: the
    // start is blank here, so the event's own 20:00 is what 19:00 has to follow.
    expect(planned.reasons.join(" ")).toContain("“end” (19:00) is not after “start” (20:00)");
  });

  it("refuses turning an online event with a joining link in person", () => {
    // `events_joining_url_is_for_online_events`, said as a sentence rather than
    // left to fail the whole transaction on the last row.
    const online: ImportableEvent = {
      ...DRAFT,
      deliveryMode: "online",
      venue: "Microsoft Teams",
      joiningUrl: "https://teams.example/abc",
    };
    const planned = only(plan(file(row({ id: online.id, online: "no" })), [online]));
    expect(planned.outcome).toBe("refused");
    expect(planned.reasons.join(" ")).toContain("joining link");
  });

  it("collects every fault in one row rather than stopping at the first", () => {
    const planned = only(
      plan(file(row({ id: DRAFT.id, type: "Training", date: "nope", start: "7pm" }))),
    );
    expect(planned.reasons).toHaveLength(3);
  });

  it("refuses the row and reads every other one", () => {
    const planned = plan(
      file(
        row({ name: "Broken", type: "Training", date: "2026-10-14" }),
        row({ name: "Fine", type: "Social", date: "2026-12-12" }),
      ),
    );
    expect(planned.totals).toEqual({ new: 1, updated: 0, unchanged: 0, refused: 1 });
  });
});

// ---------------------------------------------------------------------------
// The confirmation
// ---------------------------------------------------------------------------

describe("what the confirmation states", () => {
  it("names each changed field with its old value and its new one", () => {
    const planned = only(
      plan(file(row({ id: DRAFT.id, start: "19:30", venue: "University Parks" }))),
    );
    expect(planned.changes).toEqual([
      { column: "start", from: "20:00", to: "19:30" },
      { column: "venue", from: "Iffley Road Astro", to: "University Parks" },
    ]);
    expect(planned.cells.start).toEqual({ value: "19:30", previous: "20:00" });
    expect(planned.cells.venue).toEqual({
      value: "University Parks",
      previous: "Iffley Road Astro",
    });
  });

  it("marks a cell that fills something previously empty", () => {
    const planned = only(plan(file(row({ id: DRAFT.id, description: "Bring a towel." }))));
    expect(planned.cells.description).toEqual({ value: "Bring a towel.", previous: "" });
  });

  it("leaves an unchanged cell unmarked", () => {
    const planned = only(plan(file(row({ id: DRAFT.id, venue: "University Parks" }))));
    expect(planned.cells.date.previous).toBeNull();
  });

  it("counts every outcome, and counts what Apply would write", () => {
    const planned = plan(
      file(
        row({ name: "One", type: "Social", date: "2026-12-12" }),
        row({ name: "Two", type: "Social", date: "2026-12-13" }),
        row({ id: DRAFT.id, venue: "University Parks" }),
        row({ id: APPROVED.id }),
        row({ id: "9c14e0aa-0000-4000-8000-000000000000" }),
      ),
    );
    expect(planned.totals).toEqual({ new: 2, updated: 1, unchanged: 1, refused: 1 });
    expect(planned.applicableCount).toBe(3);
    expect(planned.rowCount).toBe(5);
  });

  it("numbers each row by the line the operator sees in their spreadsheet", () => {
    const planned = plan(
      [HEADER, row({ name: "One", type: "Social" }), "", row({ name: "Two", type: "Social" })].join(
        "\r\n",
      ),
    );
    expect(planned.rows.map((planned) => planned.line)).toEqual([2, 4]);
  });

  it("shows a refused row the cells the operator typed", () => {
    const planned = only(plan(file(row({ id: DRAFT.id, type: "Training" }))));
    expect(planned.cells.type.value).toBe("Training");
  });
});

describe("the digest", () => {
  it("is the same for two identical plans", () => {
    const csv = file(row({ id: DRAFT.id, venue: "University Parks" }));
    expect(plan(csv).digest).toBe(plan(csv).digest);
  });

  it("changes when the season under the file changes", () => {
    // The apply recomputes the plan and refuses unless this still matches, so a
    // digest that ignored the season would let an operator confirm one thing
    // and write another.
    const csv = file(row({ id: DRAFT.id, venue: "University Parks" }));
    const moved = plan(csv, [{ ...DRAFT, startsAt: "18:00" }, APPROVED, CANCELLED]);
    expect(moved.digest).not.toBe(plan(csv).digest);
  });

  it("changes when the file changes", () => {
    expect(plan(file(row({ id: DRAFT.id, venue: "A" }))).digest).not.toBe(
      plan(file(row({ id: DRAFT.id, venue: "B" }))).digest,
    );
  });
});

// ---------------------------------------------------------------------------
// The copyable prompt
// ---------------------------------------------------------------------------

describe("the copyable prompt", () => {
  it("imports its own worked example cleanly", () => {
    // W3: "It is tested. The prompt's own worked example must import cleanly,
    // asserted by test. A prompt that produces a file the importer rejects is
    // worse than no prompt, because it fails in someone else's tool where
    // nobody can see it."
    const planned = plan(workedExampleCsv());
    expect(planned.totals).toEqual({ new: 2, updated: 0, unchanged: 0, refused: 0 });
    expect(plannedWrites(planned).map((write) => write.kind)).toEqual(["create", "create"]);
  });

  it("imports its worked example against an empty season too", () => {
    expect(plan(workedExampleCsv(), []).totals.new).toBe(2);
  });

  it("states the header the importer actually reads", () => {
    expect(IMPORT_PROMPT).toContain(IMPORT_COLUMNS.join(","));
  });

  it("lists exactly the seven type tokens the importer accepts", () => {
    expect(IMPORT_PROMPT).toContain("Practice, S&C, Chalk, Game, Social, Recruitment, Meeting");
  });

  it("tells the tool to leave the id empty", () => {
    expect(IMPORT_PROMPT).toContain("id: leave EMPTY for every event");
  });
});

// ---------------------------------------------------------------------------
// The export, and the round trip
// ---------------------------------------------------------------------------

describe("the export", () => {
  it("is the import template, populated, with the two read-only columns", () => {
    const csv = formatSeasonExport(SEASON.map((event) => ({ ...event, termWeek: "Michaelmas 3rd week" })));
    expect(csv.split("\r\n")[0]).toBe(EXPORT_COLUMNS.join(","));
    expect(csv).toContain("Michaelmas 3rd week");
  });

  it("includes cancelled events", () => {
    // Leaving one out would make a cancelled event invisible in the file and
    // look like something to re-add.
    const csv = formatSeasonExport(SEASON.map((event) => ({ ...event, termWeek: "" })));
    expect(csv).toContain(CANCELLED.id);
    expect(csv).toContain("Cancelled");
  });

  it("is the bare header on an empty season", () => {
    expect(importTemplateCsv().trim()).toBe(EXPORT_COLUMNS.join(","));
  });

  it("produces zero writes when imported straight back", () => {
    // The acceptance criterion this whole design turns on: "a CSV exported from
    // a season and imported back unchanged produces zero writes and reports
    // every row as unchanged".
    const csv = formatSeasonExport(SEASON.map((event) => ({ ...event, termWeek: "Michaelmas 3rd week" })));
    const planned = plan(csv);
    expect(planned.totals).toEqual({ new: 0, updated: 0, unchanged: 3, refused: 0 });
    expect(plannedWrites(planned)).toHaveLength(0);
  });

  it("produces zero writes even when a venue looks like a spreadsheet formula", () => {
    const hostile: ImportableEvent = { ...DRAFT, venue: "-- the Astro", description: "=SUM(A1)" };
    const csv = formatSeasonExport([{ ...hostile, termWeek: "" }]);
    expect(plan(csv, [hostile]).totals.unchanged).toBe(1);
  });

  it("produces zero writes when the file comes back with a byte order mark and CRLF", () => {
    const csv = "\uFEFF" + formatSeasonExport(SEASON.map((event) => ({ ...event, termWeek: "" })));
    expect(plan(csv).totals).toEqual({ new: 0, updated: 0, unchanged: 3, refused: 0 });
  });

  it("ignores the two read-only columns on the way back in", () => {
    const csv = formatSeasonExport([{ ...DRAFT, termWeek: "Michaelmas 3rd week" }])
      .replace("Draft", "Approved")
      .replace("Michaelmas 3rd week", "Hilary 1st week");
    expect(plan(csv, [DRAFT]).totals.unchanged).toBe(1);
  });

  it("survives a column order the operator rearranged", () => {
    const planned = plan(`name,type,date,id\nRenamed,Practice,2026-10-28,${DRAFT.id}\n`);
    expect(planned.rows[0].outcome).toBe("updated");
    expect(planned.rows[0].changes).toEqual([
      { column: "name", from: DRAFT.name, to: "Renamed" },
    ]);
  });
});
