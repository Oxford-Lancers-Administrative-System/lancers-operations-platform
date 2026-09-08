/**
 * `./details-form.tsx` — LAN-216, correction round 2, B-009.
 *
 * Brian's screenshot: a mobile of `398393` and an email of `b@b.com` sitting
 * accepted, with Chrome's own "Please fill out this field" bubble pointing at
 * an unrelated field. This suite proves the replacement: the browser's own
 * validation is off (`noValidate`), and whatever `saveDetails` returns is
 * rendered under the field it names, in this app's own styling, with the
 * player's own typed values still in the box — never a redirect, never a
 * generic banner. `./actions.test.ts` proves what `saveDetails` itself
 * computes; this proves the screen does the right thing with it.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("./actions", () => ({ saveDetails: vi.fn() }));

import { saveDetails } from "./actions";
import { DetailsForm, type DetailsFormProps } from "./details-form";
import { EMPTY_DETAILS_VALUES, type DetailsFormValues } from "./validation";

const NO_META = {
  given_name: { source: null, disputed: false },
  family_name: { source: null, disputed: false },
  college: { source: null, disputed: false },
  matriculation_year: { source: null, disputed: false },
  expected_graduation_year: { source: null, disputed: false },
  degree_field: { source: null, disputed: false },
  date_of_birth: { source: null, disputed: false },
} satisfies DetailsFormProps["meta"];

const FILLED_VALUES: DetailsFormValues = {
  given_name: "Jordan",
  family_name: "Ashworth",
  mobile: "07700 900000",
  personal_email: "jordan@example.com",
  college: "St Peter's",
  matriculation_year: "2023",
  expected_graduation_year: "2026",
  degree_field: "Engineering",
  date_of_birth: "2004-01-01",
  ec_given_name: "Alex",
  ec_family_name: "Ashworth",
  ec_relationship: "Parent",
  ec_phone: "07700 900001",
  ec_email: "alex@example.com",
};

function renderForm(initialValues: DetailsFormValues = EMPTY_DETAILS_VALUES) {
  return render(
    <DetailsForm
      token="tok"
      needsConsentStep={false}
      isReturning={false}
      initialValues={initialValues}
      meta={NO_META}
    />,
  );
}

/** The text of whatever `aria-describedby` points the input at — the exact
 *  wiring `helperText` produces, so this breaks the moment that prop is
 *  removed rather than merely when the message text changes. */
function describedTextFor(input: HTMLElement): string {
  const ids = input.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
  return ids
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")
    .trim();
}

async function submit(container: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.submit(container.querySelector("form")!);
  });
}

/**
 * MUI's label text always includes the required asterisk (a plain "*"
 * character, `aria-hidden` but still part of the label's `textContent`, which
 * is what `getByLabelText` actually matches against). Anchoring to the start
 * of the label picks out e.g. "First name" without also matching "Emergency
 * contact first name", and without needing to spell out the asterisk.
 */
function labelStartingWith(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
}

describe("the browser's own validation is off", () => {
  it("submits a form with every required field blank without the browser refusing it", async () => {
    vi.mocked(saveDetails).mockResolvedValue({ values: EMPTY_DETAILS_VALUES, errors: {} });
    const { container } = renderForm();

    expect(container.querySelector("form")).toHaveAttribute("noValidate");
    await submit(container);

    expect(saveDetails).toHaveBeenCalled();
  });
});

describe("a required field left empty", () => {
  it("renders the error under that field, not as a page-level banner", async () => {
    vi.mocked(saveDetails).mockResolvedValue({
      values: { ...FILLED_VALUES, given_name: "" },
      errors: { given_name: "First name is required." },
    });
    const { container } = renderForm();

    await submit(container);

    const input = screen.getByLabelText(labelStartingWith("First name"));
    expect(describedTextFor(input)).toContain("First name is required.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    // Every other field stays clean.
    expect(describedTextFor(screen.getByLabelText(labelStartingWith("Mobile phone")))).toBe("");
  });
});

describe("a badly shaped mobile or email", () => {
  it("says what is wrong with the value, under the mobile field", async () => {
    vi.mocked(saveDetails).mockResolvedValue({
      values: { ...FILLED_VALUES, mobile: "398393" },
      errors: { mobile: "This does not look like a phone number." },
    });
    const { container } = renderForm();

    await submit(container);

    expect(describedTextFor(screen.getByLabelText(labelStartingWith("Mobile phone")))).toContain(
      "This does not look like a phone number.",
    );
  });

  it("says what is wrong with the value, under the personal email field", async () => {
    vi.mocked(saveDetails).mockResolvedValue({
      values: { ...FILLED_VALUES, personal_email: "b@b.com" },
      errors: { personal_email: "This does not look like an email address." },
    });
    const { container } = renderForm();

    await submit(container);

    expect(describedTextFor(screen.getByLabelText(labelStartingWith("Personal email")))).toContain(
      "This does not look like an email address.",
    );
  });

  it("says what is wrong with the value, under the emergency contact email field", async () => {
    vi.mocked(saveDetails).mockResolvedValue({
      values: FILLED_VALUES,
      errors: { ec_email: "This does not look like an email address." },
    });
    const { container } = renderForm();

    await submit(container);

    expect(
      describedTextFor(screen.getByLabelText(labelStartingWith("Emergency contact email"))),
    ).toContain("This does not look like an email address.");
  });
});

describe("focus", () => {
  it("moves to the first invalid field in screen order, not merely the first one named in the error map", async () => {
    // `mobile` is named first in the object literal below; `family_name`
    // comes first on screen (`DETAILS_FIELD_ORDER`) and must win.
    vi.mocked(saveDetails).mockResolvedValue({
      values: FILLED_VALUES,
      errors: { mobile: "bad", family_name: "Last name is required." },
    });
    const { container } = renderForm();

    await submit(container);

    expect(document.activeElement).toBe(screen.getByLabelText(labelStartingWith("Last name")));
  });
});

describe("what the player typed survives a failed submit", () => {
  it("renders every field from the values the action returned, including a field the player only just edited", async () => {
    // A real `saveDetails` echoes back exactly the `FormData` it was given —
    // `398393` and `b@b.com` are the two values Brian's own screenshot showed
    // sitting accepted. This state is what a real failed submission looks
    // like: the two edited fields carry the player's new text, and the field
    // the action never touched keeps its own value.
    vi.mocked(saveDetails).mockResolvedValue({
      values: { ...FILLED_VALUES, mobile: "398393", personal_email: "b@b.com" },
      errors: { mobile: "This does not look like a phone number." },
    });
    const { container } = renderForm(FILLED_VALUES);

    await submit(container);

    expect(
      (screen.getByLabelText(labelStartingWith("Mobile phone")) as HTMLInputElement).value,
    ).toBe("398393");
    expect(
      (screen.getByLabelText(labelStartingWith("Personal email")) as HTMLInputElement).value,
    ).toBe("b@b.com");
    expect((screen.getByLabelText(labelStartingWith("College")) as HTMLInputElement).value).toBe(
      FILLED_VALUES.college,
    );
  });
});
