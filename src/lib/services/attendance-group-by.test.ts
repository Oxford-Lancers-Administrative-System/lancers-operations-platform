// @vitest-environment node
/**
 * LAN-497 — Group by on the attendance register: who is offered which family,
 * how a link is read, and how the sections are built. Pure.
 */
import { describe, expect, it } from "vitest";

import { NO_GRANTS, type OperatorGrants } from "@/lib/auth/grants";
import type { AttendanceParticipant } from "./attendance-vocabulary";
import {
  attendanceGroupByStorageKey,
  parseAttendanceGroupBy,
  visibleAttendanceGroupFamilies,
} from "./attendance-group-by";
import { registerSections } from "../../app/operate/events/[id]/attendance/presentation";

function grantsWith(levels: Partial<OperatorGrants["roster"]>): OperatorGrants {
  return { ...NO_GRANTS, roster: { ...NO_GRANTS.roster, ...levels } };
}

function person(
  name: string,
  groups: AttendanceParticipant["groups"],
  overrides: Partial<AttendanceParticipant> = {},
): AttendanceParticipant {
  return {
    key: `player:${name}`,
    displayName: name,
    capacity: "player",
    rsvp: null,
    isWalkUp: false,
    presence: null,
    recordedAt: null,
    recordedByName: null,
    mismatch: null,
    groups,
    ...overrides,
  };
}

describe("which families a viewer is offered", () => {
  it("offers a family only with View or Edit on its roster category, each independently", () => {
    expect(visibleAttendanceGroupFamilies(NO_GRANTS)).toEqual([]);
    expect(visibleAttendanceGroupFamilies(null)).toEqual([]);
    expect(visibleAttendanceGroupFamilies(grantsWith({ warmup: "view" }))).toEqual(["warmup"]);
    expect(
      visibleAttendanceGroupFamilies(grantsWith({ offensive: "edit", coaching: "view" })),
    ).toEqual(["coaching", "offensive"]);
    expect(
      visibleAttendanceGroupFamilies(
        grantsWith({ coaching: "view", offensive: "view", defensive: "view", warmup: "view" }),
      ),
    ).toEqual(["coaching", "offensive", "defensive", "warmup"]);
  });

  it("is not opened by a neighbouring category such as Special teams", () => {
    expect(visibleAttendanceGroupFamilies(grantsWith({ special_teams: "edit" }))).toEqual([]);
  });
});

describe("reading ?by= from a link", () => {
  it("accepts a family the viewer may see", () => {
    expect(parseAttendanceGroupBy("warmup", ["warmup"])).toBe("warmup");
  });

  it("ignores a family the viewer may not see, and anything that is not a family", () => {
    expect(parseAttendanceGroupBy("coaching", ["warmup"])).toBeNull();
    expect(parseAttendanceGroupBy("rsvp", ["warmup"])).toBeNull();
    expect(parseAttendanceGroupBy(undefined, ["warmup"])).toBeNull();
    expect(parseAttendanceGroupBy(["warmup"], ["warmup"])).toBeNull();
  });

  it("remembers per viewer", () => {
    expect(attendanceGroupByStorageKey("a")).not.toBe(attendanceGroupByStorageKey("b"));
  });
});

describe("the sections a family draws", () => {
  const leo = person("Leo Hartwell", { offensive: ["Quarterbacks", "Offensive Line"] });
  const avery = person("Avery Fielding", { offensive: ["Offensive Line"] });
  const zane = person("Zane Archer", { offensive: ["Offensive Line"] });
  const nora = person("Nora Vale", { offensive: [] });
  const coach = person("Casey North", { offensive: [] }, { key: "coach:x", capacity: "coach" });
  const walkUp = person("Wren Walker", { offensive: [] }, { key: "walk:x", isWalkUp: true });

  it("runs in vocabulary order, names A–Z, a repeat in each of its groups, then No group, then Walk-ups", () => {
    const sections = registerSections(
      [zane, walkUp, nora, leo, coach, avery],
      "practice",
      "offensive",
    );

    expect(sections.map((section) => section.label)).toEqual([
      "Offensive Line",
      "Quarterbacks",
      "No offensive position group",
      "Walk-ups",
    ]);
    expect(sections[0].participants.map((p) => p.displayName)).toEqual([
      "Avery Fielding",
      "Leo Hartwell",
      "Zane Archer",
    ]);
    expect(sections[1].participants.map((p) => p.displayName)).toEqual(["Leo Hartwell"]);
    // The very same record under both headings, not a copy.
    expect(sections[1].participants[0]).toBe(sections[0].participants[1]);
    expect(sections[2].participants.map((p) => p.displayName)).toEqual([
      "Casey North",
      "Nora Vale",
    ]);
    expect(sections[3].participants.map((p) => p.displayName)).toEqual(["Wren Walker"]);
  });

  it("opens every group section and Walk-ups, and closes the no-group section", () => {
    const sections = registerSections([leo, nora, walkUp], "practice", "offensive");
    expect(sections.map((section) => [section.key, section.defaultOpen])).toEqual([
      ["group-offensive-line", true],
      ["group-quarterbacks", true],
      ["no-group", false],
      ["walk_ups", true],
    ]);
  });

  it("never removes anybody: every participant is in at least one section", () => {
    const everyone = [zane, walkUp, nora, leo, coach, avery];
    const placed = new Set(
      registerSections(everyone, "practice", "offensive").flatMap((section) =>
        section.participants.map((p) => p.key),
      ),
    );
    expect(placed).toEqual(new Set(everyone.map((p) => p.key)));
  });

  it("puts somebody whose family was not sent in the no-group section", () => {
    const unsent = person("Ula Unsent", undefined);
    const sections = registerSections([unsent], "practice", "warmup");
    expect(sections.find((section) => section.key === "no-group")?.participants).toEqual([unsent]);
    expect(sections[0].label).toBe("No warmup group");
  });

  it("keeps a value outside the vocabulary, after the vocabulary's", () => {
    const odd = person("Odd One", { warmup: ["Zebra"] });
    const king = person("King One", { warmup: ["Kings"] });
    const sections = registerSections([odd, king], "practice", "warmup");
    expect(sections.map((section) => section.label).slice(0, 2)).toEqual(["Kings", "Zebra"]);
  });

  it("puts recruits in the no-group section on a recruitment event", () => {
    const recruit = person(
      "Rory Recruit",
      { warmup: [] },
      { key: "recruit:x", capacity: "recruit" },
    );
    const king = person("King One", { warmup: ["Kings"] });
    const sections = registerSections([recruit, king], "recruitment", "warmup");
    expect(sections.find((section) => section.key === "no-group")?.participants).toEqual([recruit]);
  });

  it("is today's register with no family chosen", () => {
    const yes = person("Yes Person", undefined, { rsvp: "yes" });
    const sections = registerSections([yes, nora, walkUp], "practice", null);
    expect(sections.map((section) => [section.key, section.defaultOpen])).toEqual([
      ["attending", true],
      ["everyone_else", false],
      ["walk_ups", true],
    ]);
  });
});
