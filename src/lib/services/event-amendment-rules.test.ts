import { describe, expect, it } from "vitest";

import {
  cancellationDefaultNotify,
  cancellationSilenceNeedsConfirmation,
  chaseThresholdOn,
  defaultNotify,
  diffAmendment,
  hasMaterialChange,
  isFutureEvent,
  isMaterial,
  isTerminal,
  MATERIAL_FIELDS,
  silenceNeedsConfirmation,
  type AmendableEvent,
} from "./event-amendment-rules";

/**
 * The four club rules W5 and W6 turn on, with no database anywhere near them.
 *
 * Every one of these is a decision rather than a query, which is why they were
 * split out of the service at all: "the tick starts on because the venue moved"
 * is a sentence Brian approved, and a test that needs an approved event with
 * thirty-seven invitations to check it is a test nobody reads.
 */

const BASE: AmendableEvent = {
  name: "Practice — michaelmas week 5",
  eventType: "practice",
  scheduledOn: "2026-11-11",
  startsAt: "20:00",
  endsAt: "22:00",
  deliveryMode: "in_person",
  venue: "Iffley Road Astro",
  description: "Full contact.",
  requiredEquipment: "Gumshield, boots",
  joiningUrl: null,
  isMandatory: true,
};

function moved(overrides: Partial<AmendableEvent>): AmendableEvent {
  return { ...BASE, ...overrides };
}

describe("diffAmendment", () => {
  it("reports nothing when nothing moved", () => {
    expect(diffAmendment(BASE, { ...BASE })).toEqual([]);
  });

  it("names the field, the label, and both values", () => {
    const changes = diffAmendment(BASE, moved({ venue: "University Parks" }));

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      field: "venue",
      label: "Venue",
      previous: "Iffley Road Astro",
      next: "University Parks",
      material: true,
    });
  });

  it("is not fooled by whitespace", () => {
    expect(diffAmendment(BASE, moved({ description: "Full contact.  " }))).toEqual([]);
    expect(diffAmendment(BASE, moved({ name: "  Practice — michaelmas week 5" }))).toEqual([]);
  });

  it("treats clearing a field as a change to nothing", () => {
    const changes = diffAmendment(BASE, moved({ requiredEquipment: null }));

    expect(changes).toHaveLength(1);
    expect(changes[0].next).toBeNull();
    expect(changes[0].previous).toBe("Gumshield, boots");
  });

  it("renders the two boolean-ish fields in the club's words", () => {
    expect(diffAmendment(BASE, moved({ isMandatory: false }))[0]).toMatchObject({
      previous: "Mandatory",
      next: "Optional",
      material: false,
    });
    expect(diffAmendment(BASE, moved({ deliveryMode: "online" }))[0]).toMatchObject({
      previous: "In person",
      next: "Online",
      material: true,
    });
  });

  it("reports every field that moved, in editor order", () => {
    const changes = diffAmendment(
      BASE,
      moved({ venue: "University Parks", requiredEquipment: "Gumshield" }),
    );

    expect(changes.map((change) => change.field)).toEqual(["venue", "requiredEquipment"]);
  });
});

describe("what counts as material — D55", () => {
  it("is date, time, venue and delivery mode, and nothing else", () => {
    expect([...MATERIAL_FIELDS]).toEqual([
      "scheduledOn",
      "startsAt",
      "endsAt",
      "deliveryMode",
      "venue",
    ]);
  });

  it("does not include name, description or equipment", () => {
    expect(isMaterial("name")).toBe(false);
    expect(isMaterial("description")).toBe(false);
    expect(isMaterial("requiredEquipment")).toBe(false);
  });

  it("says a mixed amendment has a material change in it", () => {
    const changes = diffAmendment(
      BASE,
      moved({ venue: "University Parks", requiredEquipment: "Gumshield" }),
    );
    expect(hasMaterialChange(changes)).toBe(true);
  });
});

