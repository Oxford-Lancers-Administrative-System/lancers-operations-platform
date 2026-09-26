// @vitest-environment node
/**
 * The grant vocabulary and its resolution — LAN-429 (LAN-423). Pure: every
 * case is a snapshot built from rows, the way `resolveOperatorAccess` builds
 * one per request.
 */
import { WHOLE_RECORD_AUTHORITY } from "./roster-access";
import { describe, expect, it } from "vitest";

import { holdsAccess, accessRuleKey, type AccessRule } from "./access";
import { seededGrantsFor } from "./capabilities";
import {
  ACCESS_SWITCHES,
  diffGrants,
  fullGrants,
  grantAtLeast,
  grantRuleHolds,
  grantRuleKey,
  holdsAnyGrant,
  levelsFor,
  maximumLevel,
  mergeGrantRows,
  NO_GRANTS,
  RECRUITING_CATEGORIES,
  ROSTER_CATEGORIES,
  ROSTER_GROUP_KEYS,
  templatesAtLeast,
  type GrantRow,
} from "./grants";

const SOCIAL = "8de00424-52a8-52ad-9c9f-a29823f9c4bf";
const GAME = "67fbd6c7-1c6c-55d5-ab83-f85816c4c2ae";

function row(
  subject_kind: string,
  subject_key: string | null,
  level: string,
  template_id: string | null = null,
): GrantRow {
  return { subject_kind, subject_key, template_id, level };
}

describe("the vocabulary", () => {
  it("names the twelve roster categories, the three recruiting ones and the two switches", () => {
    expect([...ROSTER_CATEGORIES]).toEqual([
      "person",
      "contact_emergency",
      "onboarding",
      "membership",
      "availability",
      "coaching",
      "offensive",
      "defensive",
      "special_teams",
      "warmup",
      "kit",
      "attendance",
    ]);
    expect([...RECRUITING_CATEGORIES]).toEqual([
      "recruit_person",
      "recruit_details",
      "recruit_events",
    ]);
    expect([...ACCESS_SWITCHES]).toEqual(["add_to_roster", "add_recruits"]);
  });

  it("colours the ten board groups — every roster category but Contact & emergency and Attendance", () => {
    expect(ROSTER_GROUP_KEYS).toHaveLength(10);
    expect(ROSTER_GROUP_KEYS).not.toContain("contact_emergency");
    expect(ROSTER_GROUP_KEYS).not.toContain("attendance");
  });

  it("stops Event details at View and every other line at its own maximum", () => {
    expect(maximumLevel({ kind: "recruiting", key: "recruit_events" })).toBe("view");
    expect(maximumLevel({ kind: "recruiting", key: "recruit_details" })).toBe("edit");
    expect(maximumLevel({ kind: "roster", key: "kit" })).toBe("edit");
    // Round 6, M5: Attendance is None / View.
    expect(maximumLevel({ kind: "roster", key: "attendance" })).toBe("view");
    expect(levelsFor({ kind: "roster", key: "attendance" })).toEqual(["none", "view"]);
    expect(maximumLevel({ kind: "template", templateId: SOCIAL })).toBe("manage");
    expect(maximumLevel({ kind: "switch", key: "add_recruits" })).toBe("yes");
  });
});

describe("grantAtLeast — the level order", () => {
  const grants = mergeGrantRows([
    row("roster_category", "kit", "view"),
    row("event_template", null, "manage", SOCIAL),
    row("switch", "add_recruits", "yes"),
  ]);

  it("treats a higher level as holding every lower one", () => {
    expect(grantAtLeast(grants, { kind: "roster", key: "kit" }, "none")).toBe(true);
    expect(grantAtLeast(grants, { kind: "roster", key: "kit" }, "view")).toBe(true);
    expect(grantAtLeast(grants, { kind: "roster", key: "kit" }, "edit")).toBe(false);
    expect(grantAtLeast(grants, { kind: "template", templateId: SOCIAL }, "view")).toBe(true);
    expect(grantAtLeast(grants, { kind: "template", templateId: SOCIAL }, "manage")).toBe(true);
    expect(grantAtLeast(grants, { kind: "switch", key: "add_recruits" }, "yes")).toBe(true);
  });

  it("reads a line with no row as none — a template no seat named is not visible", () => {
    expect(grantAtLeast(grants, { kind: "roster", key: "person" }, "view")).toBe(false);
    expect(grantAtLeast(grants, { kind: "template", templateId: GAME }, "view")).toBe(false);
    expect(grantAtLeast(grants, { kind: "switch", key: "add_to_roster" }, "yes")).toBe(false);
  });

  it("never meets a minimum the line does not name", () => {
    const full = fullGrants([SOCIAL]);
    // `manage` is a template level; asking it of a roster category is a mistake, and a mistake is a refusal.
    expect(grantAtLeast(full, { kind: "roster", key: "kit" }, "manage" as unknown as "edit")).toBe(
      false,
    );
  });
});

