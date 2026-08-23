import { describe, expect, it } from "vitest";
import { labelFor } from "./labels";
import { MEMBERSHIP_STATUS_LABELS } from "./roster/presentation";
import { STATUS_LABELS, TYPE_LABELS } from "./events/presentation";
import { EVENT_STATUS_LABELS } from "./report/presentation";
import { EVENT_STATUSES, EVENT_TYPES } from "@/lib/services/event-input";

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
 * merge. Falling back to the raw value renders `strength_and_conditioning` where the
 * label is missing, which is ugly and self-explanatory. Falling back to an
 * empty string renders a blank cell, which reads as "this member has no status"
 * — the opposite of the truth, in the column an operator scans first.
 */
describe("labelFor", () => {
  it("gives the club's word for a value the map names", () => {
    expect(labelFor(MEMBERSHIP_STATUS_LABELS, "active")).toBe("Active");
    expect(labelFor(STATUS_LABELS, "approved")).toBe("Approved");
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
 * The report kept its own copy of this map and the copy had drifted: one status
 * read one word on the Monday report and another on every events screen, while
 * the report's comment asserted the two matched. Nothing anywhere asserted it,
 * so the two words coexisted through every green run.
 */
describe("the event status vocabulary", () => {
  it("names the three stored statuses, and nothing that is not one", () => {
    // LAN-151 narrowed `public.event_status` to three. `Occurred` is
    // deliberately absent: it is derived from the date rather than stored
    // (D30), and it has its own map so that a screen cannot show it in the
    // column that means "what the club decided about this event".
    expect(Object.keys(STATUS_LABELS)).toEqual(["draft", "approved", "cancelled"]);
  });

  it("gives the report and the events screens the same word for every status", () => {
    expect(EVENT_STATUS_LABELS).toEqual(STATUS_LABELS);
    for (const status of Object.keys(STATUS_LABELS)) {
      expect(labelFor(EVENT_STATUS_LABELS, status)).toBe(labelFor(STATUS_LABELS, status));
    }
  });

  /**
   * The link the two tests above stop one short of — LAN-151, finding VG-002.
   *
   * Both of them pin the maps to a list written out by hand, which proves the
   * maps agree with each other and with what somebody typed. It does not prove
   * they agree with the **vocabulary the service layer will hand them**, and
   * that is the join a screen breaks at: a status or a type the model has and
   * the map does not falls through `labelFor` and reaches an operator as a raw
   * enum value, and one the map has and the model does not becomes a filter
   * that can never match a row.
   *
   * `src/lib/services/events.test.ts` ties these constants to the enums the
   * database really holds, so with this in place the chain runs from the column
   * to the word on the screen.
   */
  it("labels exactly the vocabulary the service layer defines", () => {
    expect(Object.keys(STATUS_LABELS)).toEqual([...EVENT_STATUSES]);
    expect(Object.keys(TYPE_LABELS)).toEqual([...EVENT_TYPES]);
  });
});
