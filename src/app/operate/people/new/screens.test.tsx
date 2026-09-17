/**
 * `/operate/people/new` — W3-01. LAN-185.
 *
 * The action-level suite (`actions.test.ts`) and the database suite
 * (`person-create.test.ts`) prove behaviour; this proves the page-level
 * refusal is total, and that the form renders for an authorized operator.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("./actions", async () => {
  const actual = await vi.importActual<typeof import("./actions")>("./actions");
  return { ...actual, submitCreatePerson: vi.fn() };
});

import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { submitCreatePerson } from "./actions";
import { EMPTY_VALUES } from "./create-state";
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

  // B4, LAN-185 correction round 2 (Brian's walk): a duplicate check that
  // finds nobody must still answer — previously nothing rendered and the
  // Create button just read "Create <name>", indistinguishable from the
  // check never having run.
  it("answers explicitly when the duplicate check finds nobody", async () => {
    signedInAs(["secretary"]);
    vi.mocked(submitCreatePerson).mockResolvedValue({
      values: { ...EMPTY_VALUES, givenName: "Brian", familyName: "Schuster" },
      errors: {},
      candidates: [],
      exactMatch: null,
    });

    const element = await AddPersonPage();
    const { container } = render(element);

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    expect(screen.getByTestId("candidate-count")).toHaveTextContent(
      "No existing person matches the supplied names or contact details.",
    );
  });
});

/**
 * LAN-389, entry point 5 of 10 (Clint, 2026-09-17). The control's own suite
 * (`src/components/phone-field.test.tsx`) proves the rule; this proves it
 * reached this form, and that the action never sees a number whose two
 * entries disagree.
 */
describe("the confirm box under Mobile phone", () => {
  it("refuses a mismatch here, and creates nobody", async () => {
    vi.mocked(submitCreatePerson).mockClear();
    signedInAs(["secretary"]);
    const element = await AddPersonPage();
    const { container } = render(element);

    fireEvent.change(screen.getByLabelText(/^Mobile phone/), {
      target: { value: "07700900123" },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm mobile phone/), {
      target: { value: "07700900132" },
    });

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    expect(submitCreatePerson).not.toHaveBeenCalled();
    expect(screen.getByText("Does not match the number above.")).toBeTruthy();
  });

  it("lets the same number through, and posts only the first", async () => {
    vi.mocked(submitCreatePerson).mockClear();
    signedInAs(["secretary"]);
    vi.mocked(submitCreatePerson).mockResolvedValue({
      values: EMPTY_VALUES,
      errors: {},
      candidates: [],
      exactMatch: null,
    });
    const element = await AddPersonPage();
    const { container } = render(element);

    fireEvent.change(screen.getByLabelText(/^Mobile phone/), {
      target: { value: "07700900123" },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm mobile phone/), {
      target: { value: "07700900123" },
    });

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    expect(submitCreatePerson).toHaveBeenCalled();
    const posted = vi.mocked(submitCreatePerson).mock.calls[0][1];
    expect(posted.get("mobile")).toBe("+447700900123");
    // Nothing in the form data carries the second entry.
    expect([...posted.keys()].filter((key) => key.toLowerCase().includes("confirm"))).toEqual([]);
  });
});
