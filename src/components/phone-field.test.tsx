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
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PhoneField } from "@/components/phone-field";

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
