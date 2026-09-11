// @vitest-environment node
import { describe, it, expect } from "vitest";
import { clockSql, SQL_TEST_NOW } from "../scripts/test-box/sql-clock.mjs";
describe("LAN-222 SQL clock", () => {
  it("changes database time expressions without altering text or comments", () => {
    const sql = `select now(), current_date, transaction_timestamp(), 'now() current_date', "now", $$ now() $$ -- now()\n/* current_date /* now() */ */ from events`;
    const result = clockSql(sql);
    expect(result).toContain(`select (${SQL_TEST_NOW}), (${SQL_TEST_NOW})::date`);
    expect(result).toContain(
      `'now() current_date', "now", $$ now() $$ -- now()\n/* current_date /* now() */ */`,
    );
  });
  it("preserves escaped literals, identifiers, parameters and qualified functions", () => {
    const sql = String.raw`select E'can\'t now()', 'it''s current_date', custom.now(), pg_catalog.now(), $1, now_count`;
    expect(clockSql(sql)).toBe(sql);
  });
  it("leaves ordinary queries unchanged", () =>
    expect(clockSql("select id from events where id=$1")).toBe(
      "select id from events where id=$1",
    ));
});

describe("local clock view security", () => {
  it("preserves invoker and other original view options on both install and restore", async () => {
    const { viewClockSql } = await import("../scripts/test-box/database-clock.mjs");
    const row = {
      name: "person_standing",
      options: ["security_invoker=true", "security_barrier=true"],
    };
    expect(viewClockSql(row, "select 1")).toContain(
      "with (security_invoker=true, security_barrier=true)",
    );
    expect(() => viewClockSql({ name: "person_standing", options: [] }, "select 1")).toThrow(
      "invoker",
    );
  });
});
