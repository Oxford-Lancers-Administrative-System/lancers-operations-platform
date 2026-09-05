import { describe, expect, it } from "vitest";
import {
  ONBOARDING_CHASE_FIELDS,
  onboardingChaseChanged,
  readOnboardingChaseChange,
  type OnboardingChaseChange,
} from "./onboarding-chase-validation";

function form(overrides: Partial<OnboardingChaseChange> = {}): FormData {
  const values = { firstChaseAfterHours: 48, chaseCount: 4, chaseIntervalDays: 3, ...overrides };
  const data = new FormData();
  for (const field of ONBOARDING_CHASE_FIELDS) data.set(field.key, String(values[field.key]));
  return data;
}

describe("readOnboardingChaseChange", () => {
  it("reads a legal submission", () => {
    const result = readOnboardingChaseChange(form());
    expect(result).toEqual({
      ok: true,
      change: { firstChaseAfterHours: 48, chaseCount: 4, chaseIntervalDays: 3 },
    });
  });

  it("accepts a chase count of zero", () => {
    const result = readOnboardingChaseChange(form({ chaseCount: 0 }));
    expect(result.ok).toBe(true);
  });

  it("refuses a blank field, naming it", () => {
    const data = form();
    data.set("chaseIntervalDays", "");
    const result = readOnboardingChaseChange(data);
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/Every.*blank/) });
  });

  it("refuses a non-integer field", () => {
    const data = form();
    data.set("firstChaseAfterHours", "12.5");
    const result = readOnboardingChaseChange(data);
    expect(result).toEqual({
      ok: false,
      message: expect.stringMatching(/First chase after joining.*whole number/),
    });
  });

  it("refuses a value outside the database's own bounds", () => {
    const result = readOnboardingChaseChange(form({ chaseCount: 51 }));
    expect(result).toEqual({
      ok: false,
      message: expect.stringMatching(/Ask this many times.*between 0 and 50/),
    });
  });
});

describe("onboardingChaseChanged", () => {
  const current: OnboardingChaseChange = {
    firstChaseAfterHours: 48,
    chaseCount: 4,
    chaseIntervalDays: 3,
  };

  it("is false for an identical submission", () => {
    expect(onboardingChaseChanged(current, { ...current })).toBe(false);
  });

  it("is true when any one of the three values differs", () => {
    expect(onboardingChaseChanged(current, { ...current, chaseCount: 5 })).toBe(true);
  });
});
