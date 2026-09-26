/**
 * The player record narrowed to a seat — LAN-432. Pure; the database-backed
 * proof through the real page is `tests/player-record-payload.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import { mergeGrantRows } from "@/lib/auth/grants";
import type { PlayerRecordData } from "./player-record";
import { redactPlayerRecord } from "./player-record-access";

function seat(levels: Record<string, string>) {
  return mergeGrantRows(
    Object.entries(levels).map(([key, level]) => ({
      subject_kind: "roster_category",
      subject_key: key,
      template_id: null,
      level,
    })),
  );
}

const DATA = {
  membershipId: "m1",
  personId: "p1",
  seasonId: "s1",
  seasonLabel: "2026-27",
  status: "departed",
  entry: "new",
  confirmedOn: null,
  activatedOn: null,
  departedOn: null,
  expectedReturnOn: null,
  inactivityLabel: null,
  isConstitutionalMember: true,
  onboardingItems: [{ id: "i1" }],
  outstandingRequired: [],
  activityLog: [],
  statusHistory: [],
  season: {
    offencePosition: "QB",
    offenceBackupPosition: null,
    defencePosition: "CB",
    defenceBackupPosition: null,
    blueNumbers: ["7"],
    whiteNumbers: [],
    coachingGroups: ["Offense"],
    offensivePositionGroups: [],
    defensivePositionGroups: [],
    formalwear: { tie: true, bowtie: false },
    specialTeams: {},
    kit: { "kit:helmet": ["Speedflex M"] },
    warmupSmallGroup: null,
    blues: "Half",
    bps: "No",
    eligibility: "eligible",
    availability: "green",
  },
  positionOptions: { offence: [{ code: "QB", label: "Quarterback" }], defence: [] },
  jerseyHolders: { blue: { "7": "Someone" }, white: {} },
  otherSeasons: [],
  attendance: [{ id: "e1" }],
  person: { displayName: "Alaric Brindlewood" },
  send: { onboarding: true },
} as unknown as PlayerRecordData;

describe("redactPlayerRecord", () => {
  it("the Kit Manager receives the name, Kit and attendance, and no other category", () => {
    const visible = redactPlayerRecord(DATA, seat({ person: "view", kit: "edit" }));
    expect(visible.displayName).toBe("Alaric Brindlewood");
    expect(Object.keys(visible.season).sort()).toEqual(["formalwear", "kit"]);
    expect(visible.attendance).toHaveLength(1);
    for (const key of ["status", "entry", "onboardingItems", "send", "jerseyHolders", "person"]) {
      expect(key in visible, key).toBe(false);
    }
    expect(visible.positionOptions).toEqual({ offence: [], defence: [] });
    // A departed membership stays closed to writes without its status travelling.
    expect(visible.closed).toBe(true);
  });

  it("the coach receives the football groups and Availability, and no Membership", () => {
    const visible = redactPlayerRecord(
      DATA,
      seat({ person: "view", availability: "edit", coaching: "edit", offensive: "edit" }),
    );
    expect(visible.season.availability).toBe("green");
    expect(visible.season.offencePosition).toBe("QB");
    expect("defencePosition" in visible.season).toBe(false);
    expect("blueNumbers" in visible.season).toBe(false);
    expect(visible.access?.coaching).toBe("edit");
  });

  it("jersey holders travel only with Membership at edit", () => {
    expect(redactPlayerRecord(DATA, seat({ membership: "view" })).jerseyHolders).toBeUndefined();
    expect(redactPlayerRecord(DATA, seat({ membership: "edit" })).jerseyHolders).toEqual(
      DATA.jerseyHolders,
    );
  });
});
