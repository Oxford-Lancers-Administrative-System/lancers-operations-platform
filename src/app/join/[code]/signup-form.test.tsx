// @vitest-environment jsdom
/**
 * LAN-389, entry point 1 of 10 (Clint, 2026-09-17) — the door Ian actually
 * came through, and the one his mistyped mobile came in on.
 *
 * This screen is the odd one out among the ten: it is not an HTML form. It
 * saves from a button's `onClick`, so the shared control has no submit event
 * to refuse, and the refusal arrives instead as a reason Sign me up stays
 * disabled — the same mechanism a malformed number already uses here.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import SignupForm, { type SignupFieldValues } from "./signup-form";

const EMPTY: SignupFieldValues = {
  givenName: "",
  familyName: "",
  mobile: "",
  collegeEmail: "",
  email: "",
  knownAs: "",
  college: "",
  matriculationYear: "",
  expectedGraduationYear: "",
  degreeField: "",
};

/** The form filled the way a recruit fills it, short of the mobile. */
function fillEverythingBar(): void {
  fireEvent.change(screen.getByLabelText(/^First name/), { target: { value: "Ian" } });
  fireEvent.change(screen.getByLabelText(/^Last name/), { target: { value: "Rowntree" } });
  fireEvent.change(screen.getByLabelText(/^College email/), {
    target: { value: "ian.rowntree@balliol.ox.ac.uk" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
}

function renderSignup(submit = vi.fn()) {
  render(<SignupForm mode="anonymous" initial={EMPTY} groupLink={null} submit={submit} />);
  return submit;
}

const numberBox = () => screen.getByRole("textbox", { name: /^Mobile number/ });
const confirmBox = () => screen.getByRole("textbox", { name: /^Confirm mobile number/ });

describe("the confirm box under Mobile number", () => {
  it("holds Sign me up while the two entries disagree, and signs nobody up", () => {
    const submit = renderSignup();
    fillEverythingBar();

    fireEvent.change(numberBox(), { target: { value: "07700900123" } });
    fireEvent.change(confirmBox(), { target: { value: "07700900132" } });

    expect(screen.getByText("Does not match the number above.")).toBeTruthy();
    const save = screen.getByRole("button", { name: "Sign me up" });
    expect(save).toBeDisabled();

    fireEvent.click(save);
    expect(submit).not.toHaveBeenCalled();
  });

  it("releases it once the two agree, and sends the first field's number", async () => {
    const submit = vi.fn().mockResolvedValue({ ok: true });
    renderSignup(submit);
    fillEverythingBar();

    fireEvent.change(numberBox(), { target: { value: "07700900123" } });
    fireEvent.change(confirmBox(), { target: { value: "07700900123" } });

    expect(screen.queryByText("Does not match the number above.")).toBeNull();
    const save = screen.getByRole("button", { name: "Sign me up" });
    expect(save).not.toBeDisabled();

    fireEvent.click(save);
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    // The stored value is the first field's, in the shape every other door
    // stores. `mobile` is the only thing sent that holds a number at all —
    // the confirm box's value reaches nothing.
    const sent = submit.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.mobile).toBe("+447700900123");
    expect(
      Object.entries(sent).filter(([, value]) => String(value).replace(/\D/g, "") !== ""),
    ).toEqual([["mobile", "+447700900123"]]);
  });
});
