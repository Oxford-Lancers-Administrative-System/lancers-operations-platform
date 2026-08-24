// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Client } from "pg";
import { scopedPilotSnapshot } from "./helpers/pilot-snapshot";

describe("pilot scenario snapshot scoping", () => {
  it("hashes deletion targets and durable foundation while retaining every rowcount", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { qualified: "public.people" },
          { qualified: "public.operator_accounts" },
          { qualified: "public.unrelated" },
        ],
      })
      .mockResolvedValue({ rows: [{ digest: "1:fixture" }] });
    const client = { query } as unknown as Client;

    const result = await scopedPilotSnapshot(
      client,
      "delete from public.people where id = 'fixture';",
    );

    expect(result).toEqual({
      "public.people": "1:fixture",
      "public.operator_accounts": "1:fixture",
      "public.unrelated": "1:fixture",
    });
    expect(query.mock.calls[1][0]).toContain("md5");
    expect(query.mock.calls[2][0]).toContain("md5");
    expect(query.mock.calls[3][0]).not.toContain("md5");
    expect(query.mock.calls[3][0]).toContain("count(*)");
  });
});
