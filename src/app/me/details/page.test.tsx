/**
 * `/me/details` — LAN-459. The signed-in operator details form: shown only
 * while it is due, to the session's own person, with no way past it but Save.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({
  resolveOperatorAccess: vi.fn(),
  resolveOperator: vi.fn(),
}));
vi.mock("@/lib/services/operator-details", () => ({
  readOperatorDetailsDue: vi.fn(),
  readOperatorDetailsView: vi.fn(),
  saveOperatorDetails: vi.fn(),
}));

import { resolveOperator, resolveOperatorAccess } from "@/lib/auth/operator";
import {
  readOperatorDetailsDue,
  readOperatorDetailsView,
  saveOperatorDetails,
} from "@/lib/services/operator-details";
import {
  EMPTY_OPERATOR_DETAILS,
  OPERATOR_DETAILS_FIELDS,
} from "@/lib/services/operator-details/fields";
import MyOperatorDetailsPage from "./page";
import { saveMyOperatorDetails } from "./actions";

const PERSON_ID = "00000000-0000-4000-8000-000000000459";
const OPERATOR = {
  authUserId: "00000000-0000-4000-8000-0000000459bb",
  personId: PERSON_ID,
  displayName: "Ansel Wexcombe",
  roleCodes: ["running_backs_coach"],
  grants: {} as never,
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: OPERATOR });
  vi.mocked(resolveOperator).mockResolvedValue(OPERATOR);
  vi.mocked(readOperatorDetailsView).mockResolvedValue({
    personId: PERSON_ID,
    missing: ["mobile"],
    fields: OPERATOR_DETAILS_FIELDS,
    values: { ...EMPTY_OPERATOR_DETAILS, givenName: "Ansel", familyName: "Wexcombe" },
  });
});

describe("the page", () => {
  it("shows the form, for the session's own person, while it is due", async () => {
    vi.mocked(readOperatorDetailsDue).mockResolvedValue(true);

    render(await MyOperatorDetailsPage());

    expect(readOperatorDetailsDue).toHaveBeenCalledWith(PERSON_ID);
    expect(screen.getByRole("heading", { name: "Your details" })).toBeVisible();
    expect(screen.getByTestId("operator-details-form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /not now/i })).toBeNull();
    // Not the operator shell: the app comes after the form.
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("sends an operator whose form is not due on to the app", async () => {
    vi.mocked(readOperatorDetailsDue).mockResolvedValue(false);
    await expect(MyOperatorDetailsPage()).rejects.toThrow("REDIRECT:/operate");
  });

  it("sends a visitor with no session to sign in", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "no_session" });
    await expect(MyOperatorDetailsPage()).rejects.toThrow(
      "REDIRECT:/login?redirectTo=%2Fme%2Fdetails",
    );
  });
});

describe("the save", () => {
  function form(values: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  }

  it("saves the session's own details, never a person the form names, then opens the app", async () => {
    vi.mocked(saveOperatorDetails).mockResolvedValue({ ok: true, email: "a@example.test" });

    await expect(
      saveMyOperatorDetails(
        { values: EMPTY_OPERATOR_DETAILS, errors: {} },
        form({ personId: "11111111-1111-4111-8111-111111111111", givenName: "Ansel" }),
      ),
    ).rejects.toThrow("REDIRECT:/operate");
    expect(saveOperatorDetails).toHaveBeenCalledWith(
      expect.objectContaining({ personId: PERSON_ID, actorPersonId: PERSON_ID }),
    );
  });

  it("hands a refusal back to the form", async () => {
    vi.mocked(saveOperatorDetails).mockResolvedValue({
      ok: false,
      errors: { mobile: "Mobile phone is required." },
    });

    const state = await saveMyOperatorDetails(
      { values: EMPTY_OPERATOR_DETAILS, errors: {} },
      form({ givenName: "Ansel" }),
    );
    expect(state.errors).toEqual({ mobile: "Mobile phone is required." });
  });
});
