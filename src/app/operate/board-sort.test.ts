import { describe, expect, it } from "vitest";
import {
  boardUrl,
  compareValues,
  firstInOptionOrder,
  formatSortParam,
  headerSort,
  instantOf,
  keepAllowed,
  orderLabel,
  parseSortParam,
  setSortRow,
  sortRows,
  type SortKey,
  type SortValue,
} from "./board-sort";

/** LAN-495 — the boards' one multi-key sort. */

interface Row {
  id: string;
  name: string;
  values: Record<string, SortValue>;
}

const tieBreak = { name: (row: Row) => row.name, id: (row: Row) => row.id };
const valueOf = (row: Row, key: string) => row.values[key] ?? null;
const ids = (rows: readonly Row[]) => rows.map((row) => row.id);

function r(id: string, name: string, values: Record<string, SortValue>): Row {
  return { id, name, values };
}

describe("compareValues", () => {
  it("compares numbers numerically, not as text", () => {
    expect(compareValues(9, 10, "asc")).toBeLessThan(0);
    expect(compareValues(9, 10, "desc")).toBeGreaterThan(0);
  });

  it("compares text with en-GB numeric collation", () => {
    expect(compareValues("Pitch 9", "Pitch 10", "asc")).toBeLessThan(0);
    expect(compareValues("apple", "Banana", "asc")).toBeLessThan(0);
  });

  it("puts an absent value last in either direction", () => {
    expect(compareValues(null, "a", "asc")).toBeGreaterThan(0);
    expect(compareValues(null, "a", "desc")).toBeGreaterThan(0);
    expect(compareValues("a", null, "desc")).toBeLessThan(0);
    expect(compareValues(null, null, "asc")).toBe(0);
  });
});

describe("sortRows", () => {
  const rows = [
    r("4", "Dee", { status: "active", college: "Keble", year: 2025 }),
    r("1", "Ann", { status: "active", college: "Balliol", year: null }),
    r("3", "Cal", { status: "inactive", college: "Balliol", year: 2024 }),
    r("2", "Bea", { status: "active", college: "Balliol", year: 2026 }),
  ];

  it("lets the second key break the first key's ties, and the third the second's", () => {
    const keys: SortKey[] = [
      { key: "status", direction: "asc" },
      { key: "college", direction: "asc" },
      { key: "year", direction: "desc" },
    ];
    expect(ids(sortRows(rows, keys, valueOf, tieBreak))).toEqual(["2", "1", "4", "3"]);
  });

  it("breaks a full tie by display name, then by record id, whatever the input order", () => {
    const twins = [
      r("b", "Sam", { status: "active" }),
      r("a", "Sam", { status: "active" }),
      r("c", "Abe", { status: "active" }),
    ];
    const keys: SortKey[] = [{ key: "status", direction: "asc" }];
    const once = ids(sortRows(twins, keys, valueOf, tieBreak));
    expect(once).toEqual(["c", "a", "b"]);
    expect(ids(sortRows([...twins].reverse(), keys, valueOf, tieBreak))).toEqual(once);
    // The tie-break does not turn with the key's direction.
    expect(ids(sortRows(twins, [{ key: "status", direction: "desc" }], valueOf, tieBreak))).toEqual(
      once,
    );
  });

  it("uses the board's own default only when no key is chosen", () => {
    const byYear = (a: Row, b: Row) => compareValues(valueOf(a, "year"), valueOf(b, "year"), "asc");
    expect(ids(sortRows(rows, [], valueOf, tieBreak, byYear))).toEqual(["3", "4", "2", "1"]);
    expect(
      ids(sortRows(rows, [{ key: "college", direction: "desc" }], valueOf, tieBreak, byYear)),
    ).toEqual(["4", "1", "2", "3"]);
  });

  it("does not change the rows it was given", () => {
    const before = ids(rows);
    sortRows(rows, [{ key: "year", direction: "asc" }], valueOf, tieBreak);
    expect(ids(rows)).toEqual(before);
  });
});

describe("firstInOptionOrder", () => {
  it("takes a multi-valued cell's first value in the column's option order", () => {
    expect(
      firstInOptionOrder(["Special Teams", "Offense"], ["Offense", "Defense", "Special Teams"]),
    ).toBe("Offense");
  });

  it("takes the first value where there is no option order, and nothing for an empty cell", () => {
    expect(firstInOptionOrder(["Mobile", "Email"], undefined)).toBe("Mobile");
    expect(firstInOptionOrder([], ["a"])).toBeNull();
  });
});

