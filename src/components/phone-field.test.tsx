// @vitest-environment jsdom
/**
 * LAN-390 — Clint relaying Ian, 2026-09-17: the phone entry box opened a
 * regular keyboard rather than a phone keypad. What a mobile browser opens is
 * decided by two attributes on the box a person types into, and neither is
 * visible in a screenshot or provable by reading a form: every one of the ten
 * phone entry points reaches this one control, so the attributes are pinned
 * here, once, against a regression that would only ever be seen on a handset.
 *
 * The country selector is deliberately not covered by that: it is a menu, not
 * a typed value, and opening a keypad over it would be wrong.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PhoneField, PHONE_CONFIRM_MISMATCH_MESSAGE } from "@/components/phone-field";

describe("PhoneField — mobile keyboard", () => {
  it("asks a handset for the phone keypad on the national-number box", () => {
    render(<PhoneField name="mobile" label="Mobile number" />);

    const box = screen.getByLabelText("Mobile number");
    expect(box.getAttribute("inputmode")).toBe("tel");
    expect(box.getAttribute("type")).toBe("tel");
  });

  it("leaves the country selector alone — it is chosen, not typed", () => {
    render(<PhoneField name="mobile" label="Mobile number" />);

    const country = screen.getByLabelText("Country code for mobile number");
    expect(country.getAttribute("inputmode")).toBeNull();
  });
});

/**
 * LAN-389 — Clint, 2026-09-17: Ian's number was mistyped at sign-up and he
 * never received a message. Brian's decision is a confirm box under every
 * phone entry whose only job is to refuse a submission whose two entries
 * disagree. The second value is not a fact about anybody: it is never named,
 * never posted and never stored.
 *
 * All ten entry points reach this control, so the behaviour is proved once
 * here; each form's own screens test proves it arrived there.
 */
describe("PhoneField — confirm", () => {
  function FormHarness({
    onSubmit,
    defaultValue,
    ...props
  }: { onSubmit: (data: FormData) => void; defaultValue?: string } & Partial<
    React.ComponentProps<typeof PhoneField>
  >) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(new FormData(event.currentTarget));
        }}
      >
        <PhoneField name="mobile" label="Mobile number" defaultValue={defaultValue} {...props} />
        <button type="submit">Save</button>
      </form>
    );
  }

  const confirmBox = () => screen.getByLabelText(/^Confirm mobile number/);

  it("offers a confirm box under the number, sharing the first field's country", () => {
    render(<PhoneField name="mobile" label="Mobile number" />);

    expect(confirmBox()).not.toBeNull();
    expect(screen.getByLabelText("Country code for confirm mobile number").textContent).toBe("+44");
  });

  it("follows a change of country code, so only the national number is retyped", async () => {
    const user = userEvent.setup();
    render(<PhoneField name="mobile" label="Mobile number" />);

    await user.click(screen.getByLabelText("Country code for mobile number"));
    await user.click(screen.getByRole("option", { name: "United States +1" }));

    expect(screen.getByLabelText("Country code for confirm mobile number").textContent).toBe("+1");
  });

  it("submits when the two entries agree, and posts only the first", async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();
    render(<FormHarness onSubmit={submitted} />);

    await user.type(screen.getByLabelText("Mobile number"), "07700900123");
    await user.type(confirmBox(), "07700900123");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(submitted).toHaveBeenCalledTimes(1);
    const posted = submitted.mock.calls[0][0] as FormData;
    expect(posted.get("mobile")).toBe("+447700900123");
    // Whatever the confirm box holds, no entry in the form data carries it.
    expect([...posted.entries()]).toEqual([["mobile", "+447700900123"]]);
  });

  it("refuses a mismatch, saves nothing, and puts the error on the confirm box", async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();
    render(<FormHarness onSubmit={submitted} />);

    await user.type(screen.getByLabelText("Mobile number"), "07700900123");
    await user.type(confirmBox(), "07700900132");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(submitted).not.toHaveBeenCalled();
    expect(screen.getByText(PHONE_CONFIRM_MISMATCH_MESSAGE)).not.toBeNull();
    expect(confirmBox().getAttribute("aria-invalid")).toBe("true");
    // And the number box is not the one being complained about.
    expect(screen.getByLabelText("Mobile number").getAttribute("aria-invalid")).toBe("false");
  });

  it("treats spacing and the trunk zero as the same number, because the stored value is", async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();
    render(<FormHarness onSubmit={submitted} />);

    await user.type(screen.getByLabelText("Mobile number"), "07700 900123");
    await user.type(confirmBox(), "7700900123");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it("asks nothing of an untouched number already on file", async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();
    render(<FormHarness onSubmit={submitted} defaultValue="+447700900123" />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(submitted).toHaveBeenCalledTimes(1);
    expect(confirmBox().getAttribute("required")).toBeNull();
  });

  it("asks for confirmation once a number on file is changed", async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();
    render(<FormHarness onSubmit={submitted} defaultValue="+447700900123" />);

    await user.clear(screen.getByLabelText("Mobile number"));
    await user.type(screen.getByLabelText("Mobile number"), "7700900999");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(submitted).not.toHaveBeenCalled();

    await user.type(confirmBox(), "7700900999");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it("asks nothing of an empty optional number — the operator invite's case", async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();
    render(<FormHarness onSubmit={submitted} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(submitted).toHaveBeenCalledTimes(1);
    expect(submitted.mock.calls[0][0].get("mobile")).toBe("");
  });

  it("asks nothing when a number on file is cleared away", async () => {
    const user = userEvent.setup();
    const submitted = vi.fn();
    render(<FormHarness onSubmit={submitted} defaultValue="+447700900123" />);

    await user.clear(screen.getByLabelText("Mobile number"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(submitted).toHaveBeenCalledTimes(1);
  });
});
