/**
 * `/operate/people/new` — W3-01. LAN-185.
 *
 * The action-level suite (`actions.test.ts`) and the database suite
 * (`person-create.test.ts`) prove behaviour; this proves the page-level
 * refusal is total, and that the form renders for an authorized operator.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));

import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import AddPersonPage from "./page";

function signedInAs(roleCodes: string[]): void {
  const access: OperatorAccess = {
    state: "active",
    operator: {
      authUserId: "00000000-1111-4111-8111-111111111111",
      personId: "11111111-1111-4111-8111-111111111111",
      displayName: "Morgan Pike",
      roleCodes,
      isActive: true,
    },
  };
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

describe("an operator outside the four offices", () => {
  it("is refused, and no add-a-person form reaches the DOM", async () => {
    signedInAs(["treasurer"]);
    const element = await AddPersonPage();
    render(element);
    expect(screen.queryByText("Add a person")).toBeNull();
    expect(screen.getByTestId("operator-not-permitted")).toBeTruthy();
  });
});

describe("a four-role operator", () => {
  it("reaches the add-a-person form", async () => {
    signedInAs(["secretary"]);
    const element = await AddPersonPage();
    render(element);
    expect(screen.getByRole("heading", { name: "Add a person" })).toBeTruthy();
    expect(screen.getByLabelText(/first name/i)).toBeTruthy();
    expect(screen.getByLabelText(/last name/i)).toBeTruthy();
  });
});
