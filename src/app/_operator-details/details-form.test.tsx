/**
 * The operator details form — LAN-459, the content Brian approved on
 * 2 October 2026: personal information only, the right fields required, no
 * emergency contact, no student questions and no "Not now".
 *
 * jsdom lays nothing out, so the 375px case cannot measure widths. What it can
 * and does prove is the structure that makes the phone width work: one column
 * of full-width fields with no row layout to wrap, every field still present
 * and Save still the only way on when the viewport reports a phone.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  EMPTY_OPERATOR_DETAILS,
  OPERATOR_DETAILS_FIELDS,
  type OperatorDetailsFormState,
} from "@/lib/services/operator-details/fields";
import { OperatorDetailsForm } from "./details-form";

const VALUES = {
  ...EMPTY_OPERATOR_DETAILS,
  givenName: "Ansel",
  familyName: "Wexcombe",
  mobile: "+447700900123",
};

function viewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      // Below every `min-width` breakpoint at 375px; above them all on a desktop.
      matches: width < 600 ? !query.includes("min-width") : query.includes("min-width"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => cleanup());

const noop = vi.fn(async (state: OperatorDetailsFormState) => state);

describe.each([
  ["desktop", 1280],
  ["375px", 375],
])("the whole form, at %s", (_label, width) => {
  it("asks the seven personal fields, prefilled, and requires only names, mobile and personal email", () => {
    viewport(width);
    const { container } = render(
      <OperatorDetailsForm action={noop} values={VALUES} fields={OPERATOR_DETAILS_FIELDS} />,
    );

    const named = (name: string) =>
      container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    for (const field of OPERATOR_DETAILS_FIELDS) expect(named(field), field).not.toBeNull();
    expect(named("givenName")!.value).toBe("Ansel");
    expect(named("familyName")!.value).toBe("Wexcombe");
    expect(named("mobile")!.value).toBe("+447700900123");

    expect(screen.getByLabelText(/^First name/)).toBeRequired();
    expect(screen.getByLabelText(/^Last name/)).toBeRequired();
    expect(screen.getByLabelText(/^Personal email/)).toBeRequired();
    expect(screen.getByLabelText(/^Middle name/)).not.toBeRequired();
    expect(screen.getByLabelText(/^Known as/)).not.toBeRequired();

    // Nothing the ticket excludes.
    expect(container.textContent).not.toMatch(/emergency|college|matriculation|student/i);
    // Save is the only way on.
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toContain("Save");
    expect(screen.queryByRole("button", { name: /not now|skip|later/i })).toBeNull();
    // One column: every text field is a full-width control, none set side by
    // side (the phone control is the shared one every form uses at 375px).
    for (const name of ["givenName", "middleName", "familyName", "knownAs", "personalEmail"]) {
      expect(named(name)!.closest(".MuiTextField-root"), name).toHaveClass(
        "MuiFormControl-fullWidth",
      );
    }
  });
});

describe("a person asked only for what is missing", () => {
  it("shows only those fields", () => {
    viewport(375);
    const { container } = render(
      <OperatorDetailsForm action={noop} values={VALUES} fields={["personalEmail"]} />,
    );
    const inputs = [...container.querySelectorAll<HTMLInputElement>("input[name]")].map(
      (input) => input.name,
    );
    expect(inputs).toEqual(["personalEmail"]);
  });
});

describe("what the action hands back", () => {
  it("shows a field's refusal against the field", async () => {
    viewport(1280);
    const action = vi.fn(async () => ({
      values: VALUES,
      errors: { personalEmail: "Give a personal email, not a college address." },
    }));
    const { container } = render(
      <OperatorDetailsForm action={action} values={VALUES} fields={OPERATOR_DETAILS_FIELDS} />,
    );

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    expect(await screen.findByText("Give a personal email, not a college address.")).toBeVisible();
  });

  it("once saved from the link, shows the state and the address the invitation went to", async () => {
    viewport(375);
    const action = vi.fn(async () => ({
      values: VALUES,
      errors: {},
      saved: true,
      invitationEmail: "ansel@example.test",
    }));
    const { container } = render(
      <OperatorDetailsForm action={action} values={VALUES} fields={OPERATOR_DETAILS_FIELDS} />,
    );

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    const saved = await screen.findByTestId("section-operator-details-saved");
    expect(saved).toHaveTextContent("Details saved");
    expect(saved).toHaveTextContent("Sign-in invitation sent to");
    expect(saved).toHaveTextContent("ansel@example.test");
    expect(container.querySelector("form")).toBeNull();
  });
});
