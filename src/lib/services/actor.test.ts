// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isServiceError } from "@/lib/db";
import { actorRequirement } from "./actor";

/**
 * The guard that keeps invariant M2 honest — LAN-127 finding 4.
 *
 * Four aggregates checked this before writing, with three different guards
 * between them. The strictest is now the only one, and this is what "strictest"
 * buys: through the application the actor is typed `string` and none of these
 * cases can arise, but the service functions are exported and
 * `src/lib/services/README.md` requires them to be callable from a test with an
 * arbitrary actor. For those callers the difference is between the club's own
 * refusal and a `TypeError` thrown from somewhere deeper — after, possibly,
 * something has already been written.
 */
describe("actorRequirement", () => {
  const requireActor = actorRequirement(
    "A membership change has to name the operator who made it.",
  );

  it("accepts a real actor", () => {
    expect(() => requireActor("2c1f9e10-0000-4000-8000-000000000000")).not.toThrow();
  });

  it("refuses an empty or blank actor in the club's words", () => {
    for (const value of ["", "   ", "\t\n"]) {
      let caught: unknown;
      try {
        requireActor(value);
      } catch (error) {
        caught = error;
      }
      expect(isServiceError(caught)).toBe(true);
      expect((caught as { kind: string }).kind).toBe("constraint_violated");
      expect((caught as { rule?: string }).rule).toBe("audit_events_has_an_actor");
      expect((caught as Error).message).toBe(
        "A membership change has to name the operator who made it.",
      );
    }
  });

  /**
   * The reason the strict guard was adopted everywhere rather than dropped.
   * Before, three of the four aggregates would have thrown `TypeError:
   * actorPersonId.trim is not a function` here.
   */
  it("refuses a non-string actor as a refusal, not a TypeError", () => {
    for (const value of [null, undefined, 42, {}, [], true]) {
      let caught: unknown;
      try {
        requireActor(value as unknown as string);
      } catch (error) {
        caught = error;
      }
      expect(caught).not.toBeInstanceOf(TypeError);
      expect(isServiceError(caught)).toBe(true);
      expect((caught as { rule?: string }).rule).toBe("audit_events_has_an_actor");
    }
  });

  it("keeps each aggregate's own sentence", () => {
    const attendance = actorRequirement("An attendance record has to name who recorded it.");
    expect(() => attendance("")).toThrow("An attendance record has to name who recorded it.");
    expect(() => requireActor("")).toThrow(
      "A membership change has to name the operator who made it.",
    );
  });
});