describe("mergeGrantRows — the union across seats", () => {
  it("takes the highest level any seat holds on each line", () => {
    const treasurer = [
      row("roster_category", "kit", "view"),
      row("roster_category", "person", "edit"),
      row("event_template", null, "view", SOCIAL),
    ];
    const kitManager = [
      row("roster_category", "kit", "edit"),
      row("roster_category", "person", "none"),
      row("event_template", null, "none", SOCIAL),
      row("event_template", null, "manage", GAME),
    ];

    const merged = mergeGrantRows([...treasurer, ...kitManager]);
    expect(merged.roster.kit).toBe("edit");
    expect(merged.roster.person).toBe("edit");
    expect(merged.templates).toEqual({ [SOCIAL]: "view", [GAME]: "manage" });
    // Order does not matter.
    expect(mergeGrantRows([...kitManager, ...treasurer])).toEqual(merged);
  });

  it("grants nothing for a row outside the vocabulary or at a level its line does not admit", () => {
    const merged = mergeGrantRows([
      row("roster_category", "recruits", "edit"),
      row("recruiting_category", "recruit_events", "edit"),
      row("roster_category", "attendance", "edit"),
      row("switch", "add_to_roster", "edit"),
      row("records", "everything", "yes"),
    ]);
    expect(merged).toEqual(NO_GRANTS);
    expect(holdsAnyGrant(merged)).toBe(false);
  });

  it("is frozen", () => {
    const merged = mergeGrantRows([row("roster_category", "kit", "edit")]);
    expect(Object.isFrozen(merged)).toBe(true);
    expect(Object.isFrozen(merged.roster)).toBe(true);
    expect(Object.isFrozen(NO_GRANTS.roster)).toBe(true);
  });
});

describe("holdsAnyGrant and templatesAtLeast", () => {
  it("is false only when every line is none", () => {
    expect(holdsAnyGrant(NO_GRANTS)).toBe(false);
    expect(holdsAnyGrant(mergeGrantRows([row("event_template", null, "none", SOCIAL)]))).toBe(
      false,
    );
    expect(holdsAnyGrant(mergeGrantRows([row("event_template", null, "view", SOCIAL)]))).toBe(true);
    expect(holdsAnyGrant(mergeGrantRows([row("switch", "add_to_roster", "yes")]))).toBe(true);
  });

  it("lists the templates held at a minimum", () => {
    const grants = mergeGrantRows([
      row("event_template", null, "view", SOCIAL),
      row("event_template", null, "manage", GAME),
    ]);
    expect(templatesAtLeast(grants, "view").sort()).toEqual([SOCIAL, GAME].sort());
    expect(templatesAtLeast(grants, "manage")).toEqual([GAME]);
  });
});

