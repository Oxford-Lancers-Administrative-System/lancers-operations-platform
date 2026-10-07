// @vitest-environment node
/**
 * The recruit import's action and template route for a seat without May add
 * recruits — LAN-487. The refusal is the screen's error with the proposal
 * kept, and neither service is reached; the template answers 403.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/recruit-import", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/recruit-import")>();
  return { ...actual, applyRecruitImport: vi.fn(), planRecruitImport: vi.fn() };
});

import { resolveOperatorAccess } from "@/lib/auth/operator";
import { seededGrantsFor } from "@/lib/auth/capabilities";
import { NO_GRANTS, type OperatorGrants } from "@/lib/auth/grants";
import { applyRecruitImport, planRecruitImport } from "@/lib/services/recruit-import";
import { importRecruitsAction } from "./actions";
import { EMPTY_RECRUIT_IMPORT_STATE, type RecruitImportScreenState } from "./import-state";
import { GET } from "./template/route";

const ON_SCREEN: RecruitImportScreenState = {
  ...EMPTY_RECRUIT_IMPORT_STATE,
  csvText: "first_name,last_name,mobile\nSynthetic,Person,07700900001",
  fileName: "recruits.csv",
};

function signedInWith(grants: OperatorGrants): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({
    state: "active",
    operator: {
      authUserId: "11111111-1111-4111-8111-111111111487",
      personId: "22222222-2222-4222-8222-222222222487",
      displayName: "Rowan Ashdown",
      roleCodes: [],
      grants,
      isActive: true,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("importRecruitsAction for a seat without May add recruits", () => {
  beforeEach(() => signedInWith(NO_GRANTS));

  it("refuses an apply, keeping the proposal, and writes nothing", async () => {
    const formData = new FormData();
    formData.set("intent", "apply");
    formData.set("csvText", ON_SCREEN.csvText as string);
    formData.set("digest", "abc");

    const state = await importRecruitsAction(ON_SCREEN, formData);

    expect(state.error).toMatch(/^You do not have access to this action\./);
    expect(state.csvText).toBe(ON_SCREEN.csvText);
    expect(state.applied).toBeNull();
    expect(applyRecruitImport).not.toHaveBeenCalled();
    expect(planRecruitImport).not.toHaveBeenCalled();
  });

  it("refuses a proposal too", async () => {
    const formData = new FormData();
    formData.set("intent", "propose");
    formData.set("csvText", ON_SCREEN.csvText as string);

    const state = await importRecruitsAction(EMPTY_RECRUIT_IMPORT_STATE, formData);

    expect(state.error).toMatch(/^You do not have access to this action\./);
    expect(planRecruitImport).not.toHaveBeenCalled();
  });

  it("refuses the template", async () => {
    const response = await GET();
    expect(response.status).toBe(403);
  });
});

describe("the template for a seat holding the switch", () => {
  it("is the empty template, as a CSV download", async () => {
    signedInWith(seededGrantsFor(["secretary"]));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("lancers-recruit-template.csv");
    const body = await response.text();
    expect(body.replace(/^﻿/, "").split("\r\n")[0]).toMatch(
      /^first_name,last_name,mobile,college_email,personal_email,/,
    );
    expect(body.split("\r\n").filter((line) => line !== "")).toHaveLength(1);
  });
});
