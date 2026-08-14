// @vitest-environment node
/**
 * The report's server action — LAN-81.
 *
 * This file carries the criterion LAN-73 wrote and `readLeadershipReport` used
 * to demonstrate: **`requireCapability` is enforced in the server action
 * itself, not only in the page**, proven by calling the action directly with an
 * under-privileged actor. The stub proved it while the report was unbuilt; this
 * proves it against the action that can now actually write an immutable row.
 *
 * The actor is injected exactly where a real request produces it — at
 * `resolveOperatorAccess()`, the verified-session resolution — and nowhere
 * else. The action takes no actor argument and never may: one that accepted
 * "who am I" would accept whatever the browser sent.
 *
 * The service is mocked. What is under test is the boundary: who gets through,
 * what reaches the service when they do, and what the screen is told when the
 * service refuses.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/services/weekly-report", () => ({ generateWeeklyReport: vi.fn() }));

import { Conflict, ConstraintViolated, isServiceError, NotPermitted } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { generateWeeklyReport } from "@/lib/services/weekly-report";
import { generateReportAction } from "./actions";
import { EMPTY_GENERATE_STATE } from "./action-state";

const PERSON = "22222222-2222-4222-8222-222222222222";

function actor(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: PERSON,
    displayName: "Morgan Pike",
    roleCodes,
    isActive: true,
  };
}

function signedInAs(roleCodes: string[]): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({
    state: "active",
    operator: actor(roleCodes),
  });
}

function form(reportOn: string): FormData {
  const data = new FormData();
  data.set("reportOn", reportOn);
  return data;
}

const run = (data: FormData) => generateReportAction(EMPTY_GENERATE_STATE, data);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(generateWeeklyReport).mockResolvedValue({
    id: "00810081-0081-4081-8081-000000000001",
    version: 1,
    supersedesId: null,
    reportOn: "2026-10-19",
  });
});

describe("the guard is in the action, and the action is a POST endpoint", () => {
  it.each(["president", "vice_president", "secretary", "general_manager"])(
    "admits %s and generates for the date they sent",
    async (code) => {
      signedInAs([code]);

      await expect(run(form("2026-10-19"))).rejects.toThrow(
        "REDIRECT:/operate/report?date=2026-10-19",
      );
      expect(generateWeeklyReport).toHaveBeenCalledWith(PERSON, "2026-10-19");
    },
  );

  it.each(["head_coach", "offence_coach", "defence_coach", "treasurer", "it_officer"])(
    "refuses %s, and writes nothing",
    async (code) => {
      signedInAs([code]);

      await expect(run(form("2026-10-19"))).rejects.toBeInstanceOf(NotPermitted);
      expect(generateWeeklyReport).not.toHaveBeenCalled();
    },
  );

  it("refuses an operator holding no role at all", async () => {
    signedInAs([]);

    await expect(run(form("2026-10-19"))).rejects.toBeInstanceOf(NotPermitted);
    expect(generateWeeklyReport).not.toHaveBeenCalled();
  });

  it.each(["unlinked", "inactive", "no_session"] as const)(
    "refuses a %s caller before it looks at the form",
    async (state) => {
      vi.mocked(resolveOperatorAccess).mockResolvedValue({ state } as never);

      let thrown: unknown;
      try {
        await run(form("2026-10-19"));
      } catch (error) {
        thrown = error;
      }
      expect(isServiceError(thrown)).toBe(true);
      expect((thrown as { rule?: string }).rule).toBe("operator_required");
      expect(generateWeeklyReport).not.toHaveBeenCalled();
    },
  );

  it("takes no actor argument, so identity cannot come from the request body", () => {
    // Two parameters: the previous form state and the form data. Neither is an
    // actor, and there is no third.
    expect(generateReportAction.length).toBe(2);
  });

  it("refuses on every attempt, not only the first", async () => {
    signedInAs(["treasurer"]);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(run(form("2026-10-19"))).rejects.toBeInstanceOf(NotPermitted);
    }
    expect(vi.mocked(resolveOperatorAccess)).toHaveBeenCalledTimes(3);
  });
});

describe("what the screen is told when the service refuses", () => {
  it("returns a readable refusal and keeps the date, rather than throwing", async () => {
    signedInAs(["secretary"]);
    vi.mocked(generateWeeklyReport).mockRejectedValue(
      new ConstraintViolated("Choose a reporting date in the form YYYY-MM-DD.", {
        rule: "report_on_format",
      }),
    );

    const state = await run(form("last Monday"));

    expect(state.error).toBe("Choose a reporting date in the form YYYY-MM-DD.");
    expect(state.reportOn).toBe("last Monday");
  });

  it("passes a version race back as the sentence the mapper produced", async () => {
    signedInAs(["president"]);
    vi.mocked(generateWeeklyReport).mockRejectedValue(
      new Conflict("That version of this report already exists.", {
        rule: "weekly_reports_one_per_version",
      }),
    );

    expect((await run(form("2026-10-19"))).error).toBe(
      "That version of this report already exists.",
    );
  });

  it("rethrows a refusal rather than rendering it as a form error", async () => {
    // A `not_permitted` shown beside a field reads as "try again", and the
    // operator does — which is how an authorization failure becomes a retry
    // loop instead of a refusal.
    signedInAs(["president"]);
    vi.mocked(generateWeeklyReport).mockRejectedValue(new NotPermitted("No."));

    await expect(run(form("2026-10-19"))).rejects.toBeInstanceOf(NotPermitted);
  });

  it("rethrows anything that is not a service error at all", async () => {
    signedInAs(["president"]);
    vi.mocked(generateWeeklyReport).mockRejectedValue(new TypeError("undefined is not a function"));

    await expect(run(form("2026-10-19"))).rejects.toBeInstanceOf(TypeError);
  });

  it("sends a missing field to the service rather than guessing a date", async () => {
    // The service is the one place that decides what a reporting date is, and
    // an action that quietly substituted today would file a snapshot under a
    // date nobody chose.
    signedInAs(["president"]);
    vi.mocked(generateWeeklyReport).mockRejectedValue(
      new ConstraintViolated("Choose a reporting date in the form YYYY-MM-DD.", {
        rule: "report_on_format",
      }),
    );

    const state = await run(new FormData());

    expect(generateWeeklyReport).toHaveBeenCalledWith(PERSON, "");
    expect(state.error).toContain("YYYY-MM-DD");
  });
});