describe("rules", () => {
  const kitManager = mergeGrantRows([
    row("roster_category", "kit", "edit"),
    row("roster_category", "person", "view"),
    row("event_template", null, "view", SOCIAL),
  ]);

  it("answers one line, any line of a group, and every line of a group", () => {
    expect(
      grantRuleHolds(kitManager, { subject: { kind: "roster", key: "kit" }, minimum: "edit" }),
    ).toBe(true);
    expect(grantRuleHolds(kitManager, { anyOf: "roster", minimum: "view" })).toBe(true);
    expect(grantRuleHolds(kitManager, { anyOf: "recruiting", minimum: "view" })).toBe(false);
    expect(grantRuleHolds(kitManager, { anyOf: "template", minimum: "view" })).toBe(true);
    expect(grantRuleHolds(kitManager, { anyOf: "template", minimum: "manage" })).toBe(false);
    expect(grantRuleHolds(kitManager, { everyOf: "roster", minimum: "view" })).toBe(false);
  });

  it("holds Event details to its own maximum under an every-line rule", () => {
    const full = fullGrants([]);
    expect(full.recruiting.recruit_events).toBe("view");
    expect(grantRuleHolds(full, { everyOf: "recruiting", minimum: "edit" })).toBe(true);
    // Attendance likewise: the whole record still reads as held at Edit.
    expect(full.roster.attendance).toBe("view");
    expect(grantRuleHolds(full, { everyOf: "roster", minimum: "edit" })).toBe(true);
  });

  it("names each rule for the refusal it produces", () => {
    expect(grantRuleKey({ subject: { kind: "roster", key: "kit" }, minimum: "edit" })).toBe(
      "grant:roster.kit>=edit",
    );
    expect(grantRuleKey({ anyOf: "template", minimum: "manage" })).toBe(
      "grant:any(template)>=manage",
    );
  });

  it("mixes capabilities and grants in one access rule", () => {
    const events: AccessRule = {
      either: [{ anyOf: "template", minimum: "view" }, "attendance_recording"],
    };
    expect(holdsAccess({ roleCodes: [], grants: kitManager }, events)).toBe(true);
    expect(holdsAccess({ roleCodes: ["head_coach"], grants: NO_GRANTS }, events)).toBe(true);
    expect(holdsAccess({ roleCodes: ["treasurer"], grants: NO_GRANTS }, events)).toBe(false);
    expect(holdsAccess(null, events)).toBe(false);
    expect(accessRuleKey(events)).toBe(
      "either(grant:any(template)>=view|capability:attendance_recording)",
    );
  });
});

describe("WHOLE_RECORD_AUTHORITY — merge's rule (LAN-432), the old whole-record meaning", () => {
  it("admits exactly the seeded full seats, and nobody else", () => {
    for (const code of [
      "president",
      "vice_president",
      "secretary",
      "general_manager",
      "it_officer",
    ]) {
      expect(grantRuleHolds(seededGrantsFor([code]), WHOLE_RECORD_AUTHORITY), code).toBe(true);
    }
    for (const code of ["treasurer", "kit_manager", "head_coach", "social_secretary"]) {
      expect(grantRuleHolds(seededGrantsFor([code]), WHOLE_RECORD_AUTHORITY), code).toBe(false);
    }
  });

  it("never widens: holding one category at Edit is not the whole record", () => {
    expect(
      grantRuleHolds(
        mergeGrantRows([row("roster_category", "person", "edit")]),
        WHOLE_RECORD_AUTHORITY,
      ),
    ).toBe(false);
  });
});

describe("diffGrants — what Copy access and Grant everything would change", () => {
  it("lists every line that differs, from and to, and nothing else", () => {
    const current = mergeGrantRows([
      row("roster_category", "kit", "edit"),
      row("event_template", null, "none", SOCIAL),
    ]);
    const target = fullGrants([SOCIAL]);

    const changes = diffGrants(current, target, [SOCIAL]);
    // Twelve roster lines less Kit, three recruiting, one template, two switches.
    expect(changes).toHaveLength(11 + 3 + 1 + 2);
    // Round 6, M5: Attendance moves to its own maximum, View.
    expect(
      changes.find(
        (change) => change.subject.kind === "roster" && change.subject.key === "attendance",
      ),
    ).toEqual({ subject: { kind: "roster", key: "attendance" }, from: "none", to: "view" });
    expect(changes.find((change) => change.subject.kind === "template")).toEqual({
      subject: { kind: "template", templateId: SOCIAL },
      from: "none",
      to: "manage",
    });
    expect(
      changes.some((change) => change.subject.kind === "roster" && change.subject.key === "kit"),
    ).toBe(false);
    expect(diffGrants(target, target, [SOCIAL])).toEqual([]);
  });
});
