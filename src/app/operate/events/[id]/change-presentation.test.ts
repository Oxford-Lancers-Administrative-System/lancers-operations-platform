/**
 * R156-B4 — `silenceConsequence` and `describeChange` printed a stored value
 * raw rather than rendered: a date read as `2026-11-11` and a delivery-mode
 * change read "told this is at In person", because both functions were only
 * ever exercised with a venue change. This file drives the date, start,
 * end and delivery-mode paths the existing suites left uncovered, alongside
 * one venue case each so the approved wording (`docs/ux/tickets/
 * LAN-156-amend-and-cancel.md`, W5-03b's mockup example) stays pinned.
 *
 * Fixtures go through the real `diffAmendment`, not a hand-built
 * `AmendmentChange`, because part of what R156-B4 found is that the raw
 * ISO date reached these two functions through the pipeline that produces a
 * real change — a hand-built fixture that skipped `diffAmendment` would
 * pre-format the value and prove nothing about the defect.
 */
import { describe, expect, it } from "vitest";
import {
  diffAmendment,
  type AmendableEvent,
  type AmendmentChange,
} from "@/lib/services/event-amendment-rules";
import { describeChange, silenceConsequence } from "./change-presentation";

const BASE: AmendableEvent = {
  name: "Practice",
  eventType: "practice",
  scheduledOn: "2026-11-11",
  startsAt: "19:00",
  endsAt: "21:00",
  deliveryMode: "in_person",
  venue: "Iffley Road Astro",
  description: "Full contact.",
  requiredEquipment: null,
  joiningUrl: null,
  isMandatory: true,
};

/** The one changed field, from a real `diffAmendment` over `BASE`. */
function changeFor(after: Partial<AmendableEvent>): AmendmentChange {
  const changes = diffAmendment(BASE, { ...BASE, ...after });
  expect(changes).toHaveLength(1);
  return changes[0];
}

describe("describeChange", () => {
  it("renders a venue change", () => {
    expect(describeChange(changeFor({ venue: "University Parks" }))).toBe(
      "Venue: Iffley Road Astro → University Parks",
    );
  });

  // R156-B4. Previously printed as "Date: 2026-11-11 → 2026-11-18", a raw
  // ISO date on both sides — `docs/ux/standards.md` rule 3.
  it("renders a date change as the club's written form, never a raw ISO date", () => {
    const result = describeChange(changeFor({ scheduledOn: "2026-11-18" }));
    expect(result).toBe("Date: 11 Nov 2026 → 18 Nov 2026");
    expect(result).not.toContain("2026-11-11");
    expect(result).not.toContain("2026-11-18");
  });

  it("renders a start-time change", () => {
    expect(describeChange(changeFor({ startsAt: "20:00" }))).toBe("Start: 19:00 → 20:00");
  });

  it("renders a delivery-mode change", () => {
    expect(describeChange(changeFor({ deliveryMode: "online" }))).toBe(
      "In person or online: In person → Online",
    );
  });
});

describe("silenceConsequence", () => {
  // The mockup's own worked example — W5-03b, `docs/ux/tickets/
  // LAN-156-amend-and-cancel.md` — pinned so the approved wording survives.
  it("says a venue change with 'at', as the approved copy does", () => {
    const result = silenceConsequence(37, [changeFor({ venue: "University Parks" })]);
    expect(result).toBe(
      "37 people were told this is at Iffley Road Astro. If you save without notifying, " +
        "nobody will be told it has changed to University Parks.",
    );
  });

  // R156-B4. Previously "told this is at 2026-11-11" — a raw ISO date behind
  // the wrong preposition; a date needs "on", not "at".
  it("says a date change with 'on', and the date formatted", () => {
    const result = silenceConsequence(12, [changeFor({ scheduledOn: "2026-11-18" })]);
    expect(result).toBe(
      "12 people were told this is on 11 Nov 2026. If you save without notifying, " +
        "nobody will be told it has changed to 18 Nov 2026.",
    );
    expect(result).not.toContain("2026-11-11");
    expect(result).not.toContain("2026-11-18");
  });

  it("says a start-time change with 'at'", () => {
    const result = silenceConsequence(9, [changeFor({ startsAt: "20:00" })]);
    expect(result).toBe(
      "9 people were told this is at 19:00. If you save without notifying, " +
        "nobody will be told it has changed to 20:00.",
    );
  });

  // R156-B4. Previously "told this is at In person" — the defect the
  // reviewer named. A delivery mode is not a place, so it takes no
  // preposition, and reads lower-case mid-sentence.
  it("says a delivery-mode change with no preposition, and lower-case", () => {
    const result = silenceConsequence(4, [changeFor({ deliveryMode: "online" })]);
    expect(result).toBe(
      "4 people were told this is in person. If you save without notifying, " +
        "nobody will be told it has changed to Online.",
    );
    expect(result).not.toContain("at In person");
    expect(result).not.toContain("at in person");
  });

  it("says an end-time change with 'at'", () => {
    const result = silenceConsequence(6, [changeFor({ endsAt: "22:00" })]);
    expect(result).toBe(
      "6 people were told this is at 21:00. If you save without notifying, " +
        "nobody will be told it has changed to 22:00.",
    );
  });
});
