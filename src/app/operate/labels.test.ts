import { describe, expect, it } from "vitest";
import { labelFor } from "./labels";
import { MEMBERSHIP_STATUS_LABELS } from "./roster/presentation";
import { STATUS_LABELS } from "./events/presentation";

/**
 * The lookup three screens share — and, mostly, the fallback.
 *
 * Independent review found this gap by injection: changing `?? value` to
 * `?? ""` left the entire suite green, because all three former copies were
 * untested too and consolidating them inherited that. The fallback is the only
 * part of a one-line function that can be wrong in a way anybody sees, so it is
 * the part that needs pinning.
 *
 * What it is protecting against: the club's vocabularies are stored values, and
 * a value can outlive the map that names it — a status added to the schema, a
 * seed carrying a type the screens predate, a map that loses an entry in a
 * merge. Falling back to the raw value renders `pending_approval` where the
 * label is missing, which is ugly and self-explanatory. Falling back to an
 * empty string renders a blank cell, which reads as "this member has no status"
 * — the opposite of the truth, in the column an operator scans first.
 */
describe("labelFor", () => {
  it("gives the club's word for a value the map names", () => {
    expect(labelFor(MEMBERSHIP_STATUS_LABELS, "active")).toBe("Active");
    expect(labelFor(STATUS_LABELS, "pending_approval")).toBe("Pending approval");
  });

  it("falls back to the value itself, never to blank", () => {
    expect(labelFor(STATUS_LABELS, "a_status_nobody_has_labelled")).toBe(
      "a_status_nobody_has_labelled",
    );
    expect(labelFor({}, "active")).toBe("active");
  });

  /**
   * The empty string is a value like any other, and `??` is deliberate: `||`
   * here would treat a legitimately empty label as missing and echo the raw
   * key back instead.
   */
  it("keeps a label the map really does define as empty", () => {
    expect(labelFor({ unnamed: "" }, "unnamed")).toBe("");
  });
});
