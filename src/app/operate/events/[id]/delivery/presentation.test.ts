/**
 * LAN-501 — **Unknown**, the delivery state of a message sent whose outcome
 * will never arrive, in the words and filters the delivery screen uses.
 */
import { describe, expect, it } from "vitest";

import {
  deliveryRowLabel,
  describeRetryability,
  matchesAttemptStatusFilter,
  matchesStatusFilter,
} from "./presentation";

describe("Unknown on the delivery screen — LAN-501", () => {
  it("is labelled Unknown and is not an exception over another state", () => {
    expect(
      deliveryRowLabel({ state: "unknown", noUsableRoute: false, whatsappUnresponsive: false }),
    ).toBe("Unknown");
  });

  it("is not Needs attention, Attempted or Failed", () => {
    for (const filter of ["attention", "attempted", "failed", "retryable", "delivered"]) {
      expect(matchesStatusFilter("unknown", filter), filter).toBe(false);
    }
  });

  it("selects an unknown attempt under none of the attempt filters", () => {
    const attempt = { outcome: "unknown" };
    for (const filter of ["attention", "failed", "attempted", "delivered", "not_delivered"]) {
      expect(matchesAttemptStatusFilter(attempt, filter), filter).toBe(false);
    }
  });

  it("offers nothing to repair", () => {
    expect(describeRetryability("unknown", 1, 5, false)).toBe("Sent — no outcome will arrive");
  });
});

describe("Withheld on the delivery screen — LAN-483", () => {
  it("is labelled Withheld", () => {
    expect(
      deliveryRowLabel({ state: "withheld", noUsableRoute: false, whatsappUnresponsive: false }),
    ).toBe("Withheld");
  });

  it("is not Needs attention, Failed or Retryable; a failure still is", () => {
    for (const filter of ["attention", "failed", "retryable", "attempted", "delivered"]) {
      expect(matchesStatusFilter("withheld", filter), filter).toBe(false);
    }
    expect(matchesStatusFilter("failed", "attention")).toBe(true);
    expect(matchesStatusFilter("retryable", "attention")).toBe(true);
  });

  it("says nothing further will be sent", () => {
    expect(describeRetryability("withheld", 1, 5, false)).toBe(
      "Withheld. Nothing further will be sent.",
    );
  });
});
