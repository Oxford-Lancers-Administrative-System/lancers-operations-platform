// @vitest-environment node
/**
 * The privileged modules are server-only, and this file is the one that does
 * NOT mock `server-only` away.
 *
 * Every other test that touches these modules starts with
 * `vi.mock("server-only", () => ({}))`, following the pattern
 * `src/lib/auth/operator.test.ts` established — the boundary is a build
 * concern, not a runtime one, and the mock is how the runtime behaviour gets
 * tested at all. The cost of that convention is that the boundary itself stops
 * being asserted anywhere. This file pays it back.
 *
 * The real `server-only` package throws on import unless the bundler resolves
 * the `react-server` condition, which is precisely what makes importing one of
 * these modules from a Client Component a build error. So the assertion is
 * simply: import it for real, and expect it to refuse.
 */
import { describe, expect, it } from "vitest";

describe("the privileged data path cannot be imported from a Client Component", () => {
  // Thunks rather than specifier strings: a dynamic import of a variable is
  // not statically analysable, and would silently resolve to nothing.
  it.each([
    ["the pooled connection, which holds the connection string", () => import("./connection")],
    ["the transaction helper, which hands out a query interface", () => import("./transaction")],
    ["the data-access barrel every service imports", () => import("./index")],
    ["recordAudit, the single writer for audit_events", () => import("../services/audit")],
  ])("%s is server-only", async (_label, load) => {
    await expect(load()).rejects.toThrow(/cannot be imported from a Client Component/i);
  });

  it("leaves the pure modules importable, because they hold nothing privileged", async () => {
    // The taxonomy and the URL guard are plain functions over plain values. A
    // `server-only` import on them would buy nothing and would stop a future
    // shared module from naming an error type.
    await expect(import("./errors")).resolves.toBeDefined();
    await expect(import("./url")).resolves.toBeDefined();
  });
});