describe("instantOf", () => {
  it("reads a timestamp as its instant, so two zones compare by time", () => {
    expect(instantOf("2026-10-07T19:31:00.000+01:00")).toBe(instantOf("2026-10-07T18:31:00.000Z"));
    expect(instantOf("2026-10-07T18:32:00.000Z")).toBeGreaterThan(
      instantOf("2026-10-07T19:31:00.000+01:00")!,
    );
    expect(instantOf(null)).toBeNull();
    expect(instantOf("not a date")).toBeNull();
  });
});

describe("orderLabel", () => {
  it("words each order by the field's type", () => {
    expect(orderLabel("text", "asc")).toBe("A–Z");
    expect(orderLabel("text", "desc")).toBe("Z–A");
    expect(orderLabel("date", "asc")).toBe("Oldest first");
    expect(orderLabel("date", "desc")).toBe("Newest first");
    expect(orderLabel("number", "asc")).toBe("Low–High");
    expect(orderLabel("number", "desc")).toBe("High–Low");
  });
});

describe("the address bar", () => {
  it("reads three keys in order", () => {
    expect(parseSortParam("status:asc,college:asc,lastName:desc")).toEqual([
      { key: "status", direction: "asc" },
      { key: "college", direction: "asc" },
      { key: "lastName", direction: "desc" },
    ]);
  });

  it("still reads an old single-key link with its dir", () => {
    expect(parseSortParam("lastName", "desc")).toEqual([{ key: "lastName", direction: "desc" }]);
    expect(parseSortParam("college", "")).toEqual([{ key: "college", direction: "asc" }]);
    expect(parseSortParam("")).toEqual([]);
  });

  it("ignores a malformed part rather than refusing the link", () => {
    expect(parseSortParam("status:sideways,college:desc,:asc")).toEqual([
      { key: "college", direction: "desc" },
    ]);
  });

  it("writes what it reads, and keeps : and , readable", () => {
    const keys: SortKey[] = [
      { key: "status", direction: "asc" },
      { key: "college", direction: "desc" },
    ];
    expect(parseSortParam(formatSortParam(keys))).toEqual(keys);
    const params = new URLSearchParams({ q: "m", sort: formatSortParam(keys) });
    expect(boardUrl("/operate/roster", params)).toBe(
      "/operate/roster?q=m&sort=status:asc,college:desc",
    );
    expect(boardUrl("/operate/roster", new URLSearchParams())).toBe("/operate/roster");
  });
});

describe("keepAllowed", () => {
  it("drops a key the viewer can no longer see, a repeat, and anything past three", () => {
    const allowed = new Set(["a", "b", "c", "d"]);
    expect(
      keepAllowed(
        [
          { key: "hidden", direction: "asc" },
          { key: "a", direction: "asc" },
          { key: "a", direction: "desc" },
          { key: "b", direction: "desc" },
          { key: "c", direction: "asc" },
          { key: "d", direction: "asc" },
        ],
        allowed,
      ),
    ).toEqual([
      { key: "a", direction: "asc" },
      { key: "b", direction: "desc" },
      { key: "c", direction: "asc" },
    ]);
  });
});

describe("headerSort", () => {
  const three: SortKey[] = [
    { key: "status", direction: "asc" },
    { key: "college", direction: "asc" },
    { key: "lastName", direction: "desc" },
  ];

  it("flips key 1 when its heading is tapped again, keeping keys 2 and 3", () => {
    expect(headerSort(three, "status")).toEqual([
      { key: "status", direction: "desc" },
      three[1],
      three[2],
    ]);
  });

  it("makes another heading key 1, A–Z, and keeps keys 2 and 3", () => {
    expect(headerSort(three, "degree")).toEqual([
      { key: "degree", direction: "asc" },
      three[1],
      three[2],
    ]);
  });

  it("never lists a key twice when a later key's heading is tapped", () => {
    expect(headerSort(three, "college")).toEqual([{ key: "college", direction: "asc" }, three[2]]);
  });

  it("starts a sort from none", () => {
    expect(headerSort([], "college")).toEqual([{ key: "college", direction: "asc" }]);
  });
});

describe("setSortRow", () => {
  const two: SortKey[] = [
    { key: "status", direction: "asc" },
    { key: "college", direction: "desc" },
  ];

  it("None removes the row and moves later rows up", () => {
    expect(setSortRow(two, 0, null)).toEqual([two[1]]);
  });

  it("fills the next empty row", () => {
    expect(setSortRow(two, 2, { key: "lastName", direction: "asc" })).toEqual([
      ...two,
      { key: "lastName", direction: "asc" },
    ]);
  });

  it("changes one row's direction alone", () => {
    expect(setSortRow(two, 1, { key: "college", direction: "asc" })).toEqual([
      two[0],
      { key: "college", direction: "asc" },
    ]);
  });

  it("moves a field chosen higher up out of the row below", () => {
    expect(setSortRow(two, 0, { key: "college", direction: "asc" })).toEqual([
      { key: "college", direction: "asc" },
    ]);
  });
});
