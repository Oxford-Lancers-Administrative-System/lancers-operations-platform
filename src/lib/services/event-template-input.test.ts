/**
 * What a template may hold, and what it deliberately may not — LAN-154, W8.
 *
 * Pure. What editing one does to real drafts is `event-templates.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  describeDuration,
  endTimeFromStart,
  MAX_TEMPLATE_DURATION_MINUTES,
  MIN_TEMPLATE_DURATION_MINUTES,
  validateEventTemplate,
  type RawEventTemplate,
} from "./event-template-input";

function template(overrides: Partial<RawEventTemplate> = {}): RawEventTemplate {
  return {
    defaultVenue: "",
    defaultDeliveryMode: "unset",
    defaultDurationMinutes: "",
    defaultDescription: "",
    defaultRequiredEquipment: "",
    defaultAttendance: "unset",
    audienceGroups: [],
    ...overrides,
  };
}

function accepted(raw: RawEventTemplate) {
  const outcome = validateEventTemplate(raw);
  if (!outcome.ok)
    throw new Error(`Expected this template to be accepted: ${JSON.stringify(outcome.issues)}`);
  return outcome.value;
}

describe("every field is optional (Brian, 2026-08-21)", () => {
  it("accepts a template that has decided nothing at all", () => {
    // "the template does not mean that everything needs to be changed ... You
    // can have some details not decided."
    const value = accepted(template());

    expect(value.defaultVenue).toBeNull();
    expect(value.defaultDeliveryMode).toBeNull();
    expect(value.defaultDurationMinutes).toBeNull();
    expect(value.defaultDescription).toBeNull();
    expect(value.defaultRequiredEquipment).toBeNull();
    expect(value.defaultIsMandatory).toBeNull();
    expect(value.audienceGroups).toEqual([]);
  });

  it("keeps mandatory-or-optional a tri-state, because undecided is not optional", () => {
    expect(accepted(template({ defaultAttendance: "unset" })).defaultIsMandatory).toBeNull();
    expect(accepted(template({ defaultAttendance: "optional" })).defaultIsMandatory).toBe(false);
    expect(accepted(template({ defaultAttendance: "mandatory" })).defaultIsMandatory).toBe(true);
  });

  it("treats whitespace as undecided rather than as a value", () => {
    expect(accepted(template({ defaultVenue: "   " })).defaultVenue).toBeNull();
  });
});

describe("a default length, never a default start time (D78)", () => {
  it("accepts a duration in five-minute steps", () => {
    expect(accepted(template({ defaultDurationMinutes: "120" })).defaultDurationMinutes).toBe(120);
  });

  it("refuses a duration that is not a five-minute step", () => {
    const outcome = validateEventTemplate(template({ defaultDurationMinutes: "97" }));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.issues[0].field).toBe("defaultDurationMinutes");
  });

  it("refuses a duration outside the schema's own bounds", () => {
    for (const minutes of [
      String(MIN_TEMPLATE_DURATION_MINUTES - 5),
      String(MAX_TEMPLATE_DURATION_MINUTES + 5),
    ]) {
      expect(validateEventTemplate(template({ defaultDurationMinutes: minutes })).ok).toBe(false);
    }
  });

  it("refuses something that is not a number", () => {
    expect(validateEventTemplate(template({ defaultDurationMinutes: "two hours" })).ok).toBe(false);
  });

  it("has nowhere at all to put a start time, a date or a name", () => {
    // Brian, 2026-08-21: "the name is always going to be unique ... Usual time
    // doesn't make any sense to me. That is not a field you would have." A type
    // recurs; a particular Wednesday does not.
    const value = accepted(template({ defaultDurationMinutes: "90" }));

    expect(Object.keys(value).sort()).toEqual([
      "audienceGroups",
      "defaultDeliveryMode",
      "defaultDescription",
      "defaultDurationMinutes",
      "defaultIsMandatory",
      "defaultRequiredEquipment",
      "defaultVenue",
    ]);
  });

  it("carries no RSVP timing of any kind, because that is Mission 4's", () => {
    // W8 removed the chase threshold from the template on 2026-08-21 — "That
    // should be answered by 4 ... Did you just include something from mission 4
    // in mission 2?" It lives in `event_type_settings` instead.
    const value = accepted(template());

    expect(JSON.stringify(value)).not.toContain("chase");
    expect(JSON.stringify(value)).not.toContain("deadline");
    expect(JSON.stringify(value)).not.toContain("remind");
  });
});

describe("the end a start implies", () => {
  it("fills the end from the start and the default length", () => {
    expect(endTimeFromStart("20:00", 120)).toBe("22:00");
    expect(endTimeFromStart("19:30", 90)).toBe("21:00");
  });

  it("says nothing when either half is unknown", () => {
    expect(endTimeFromStart(null, 120)).toBeNull();
    expect(endTimeFromStart("20:00", null)).toBeNull();
  });

  it("wraps past midnight rather than refusing, because a social really does", () => {
    // The event's own `events_times_ordered` constraint decides whether the
    // pair is legal; this function only does the arithmetic.
    expect(endTimeFromStart("23:00", 120)).toBe("01:00");
  });
});

describe("in person or online (D20)", () => {
  it("refuses a delivery mode outside the two", () => {
    const outcome = validateEventTemplate(template({ defaultDeliveryMode: "hybrid" }));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.issues[0].field).toBe("defaultDeliveryMode");
  });
});

describe("the default audience is groups, never people (D47)", () => {
  it("keeps the groups it was given, without repeating one", () => {
    const value = accepted(
      template({ audienceGroups: ["active_players", "active_players", "active_coaches"] }),
    );

    expect(value.audienceGroups).toEqual(["active_players", "active_coaches"]);
  });
});

describe("how a default length reads on screen", () => {
  it("says hours and minutes in the club's words", () => {
    expect(describeDuration(120)).toBe("2 hours");
    expect(describeDuration(90)).toBe("1 hour 30 minutes");
    expect(describeDuration(45)).toBe("45 minutes");
    expect(describeDuration(60)).toBe("1 hour");
  });

  it("says a template that has not decided has not decided", () => {
    expect(describeDuration(null)).toBe("Not set");
  });
});
