import { describe, expect, it } from "vitest";
import { labelFor } from "./labels";
import { MEMBERSHIP_STATUS_LABELS } from "./roster/presentation";
import { STATUS_LABELS } from "./events/presentation";
import { EVENT_STATUS_LABELS } from "./report/presentation";

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

/**
 * One event status, one word for it — LAN-127 finding 2.
 *
 * The report kept its own copy of this map and the copy had drifted:
 * `pending_approval` read "Awaiting approval" on the Monday report and
 * "Pending approval" on every events screen, while the report's comment
 * asserted the two matched. Nothing anywhere asserted it, so the two words
 * coexisted through every green run.
 *
 * The approved wireframes decide which word is right: UX-30 and UX-33 both say
 * "Pending approval", and nothing in `docs/ux/` says "Awaiting approval".
 */
describe("the event status vocabulary", () => {
  it("says Pending approval, the word the approved wireframes use", () => {
    expect(labelFor(STATUS_LABELS, "pending_approval")).toBe("Pending approval");
  });

  it("gives the report and the events screens the same word for every status", () => {
    expect(EVENT_STATUS_LABELS).toEqual(STATUS_LABELS);
    for (const status of Object.keys(STATUS_LABELS)) {
      expect(labelFor(EVENT_STATUS_LABELS, status)).toBe(labelFor(STATUS_LABELS, status));
    }
  });
});