describe("where the one tick starts", () => {
  const future = { isFuture: true };
  const past = { isFuture: false };

  it("starts on when the venue moved on a future event", () => {
    expect(defaultNotify(diffAmendment(BASE, moved({ venue: "Parks" })), future)).toBe(true);
  });

  it("starts on when the date moved, and when the time moved", () => {
    expect(defaultNotify(diffAmendment(BASE, moved({ scheduledOn: "2026-11-18" })), future)).toBe(
      true,
    );
    expect(defaultNotify(diffAmendment(BASE, moved({ startsAt: "19:00" })), future)).toBe(true);
  });

  it("starts off for description, equipment and name", () => {
    expect(defaultNotify(diffAmendment(BASE, moved({ description: "Light." })), future)).toBe(
      false,
    );
    expect(defaultNotify(diffAmendment(BASE, moved({ requiredEquipment: "Boots" })), future)).toBe(
      false,
    );
    expect(defaultNotify(diffAmendment(BASE, moved({ name: "Practice" })), future)).toBe(false);
  });

  it("starts off on a past event however much moved", () => {
    expect(defaultNotify(diffAmendment(BASE, moved({ venue: "Parks" })), past)).toBe(false);
  });
});

describe("silence has to be chosen", () => {
  it("asks before a future date, time or venue change goes out to nobody", () => {
    const changes = diffAmendment(BASE, moved({ venue: "University Parks" }));
    expect(silenceNeedsConfirmation(changes, { isFuture: true })).toBe(true);
  });

  it("asks nothing for a corrected spelling", () => {
    const changes = diffAmendment(BASE, moved({ description: "Full contact. Bring boots." }));
    expect(silenceNeedsConfirmation(changes, { isFuture: true })).toBe(false);
  });

  it("asks nothing about an event that has already happened", () => {
    const changes = diffAmendment(BASE, moved({ venue: "University Parks" }));
    expect(silenceNeedsConfirmation(changes, { isFuture: false })).toBe(false);
  });
});

describe("cancellation's defaults — D58 and D31", () => {
  it("tells everyone by default for a future event", () => {
    expect(cancellationDefaultNotify({ isFuture: true })).toBe(true);
    expect(cancellationSilenceNeedsConfirmation({ isFuture: true })).toBe(true);
  });

  it("is silent by default for a past one, and asks nothing", () => {
    expect(cancellationDefaultNotify({ isFuture: false })).toBe(false);
    expect(cancellationSilenceNeedsConfirmation({ isFuture: false })).toBe(false);
  });
});

describe("isFutureEvent", () => {
  it("counts today as future, because the people invited still are", () => {
    expect(isFutureEvent({ scheduledOn: "2026-11-11" }, "2026-11-11")).toBe(true);
  });

  it("counts yesterday as past", () => {
    expect(isFutureEvent({ scheduledOn: "2026-11-10" }, "2026-11-11")).toBe(false);
  });

  it("answers rather than throwing for an event with no date", () => {
    expect(isFutureEvent({ scheduledOn: null }, "2026-11-11")).toBe(false);
  });
});

describe("chaseThresholdOn — OD-1/Q6", () => {
  it("lands the type's threshold before the date the event now has", () => {
    // A game is seven days (D77); a practice is two (D75).
    expect(chaseThresholdOn("2026-11-11", 2)).toBe("2026-11-09");
    expect(chaseThresholdOn("2026-11-11", 7)).toBe("2026-11-04");
  });

  it("moves with the date, which is the whole point of recomputing it", () => {
    const before = chaseThresholdOn("2026-11-11", 2);
    const after = chaseThresholdOn("2026-12-09", 2);

    expect(before).toBe("2026-11-09");
    expect(after).toBe("2026-12-07");
    expect(after).not.toBe(before);
  });

  it("crosses a month boundary correctly", () => {
    expect(chaseThresholdOn("2026-12-01", 7)).toBe("2026-11-24");
  });

  it("has no answer for an event with no date", () => {
    expect(chaseThresholdOn(null, 2)).toBeNull();
  });
});

describe("isTerminal — D60", () => {
  it("is true for cancelled and false for the other two", () => {
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("approved")).toBe(false);
    expect(isTerminal("draft")).toBe(false);
  });
});
