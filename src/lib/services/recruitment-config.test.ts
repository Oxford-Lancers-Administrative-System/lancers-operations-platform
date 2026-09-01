import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveRecruitmentGroupLink } from "./recruitment-config";

describe("resolveRecruitmentGroupLink", () => {
  it("returns the trimmed configured link", () => {
    expect(
      resolveRecruitmentGroupLink({
        RECRUITMENT_WHATSAPP_GROUP_LINK: " https://chat.whatsapp.com/x  ",
      }),
    ).toBe("https://chat.whatsapp.com/x");
  });

  it("returns null when unset", () => {
    expect(resolveRecruitmentGroupLink({})).toBeNull();
  });

  it("returns null for a blank value", () => {
    expect(resolveRecruitmentGroupLink({ RECRUITMENT_WHATSAPP_GROUP_LINK: "   " })).toBeNull();
  });
});
