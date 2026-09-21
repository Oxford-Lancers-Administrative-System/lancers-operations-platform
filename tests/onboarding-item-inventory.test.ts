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
});
