/**
 * LAN-396 — the approved item-and-ask inventory is one list, and stays one.
 *
 * Production, 2026-09-17: the 2026-27 season was opened with no onboarding
 * item types at all. The baseline that opens the season did not create them,
 * nothing in the application creates a season and so nothing creates its types
 * either, and `generateOnboardingItems` selects from the season's own types —
 * so every 2026-27 membership was generated with none. Brian repaired it by
 * hand the same day.
 *
 * The inventory lived in two places the application could not read: the local
 * seed and the showcase plan. It lives in
 * `src/lib/services/onboarding-item-types.json` now, and the application, the
 * seed and the showcase plan all read that. This is the test that fails if any
 * of them stops.
 *
 * It lives here rather than beside the module because
 * `tests/production-smoke-contract.test.ts` refuses any file under `src/` that
 * so much as names `scripts/production` — a production procedure reachable
 * from a request handler is not a procedure. Reading the plan's list from a
 * cross-cutting test is not reaching it.
 */
import { describe, expect, it } from "vitest";

import { ONBOARDING_ITEM_TYPES } from "@/lib/services/onboarding-item-shapes";
// A plain ESM module with no types. Read, never run.
import { ONBOARDING_TYPES } from "../scripts/production/showcase/plan/reference.mjs";

describe("the eleven onboarding item types", () => {
  it("are the same list in the application and in the showcase plan", () => {
    const showcase = (
      ONBOARDING_TYPES as readonly [string, string, boolean, boolean, string][]
    ).map(([code, label, isRequired, isSubscription, verificationClass]) => ({
      code,
      label,
      isRequired,
      isSubscription,
      verificationClass,
    }));

    expect(showcase).toEqual(ONBOARDING_ITEM_TYPES.map((type) => ({ ...type })));
  });

  /**
   * LAN-413. The 2026-27 rows were inserted by hand without
   * `verification_class`, so BUCS Play and Hudl took the column's `direct`
   * default, and the player's own confirm button on steps 4 and 5 refused —
   * as a 500. Two guards now stand between that and a season: this one, over
   * the list every writer of those rows reads, and the check constraint in
   * `20261003090000_trust_item_verification_class.sql` over the rows
   * themselves. W4's locked decision names exactly this pair.
   */
  it("keeps BUCS Play and Hudl trust-class, and every other item direct", () => {
    const byCode = new Map(ONBOARDING_ITEM_TYPES.map((type) => [type.code, type]));

    expect(byCode.get("bucs_play")?.verificationClass).toBe("trust");
    expect(byCode.get("hudl_access")?.verificationClass).toBe("trust");

    const trust = ONBOARDING_ITEM_TYPES.filter((type) => type.verificationClass === "trust").map(
      (type) => type.code,
    );
    expect(trust).toEqual(["bucs_play", "hudl_access"]);
  });
});
