// @vitest-environment node
/**
 * The erasure and export refusals — LAN-423 fix round 4, J1. Each action's
 * authority is the service's own `requireCapability("person_erasure")`; a
 * seat that lost it while the record was open gets the refusal back as the
 * control's state — never a throw that rendered "This page couldn't load".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/person-erasure", () => ({
  confirmErasure: vi.fn(),
  exportPersonRecord: vi.fn(),
  withdrawErasureConfirmation: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { NotPermitted } from "@/lib/db";
import {
  confirmErasure,
  exportPersonRecord,
  withdrawErasureConfirmation,
} from "@/lib/services/person-erasure";
import {
  confirmErasureAction,
  exportPersonAction,
  withdrawErasureConfirmationAction,
} from "./erasure-actions";

const PERSON_ID = "33333333-3333-4333-8333-333333333333";
const REFUSED = "You do not have access to this action.";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(confirmErasure).mockRejectedValue(new NotPermitted(REFUSED));
  vi.mocked(withdrawErasureConfirmation).mockRejectedValue(new NotPermitted(REFUSED));
  vi.mocked(exportPersonRecord).mockRejectedValue(new NotPermitted(REFUSED));
});

describe("a seat without person erasure", () => {
  it("gets the confirmation's refusal back as state", async () => {
    const state = await confirmErasureAction({ personId: PERSON_ID, requestedOn: "2026-09-26" });

    expect(state).toEqual({ error: REFUSED, done: null });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("gets the withdrawal's refusal back as state", async () => {
    const state = await withdrawErasureConfirmationAction({ personId: PERSON_ID });

    expect(state).toEqual({ error: REFUSED, done: null });
  });

  it("gets the export's refusal back, and no file", async () => {
    const result = await exportPersonAction({ personId: PERSON_ID });

    expect(result).toEqual({ json: null, error: REFUSED });
  });

  it("still lets an unexpected failure reach the error boundary", async () => {
    const boom = new TypeError("something entirely different broke");
    vi.mocked(confirmErasure).mockRejectedValue(boom);

    await expect(
      confirmErasureAction({ personId: PERSON_ID, requestedOn: "2026-09-26" }),
    ).rejects.toBe(boom);
  });
});
