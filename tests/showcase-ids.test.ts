// @vitest-environment node
/**
 * Deterministic identifiers for the showcase — LAN-124.
 *
 * These carry more weight than identifiers usually do. LAN-124 forbids the
 * visible `PILOT-LAN-124` sentinel that every `scripts/pilot/` scenario writes
 * into a name, because the showcase has to look like a living football
 * operation. So the deterministic half of the ownership convention is the whole
 * of it here: these UUIDs are what makes a rerun converge instead of
 * duplicating, and what makes rollback able to name exactly the rows the loader
 * would have created and nothing else.
 *
 * A collision, a non-determinism, or a namespace that silently changed would
 * therefore not be a tidy-identifier problem. It would be a loader that creates
 * a second roster on its second run, or a rollback that cannot find what it
 * wrote.
 */
import { describe, expect, it } from "vitest";

import { id, personKey, SHOWCASE_NAMESPACE, uuidV5 } from "../scripts/production/showcase/ids.mjs";

describe("the namespace", () => {
  it("is a well-formed UUID, since everything descends from it", () => {
    expect(SHOWCASE_NAMESPACE).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  });

  it("is pinned, because changing it silently reassigns every row", () => {
    // Not a tidiness check. If this constant moves, a rerun of the loader
    // creates a complete second copy of the showcase and a rollback written
    // against the new namespace cannot delete the rows written under the old.
    expect(SHOWCASE_NAMESPACE).toBe("5e17e2a4-1c24-4f00-9a24-000000124124");
  });
});

describe("uuidV5", () => {
  it("produces a v5 UUID with the RFC 4122 variant", () => {
    const value = uuidV5("anything");
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("matches the published RFC 4122 vector for the DNS namespace", () => {
    // The one case where the answer is known independently of this
    // implementation: v5 of "www.example.org" in the DNS namespace. Without
    // this, a self-consistent but wrong digest would pass every other test here.
    expect(uuidV5("www.example.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "74738ff5-5367-5958-9aee-98fffdcd1876",
    );
  });

  it("is deterministic across calls", () => {
    expect(uuidV5("Team Practice")).toBe(uuidV5("Team Practice"));
  });

  it("separates inputs that differ only slightly", () => {
    expect(uuidV5("Team Practice")).not.toBe(uuidV5("Team practice"));
    expect(uuidV5("a b")).not.toBe(uuidV5("a  b"));
  });

  it("refuses a namespace that is not a UUID rather than hashing nonsense", () => {
    expect(() => uuidV5("x", "not-a-uuid")).toThrow(/namespace/i);
    expect(() => uuidV5("x", "5e17e2a4-1c24-4f00-9a24-00000012412")).toThrow(/namespace/i);
  });
});

describe("id", () => {
  it("namespaces by table, so two rows from one natural key never collide", () => {
    // A person and the membership derived from that same person are different
    // rows. Without the table in the key they would be the same UUID, and the
    // second insert would silently update the first.
    expect(id("people", "alex smith")).not.toBe(id("season_memberships", "alex smith"));
  });

  it("joins its parts, so a composite key is stable", () => {
    expect(id("events", "MT26", "C7")).toBe(id("events", "MT26", "C7"));
    expect(id("events", "MT26", "C7")).not.toBe(id("events", "MT26", "C8"));
  });

  it("gives every distinct input a distinct identifier across a realistic set", () => {
    // Forty-two people, each with a person row, two memberships, an
    // availability record and an onboarding row — roughly the showcase's shape.
    const generated = new Set<string>();
    for (let index = 0; index < 42; index += 1) {
      const key = `person-${index}`;
      for (const table of [
        "people",
        "season_memberships:2025-26",
        "season_memberships:2026-27",
        "availability_records",
        "onboarding_requirements",
        "contact_points",
      ]) {
        generated.add(id(table, key));
      }
    }
    expect(generated.size).toBe(42 * 6);
  });
});

describe("personKey", () => {
  it("collapses whitespace and case, so a re-typed name is the same person", () => {
    expect(personKey("  Alex   Smith ")).toBe("alex smith");
    expect(id("people", personKey("Alex  Smith"))).toBe(id("people", personKey("alex smith")));
  });

  it("keeps punctuation, because merging two people is worse than two rows", () => {
    // "O'Brien" and "OBrien" are different people until somebody says
    // otherwise. A loader that silently merged them would be unrecoverable
    // without knowing it had happened.
    expect(personKey("O'Brien")).not.toBe(personKey("OBrien"));
    expect(personKey("Anne-Marie")).not.toBe(personKey("Anne Marie"));
  });
});
