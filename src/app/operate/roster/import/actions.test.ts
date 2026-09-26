// @vitest-environment node
/**
 * The roster import's refusal — LAN-423 fix round 4, J1. A seat whose bulk
 * import or add-to-roster access was taken away while a proposal was on
 * screen gets the refusal as the screen's error, the proposal kept, and
 * nothing written — never a throw that rendered "This page couldn't load".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/roster-import", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/roster-import")>();
  return { ...actual, applyRosterImport: vi.fn(), planRosterImport: vi.fn() };
});

import { resolveOperatorAccess } from "@/lib/auth/operator";
import { seededGrantsFor } from "@/lib/auth/capabilities";
import { applyRosterImport, planRosterImport } from "@/lib/services/roster-import";
import { importRosterAction } from "./actions";
import { EMPTY_IMPORT_STATE, type ImportScreenState } from "./import-state";

const ON_SCREEN: ImportScreenState = {
  ...EMPTY_IMPORT_STATE,
  csvText: "given_name,family_name\nSynthetic,Person",
  fileName: "roster.csv",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveOperatorAccess).mockResolvedValue({
    state: "active",
    operator: {
      authUserId: "11111111-1111-4111-8111-111111111111",
      personId: "22222222-2222-4222-8222-222222222222",
      displayName: "Rowan Ashdown",
      roleCodes: ["treasurer"],
      grants: seededGrantsFor(["treasurer"]),
      isActive: true,
    },
  });
});

describe("importRosterAction for a seat without it", () => {
  it("returns the refusal with the proposal kept, and writes nothing", async () => {
    const formData = new FormData();
    formData.set("intent", "apply");
    formData.set("csvText", ON_SCREEN.csvText as string);
    formData.set("digest", "abc");

    const state = await importRosterAction(ON_SCREEN, formData);

    expect(state.error).toMatch(/^You do not have access to this action\./);
    expect(state.csvText).toBe(ON_SCREEN.csvText);
    expect(state.applied).toBeNull();
    expect(applyRosterImport).not.toHaveBeenCalled();
    expect(planRosterImport).not.toHaveBeenCalled();
  });
});
