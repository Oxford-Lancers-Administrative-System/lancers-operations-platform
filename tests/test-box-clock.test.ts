// @vitest-environment node
import { describe, expect, it } from "vitest";
import { advanceChronologically, advanceTarget } from "../scripts/test-box/clock.mjs";

describe("LAN-222 shared progression", () => {
  it("runs a response before a later reminder and discovers newly created due work", async () => {
    const start = "2026-09-09T12:00:00.000Z";
    const actions = [
      { at: "2026-09-09T13:00:00.000Z", kind: "response" },
      { at: "2026-09-09T14:00:00.000Z", kind: "reminder" },
    ];
    const observed: string[] = [];
    let answered = false;
    let clock = start;
    const result = await advanceChronologically({
      current: start,
      hours: 4,
      setTime: async (time: string) => {
        clock = time;
      },
      settle: async (time: string) => {
        for (const action of actions.filter((action) => action.at <= time)) {
          actions.splice(actions.indexOf(action), 1);
          if (action.kind === "response") {
            answered = true;
            observed.push("response");
            actions.push({ at: "2026-09-09T15:00:00.000Z", kind: "follow-up" });
          } else if (action.kind !== "reminder" || !answered) observed.push(action.kind);
        }
      },
      nextDue: async ({ through }: { through: string }) =>
        actions
          .map((a) => a.at)
          .filter((at) => at <= through)
          .sort()[0] ?? null,
    });
    expect(observed).toEqual(["response", "follow-up"]);
    expect(clock).toBe("2026-09-09T16:00:00.000Z");
    expect(result.time).toBe(clock);
  });
  it("preserves the failed boundary for inspection and retry", async () => {
    let clock = "2026-09-09T12:00:00.000Z";
    await expect(
      advanceChronologically({
        current: clock,
        hours: 2,
        setTime: async (time: string) => {
          clock = time;
        },
        settle: async (time: string) => {
          if (time.includes("13:00")) throw new Error("action failed");
        },
        nextDue: async () => "2026-09-09T13:00:00.000Z",
      }),
    ).rejects.toThrow("action failed");
    expect(clock).toBe("2026-09-09T13:00:00.000Z");
  });
  it("stops stuck work rather than skipping it or looping forever", async () => {
    const current = "2026-09-09T12:00:00.000Z";
    await expect(
      advanceChronologically({
        current,
        hours: 1,
        maxSteps: 3,
        setTime: async () => {},
        settle: async () => {},
        nextDue: async () => current,
      }),
    ).rejects.toThrow("not settling");
  });
  it("rejects backwards and invalid advances", () => {
    for (const hours of [0, -1, Infinity, NaN, 8761])
      expect(() => advanceTarget("2026-09-09T12:00:00Z", hours)).toThrow();
    expect(() => advanceTarget("invalid", 1)).toThrow();
  });
});
