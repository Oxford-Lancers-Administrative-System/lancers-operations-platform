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
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import SignupForm, { PARTIAL_SAVE_DELAY_MS, type SignupFieldValues } from "./signup-form";

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

/**
 * LAN-425 — the partial save, from the visitor's side: nothing on screen
 * changes, the first write waits for both names and a five-second pause,
 * every later pause patches with everything typed, one write in flight at a
 * time, and Sign me up carries the token instead of running the probe.
 */
describe("the partial save (LAN-425)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderAnonymous() {
    const startPartial = vi.fn().mockResolvedValue({ token: "tok-425", retry: false });
    const patchPartial = vi.fn().mockResolvedValue(undefined);
    const checkDuplicate = vi.fn().mockResolvedValue({ found: false });
    const submit = vi.fn().mockResolvedValue({ ok: true });
    render(
      <SignupForm
        mode="anonymous"
        initial={EMPTY}
        groupLink={null}
        checkDuplicate={checkDuplicate}
        startPartial={startPartial}
        patchPartial={patchPartial}
        submit={submit}
      />,
    );
    return { startPartial, patchPartial, checkDuplicate, submit };
  }

  const type = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it("waits for both names and the pause, then patches later changes with everything typed", async () => {
    vi.useFakeTimers();
    const { startPartial, patchPartial } = renderAnonymous();

    type(/^First name/, "Ian");
    await act(() => vi.advanceTimersByTimeAsync(PARTIAL_SAVE_DELAY_MS * 2));
    expect(startPartial).not.toHaveBeenCalled();

    type(/^Last name/, "Rowntree");
    await act(() => vi.advanceTimersByTimeAsync(PARTIAL_SAVE_DELAY_MS - 1));
    expect(startPartial).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(startPartial).toHaveBeenCalledTimes(1);
    expect(startPartial.mock.calls[0][0]).toMatchObject({
      givenName: "Ian",
      familyName: "Rowntree",
    });

    // Typing restarts the pause; the patch carries the state at the end of it.
    type(/^College$/, "Bal");
    await act(() => vi.advanceTimersByTimeAsync(PARTIAL_SAVE_DELAY_MS - 1000));
    type(/^College$/, "Balliol");
    await act(() => vi.advanceTimersByTimeAsync(PARTIAL_SAVE_DELAY_MS - 1000));
    expect(patchPartial).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(patchPartial).toHaveBeenCalledTimes(1);
    expect(patchPartial.mock.calls[0][0]).toBe("tok-425");
    expect(patchPartial.mock.calls[0][1]).toMatchObject({ college: "Balliol" });
    expect(startPartial).toHaveBeenCalledTimes(1);
  });

  it("stops trying after a refused start, and keeps trying after a throttled one", async () => {
    vi.useFakeTimers();
    const { startPartial } = renderAnonymous();
    startPartial
      .mockResolvedValueOnce({ token: null, retry: true })
      .mockResolvedValueOnce({ token: null, retry: false });

    type(/^First name/, "Ian");
    type(/^Last name/, "Rowntree");
    await act(() => vi.advanceTimersByTimeAsync(PARTIAL_SAVE_DELAY_MS));
    expect(startPartial).toHaveBeenCalledTimes(1);

    type(/^College$/, "Balliol");
    await act(() => vi.advanceTimersByTimeAsync(PARTIAL_SAVE_DELAY_MS));
    expect(startPartial).toHaveBeenCalledTimes(2);

    type(/^College$/, "Balliol College");
    await act(() => vi.advanceTimersByTimeAsync(PARTIAL_SAVE_DELAY_MS));
    expect(startPartial).toHaveBeenCalledTimes(2);
  });

  it("Sign me up runs the probe with the token, then carries the token", async () => {
    vi.useFakeTimers();
    const { startPartial, checkDuplicate, submit } = renderAnonymous();

    fillEverythingBar();
    fireEvent.change(numberBox(), { target: { value: "07700900123" } });
    fireEvent.change(confirmBox(), { target: { value: "07700900123" } });
    await act(() => vi.advanceTimersByTimeAsync(PARTIAL_SAVE_DELAY_MS));
    expect(startPartial).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Sign me up" }));
    await act(() => vi.runAllTimersAsync());
    expect(checkDuplicate).toHaveBeenCalledTimes(1);
    expect(checkDuplicate.mock.calls[0][2]).toBe("tok-425");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toMatchObject({ partialToken: "tok-425", consent: true });
  });

  it("an unconfirmed mobile is not sent with a partial; a confirmed one is", async () => {
    vi.useFakeTimers();
    const { startPartial, patchPartial } = renderAnonymous();

    type(/^First name/, "Ian");
    type(/^Last name/, "Rowntree");
    fireEvent.change(numberBox(), { target: { value: "07700900222" } });
    await act(() => vi.advanceTimersByTimeAsync(PARTIAL_SAVE_DELAY_MS));
    expect(startPartial).toHaveBeenCalledTimes(1);
    expect(startPartial.mock.calls[0][0]).toMatchObject({ mobile: "" });

    fireEvent.change(confirmBox(), { target: { value: "07700900222" } });
    await act(() => vi.advanceTimersByTimeAsync(PARTIAL_SAVE_DELAY_MS));
    expect(patchPartial).toHaveBeenCalledTimes(1);
    expect(patchPartial.mock.calls[0][1]).toMatchObject({ mobile: "+447700900222" });
  });

  it("a graduation before its matriculation turns the field red and holds Sign me up", () => {
    const { submit } = renderAnonymous();
    fillEverythingBar();
    fireEvent.change(numberBox(), { target: { value: "07700900123" } });
    fireEvent.change(confirmBox(), { target: { value: "07700900123" } });
    type(/^Matriculation year/, "2030");
    type(/^Expected graduation/, "2027");
    expect(
      screen.getByText("Expected graduation cannot be before the matriculation year."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign me up" })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("with no partial on file, Sign me up still runs the probe and sends no token", async () => {
    const { checkDuplicate, submit } = renderAnonymous();
    fillEverythingBar();
    fireEvent.change(numberBox(), { target: { value: "07700900123" } });
    fireEvent.change(confirmBox(), { target: { value: "07700900123" } });

    fireEvent.click(screen.getByRole("button", { name: "Sign me up" }));
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(checkDuplicate).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toMatchObject({ partialToken: null });
    // Let the saved screen land, so the state update is inside the test.
    await screen.findByText(/You.re in/);
  });
});
