// @vitest-environment node
/**
 * The recipient allowlist — LAN-124.
 *
 * This is the control that stands between an operator pressing **Approve** on
 * an event whose audience is the club's real roster and forty real students
 * receiving a WhatsApp message. It is tested the way a control is tested, not
 * the way a helper is: every way of writing a number that should match, every
 * way of writing one that should not, and every degenerate configuration that
 * could be mistaken for permission.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  parseRecipientAllowlist,
  RECIPIENT_ALLOWLIST_VARIABLE,
  RECIPIENT_NOT_PERMITTED_REASON,
  recipientPermitted,
} from "./allowlist";

const UK = "44";

/** Two numbers in Ofcom's reserved drama range, which can never be dialled. */
const BRIAN = "447700900001";
const STEWART = "447700900002";
const SOMEBODY_ELSE = "447700900123";

/**
 * A number outside the default calling code, in the North American
 * 555-01xx range that is reserved for fiction and cannot be dialled.
 *
 * It exists because every other fixture in this file is a United Kingdom
 * number, and a United Kingdom number is the one case that hid the defect in
 * `recipientPermitted` — bare `447…` digits start with the default calling
 * code, so `toE164` accepted them on the way in and again on the way back.
 */
const OVERSEAS = "12025550143";

describe("parsing", () => {
  it("reads a single number", () => {
    expect(parseRecipientAllowlist("+44 7700 900001", UK)).toEqual([BRIAN]);
  });

  it("reads several, however they were separated", () => {
    // A value pasted out of a runbook, a spreadsheet cell or a notes app.
    for (const raw of [
      "447700900001,447700900002",
      "447700900001, 447700900002",
      "447700900001;447700900002",
      "447700900001,\n447700900002",
      "447700900001\n447700900002",
    ]) {
      expect(parseRecipientAllowlist(raw, UK), raw).toEqual([BRIAN, STEWART]);
    }
  });

  it("keeps the spaces inside a number, because that is how people write them", () => {
    // The space is deliberately not a separator. If it were, this value would
    // parse to nothing at all and the deployment would silently refuse the one
    // person it was configured to permit.
    expect(parseRecipientAllowlist("+44 7700 900001", UK)).toEqual([BRIAN]);
    expect(parseRecipientAllowlist("+44 7700 900001, +44 7700 900002", UK)).toEqual([
      BRIAN,
      STEWART,
    ]);
    expect(parseRecipientAllowlist("07700 900001", UK)).toEqual([BRIAN]);
  });

  it("normalises every accepted spelling of one number to one entry", () => {
    // The whole point: a list holding "07700900001" must not admit a caller
    // presenting "+447700900001" by accident, nor refuse it.
    const parsed = parseRecipientAllowlist("07700900001, +447700900001, 447700900001", UK);
    expect(parsed).toEqual([BRIAN]);
  });

  it("is sorted and deduplicated, so ordering cannot change the answer", () => {
    expect(parseRecipientAllowlist("447700900002,447700900001", UK)).toEqual(
      parseRecipientAllowlist("447700900001,447700900002", UK),
    );
  });

  it("discards an entry it cannot convert rather than keeping it literally", () => {
    // A kept literal would look like a rule and match nothing — the worst
    // outcome, because the list would appear to name somebody it cannot admit.
    expect(parseRecipientAllowlist("not-a-number, 447700900001", UK)).toEqual([BRIAN]);
    expect(parseRecipientAllowlist("not-a-number", UK)).toEqual([]);
  });

  it("parses nothing out of nothing, and out of punctuation", () => {
    for (const raw of ["", "   ", ",", ",,", "; ,", "\n"]) {
      expect(parseRecipientAllowlist(raw, UK), JSON.stringify(raw)).toEqual([]);
    }
  });
});

