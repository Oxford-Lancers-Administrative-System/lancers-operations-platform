// @vitest-environment jsdom
/**
 * `AddRecruitForm` — V-1 and V-10, correction round 2.
 *
 * `./actions` is mocked at the boundary (the same posture
 * `record-view.test.tsx` already uses for this door's sibling record) —
 * `actions.test.ts` already proves the server action's own logic against a
 * mocked service layer, and `recruitment-add.test.ts` proves the writes
 * against the real database. What this file proves is the form itself:
 * inline validation renders and blocks submission before any round trip,
 * and the one authorised explanatory paragraph is on the page.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({ submitAddRecruit: vi.fn() }));

import { submitAddRecruit } from "./actions";
import { INITIAL_ADD_RECRUIT_STATE } from "./create-state";
import AddRecruitForm from "./add-recruit-form";

describe("V-1, correction round 2 — inline phone and email validation", () => {
  it("shows no format error and an enabled Check button before anything is typed", () => {
    render(<AddRecruitForm seasonLabel="2026-27" />);
    expect(screen.getByTestId("add-recruit-check")).not.toBeDisabled();
    expect(screen.queryByTestId("add-recruit-format-invalid")).toBeNull();
  });

  it("shows an inline error and disables Check for duplicates the moment a malformed number is typed — never only after pressing it", async () => {
    const user = userEvent.setup();
    render(<AddRecruitForm seasonLabel="2026-27" />);

    const mobile = screen.getByTestId("mobile-field").querySelector("input") as HTMLInputElement;
    await user.type(mobile, "93939");

    expect(
      screen.getByText(/is not the right number of digits|has no country code/i),
    ).not.toBeNull();
    expect(screen.getByTestId("add-recruit-check")).toBeDisabled();
  });

  it("shows an inline error for a malformed email, using the shared validator's own message", async () => {
    const user = userEvent.setup();
    render(<AddRecruitForm seasonLabel="2026-27" />);

    const email = screen
      .getByTestId("personal-email-field")
      .querySelector("input") as HTMLInputElement;
    await user.type(email, "not-an-email");

    expect(screen.getByText(/does not look like an email address/i)).not.toBeNull();
    expect(screen.getByTestId("add-recruit-check")).toBeDisabled();
  });

  /**
   * LAN-275 correction round 1, F1. The college email was validated inline but
   * left out of the aggregate that disables the two submit controls, so a
   * non-Oxford address turned the field red and still let the operator press
   * Check for duplicates / Create — V-1 says both.
   *
   * `Create` only exists once the duplicate check has answered, so the check is
   * driven first (the action is mocked, and answers with an empty candidate
   * list) to bring that button onto the page before the malformed value is
   * typed.
   */
  it("disables both Check for duplicates and Create for a non-Oxford college email", async () => {
    const user = userEvent.setup();
    vi.mocked(submitAddRecruit).mockResolvedValue({
      ...INITIAL_ADD_RECRUIT_STATE,
      candidates: [],
    });
    render(<AddRecruitForm seasonLabel="2026-27" />);

    // The browser's own constraint validation refuses to submit a form with an
    // empty required field, so the four required fields are filled with valid
    // values first — the malformed one is typed afterwards.
    const named = (name: string) =>
      document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
    await user.type(named("givenName"), "Ada");
    await user.type(named("familyName"), "Nkemelu");
    const mobile = screen.getByTestId("mobile-field").querySelector("input") as HTMLInputElement;
    await user.type(mobile, "07700 900461");
    const collegeEmail = screen
      .getByTestId("college-email-field")
      .querySelector("input") as HTMLInputElement;
    await user.type(collegeEmail, "ada.nkemelu@balliol.ox.ac.uk");

    await user.click(screen.getByTestId("add-recruit-check"));
    const create = await screen.findByTestId("add-recruit-create");
    expect(create).not.toBeDisabled();

    await user.clear(collegeEmail);
    await user.type(collegeEmail, "someone@gmail.com");

    expect(screen.getByTestId("add-recruit-format-invalid").textContent).toContain(
      "Correct the field marked in red",
    );
    expect(screen.getByTestId("add-recruit-check")).toBeDisabled();
    expect(screen.getByTestId("add-recruit-create")).toBeDisabled();
  });

  it("clears the error and re-enables Check once the number is corrected", async () => {
    const user = userEvent.setup();
    render(<AddRecruitForm seasonLabel="2026-27" />);

    const mobile = screen.getByTestId("mobile-field").querySelector("input") as HTMLInputElement;
    await user.type(mobile, "93939");
    expect(screen.getByTestId("add-recruit-check")).toBeDisabled();

    await user.clear(mobile);
    await user.type(mobile, "07700 900461");
    expect(screen.getByTestId("add-recruit-check")).not.toBeDisabled();
  });
});

describe("V-10, correction round 2 — the opt-in evidence explains itself", () => {
  it("carries the explanatory paragraph and the plain-language labels, not the old unexplained ones", () => {
    render(<AddRecruitForm seasonLabel="2026-27" />);
    expect(screen.getByTestId("opt-in-explanation").textContent).toMatch(/why we ask/i);
    expect(screen.getByLabelText("How did their contact details reach you?")).not.toBeNull();
    expect(screen.getByLabelText(/Describe how, in your own words/i)).not.toBeNull();
    expect(screen.queryByLabelText("How we came by this number")).toBeNull();
    expect(screen.queryByLabelText("In your own words")).toBeNull();
  });
});

describe("V-2, correction round 2 — the widened field set", () => {
  it("offers Known as, expected graduation, degree, date of birth and the emergency contact, all optional", () => {
    render(<AddRecruitForm seasonLabel="2026-27" />);
    for (const label of [
      "Known as",
      "Expected graduation",
      "Degree field",
      "Date of birth",
      "First name", // inside the Emergency contact subsection, alongside "Who they are"'s own
      "Relationship",
      "Phone",
      "Email",
    ]) {
      expect(screen.getAllByLabelText(new RegExp(`^${label}`)).length).toBeGreaterThan(0);
    }
    // None of the widened fields carry MUI's `required` marker.
    expect(screen.getByLabelText("Known as")).not.toBeRequired();
  });
});