describe("permitting", () => {
  const allowlist = [BRIAN, STEWART];

  it("permits a number on the list", () => {
    expect(recipientPermitted(BRIAN, allowlist, UK)).toBe(true);
    expect(recipientPermitted(STEWART, allowlist, UK)).toBe(true);
  });

  it("permits it however the caller spells it", () => {
    for (const spelling of ["07700900001", "+447700900001", "+44 7700 900001", "447700900001"]) {
      expect(recipientPermitted(spelling, allowlist, UK), spelling).toBe(true);
    }
  });

  it("refuses a number that is not on the list", () => {
    expect(recipientPermitted(SOMEBODY_ELSE, allowlist, UK)).toBe(false);
  });

  it("refuses a number that merely contains one that is", () => {
    // Substring matching would admit an entire numbering range. Asserted
    // explicitly because `includes` on a string rather than an array is a
    // one-character mistake with a very large blast radius.
    expect(recipientPermitted("4477009000012", allowlist, UK)).toBe(false);
    expect(recipientPermitted("1447700900001", allowlist, UK)).toBe(false);
  });

  it("refuses everybody when the list is empty", () => {
    // The fail-closed case, stated directly.
    expect(recipientPermitted(BRIAN, [], UK)).toBe(false);
    expect(recipientPermitted(SOMEBODY_ELSE, [], UK)).toBe(false);
    expect(recipientPermitted("", [], UK)).toBe(false);
  });

  it("refuses a recipient it cannot normalise", () => {
    expect(recipientPermitted("", allowlist, UK)).toBe(false);
    expect(recipientPermitted("not-a-number", allowlist, UK)).toBe(false);
  });

  it("refuses across a calling-code change rather than matching digits", () => {
    // `07700900001` read as a US number is not `+447700900001`, and must not
    // be admitted by a list built for the UK.
    expect(recipientPermitted("07700900001", allowlist, "1")).toBe(false);
  });
});

describe("a permitted number from outside the default calling code", () => {
  // The list is written the way the deployment holder writes it: an
  // international entry carries its `+`.
  const allowlist = parseRecipientAllowlist(`+${OVERSEAS}`, UK);

  it("is on the list at all", () => {
    expect(allowlist).toEqual([OVERSEAS]);
  });

  it("is permitted when it arrives as the E.164 digits the roster produced", () => {
    // The regression. `selectMobileNumber` returns bare E.164 digits, and
    // those digits do not start with the default calling code, do not start
    // with a trunk zero, and carry no `+` — the exact shape `toE164` refuses.
    // The number was therefore refused while being character-for-character
    // identical to the entry permitting it.
    expect(recipientPermitted(OVERSEAS, allowlist, UK)).toBe(true);
  });

  it("is permitted however the caller spells it", () => {
    for (const spelling of [OVERSEAS, `+${OVERSEAS}`, "+1 202 555 0143", "0012025550143"]) {
      expect(recipientPermitted(spelling, allowlist, UK), spelling).toBe(true);
    }
  });

  it("does not let the second reading admit anybody who is not on the list", () => {
    // The whole safety argument for reading a bare number as international is
    // that the result must still equal an entry somebody wrote down. Stated as
    // a test so that argument is checked rather than believed.
    expect(recipientPermitted("12025550144", allowlist, UK)).toBe(false);
    expect(recipientPermitted("442025550143", allowlist, UK)).toBe(false);
    expect(recipientPermitted(SOMEBODY_ELSE, allowlist, UK)).toBe(false);
  });

  it("is not admitted by a list that spells it without the `+`", () => {
    // The mirror-image rule: the allowlist side gets no fallback, because
    // there a misread entry grants delivery rather than withholding it. An
    // entry meant as international is written with a `+`.
    expect(parseRecipientAllowlist(OVERSEAS, UK)).toEqual([]);
    expect(recipientPermitted(OVERSEAS, parseRecipientAllowlist(OVERSEAS, UK), UK)).toBe(false);
  });

  it("does not double a `+` that is already there", () => {
    // `++1…` is not a number, and the fallback must not manufacture one out of
    // a recipient that already failed conversion on its own terms.
    expect(recipientPermitted("+notanumber", allowlist, UK)).toBe(false);
    expect(recipientPermitted("+", allowlist, UK)).toBe(false);
    expect(recipientPermitted("+12025550143000000", allowlist, UK)).toBe(false);
  });
});

describe("what a refused attempt says", () => {
  it("names no telephone number", () => {
    // The reason is written to `delivery_attempts.failure_reason` and rendered
    // on the delivery screen. The numbers behind this control are private.
    expect(RECIPIENT_NOT_PERMITTED_REASON).not.toMatch(/\d{4,}/);
  });

  it("says that nothing was sent and no link was issued", () => {
    expect(RECIPIENT_NOT_PERMITTED_REASON).toMatch(/nothing was sent/i);
    expect(RECIPIENT_NOT_PERMITTED_REASON).toMatch(/no RSVP link/i);
  });

  it("tells the reader whose decision it is, since an operator cannot lift it", () => {
    expect(RECIPIENT_NOT_PERMITTED_REASON).toMatch(/administrator/i);
  });
});

describe("the variable", () => {
  it("is named once, so configuration and documentation cannot drift", () => {
    expect(RECIPIENT_ALLOWLIST_VARIABLE).toBe("DELIVERY_RECIPIENT_ALLOWLIST");
  });
});
