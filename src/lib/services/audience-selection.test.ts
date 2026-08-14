// @vitest-environment node
/**
 * The pure audience-selection rules, tested directly.
 *
 * This file exists because two defects in this module shipped, and both were
 * invisible from where its only coverage lived. `screens.test.tsx` exercises it
 * through a React component against one five-candidate fixture — which is the
 * right place to test the *screen*, and the wrong place to be the only test of
 * a person-versus-key distinction.
 *
 * The first defect removed group members by person, silently dropping anybody a
 * different group had selected. The second — found by independent review of the
 * fix for the first — is that a removal keyed by `anchorId` rather than by `key`
 * passes every screen test, because in that fixture players anchor on a
 * membership id and committee members on a person id, so the two never collide.
 * They do collide for somebody who is both a **coach and a committee member**:
 * both capacities anchor on `people.id`, so the same anchor appears under two
 * keys.
 *
 * The club has such people. The fixture below does.
 *
 * Everything here is pure — no database, no React, no `server-only`.
 */
import { describe, expect, it } from "vitest";

import {
  AUDIENCE_GROUPS,
  groupIsSelected,
  groupSelectionKeys,
  groupSize,
  resolveSelection,
  selectionKey,
  toggleGroup,
  type AudienceCandidate,
} from "./audience-selection";

function candidate(
  capacity: AudienceCandidate["capacity"],
  anchorId: string,
  personId: string,
  displayName: string,
): AudienceCandidate {
  return {
    key: selectionKey(capacity, anchorId),
    capacity,
    anchorId,
    personId,
    displayName,
    standing: capacity === "player" ? "Active" : "Seat",
    unit: null,
    contact: null,
  };
}

/**
 * A club with all three overlaps the real one has.
 *
 * * **Bo** plays and nothing else — the simple case.
 * * **Ada** plays and sits on the committee — anchors differ (membership vs
 *   person), which is the overlap the screen fixture already covers.
 * * **Cy** coaches and sits on the committee — **anchors are identical**,
 *   because both capacities hang off `people.id`. This is the case that
 *   distinguishes removal by `key` from removal by `anchorId`.
 * * **Di** is on the committee only.
 */
const ADA = "person-ada";
const CY = "person-cy";

const CLUB: AudienceCandidate[] = [
  candidate("player", "membership-bo", "person-bo", "Bo Rivers"),
  candidate("player", "membership-ada", ADA, "Ada Kettle"),
  candidate("committee", ADA, ADA, "Ada Kettle"),
  candidate("coach", CY, CY, "Cy Marchbank"),
  candidate("committee", CY, CY, "Cy Marchbank"),
  candidate("committee", "person-di", "person-di", "Di Ashgrove"),
];

const PLAYERS = "active_players";
const COACHES = "active_coaches";
const COMMITTEE = "active_committee";
const EVERYONE = "everyone_active";

/** The people a selection resolves to, by name, for readable assertions. */
function peopleNamed(selected: ReadonlySet<string>): string[] {
  const resolution = resolveSelection(CLUB, [...selected]);
  return resolution.ok ? resolution.members.map((member) => member.displayName).sort() : [];
}

describe("group sizes count people, not rows", () => {
  it("counts the union once for everyone-active", () => {
    // Six rows, four humans.
    expect(CLUB).toHaveLength(6);
    expect(groupSize(CLUB, EVERYONE)).toBe(4);
  });

  it("counts each narrower group by its own members", () => {
    expect(groupSize(CLUB, PLAYERS)).toBe(2);
    expect(groupSize(CLUB, COACHES)).toBe(1);
    expect(groupSize(CLUB, COMMITTEE)).toBe(3);
  });

  it("offers everyone-active first", () => {
    expect(AUDIENCE_GROUPS[0].key).toBe(EVERYONE);
  });
});

describe("pressing a group adds exactly its own keys", () => {
  it("adds a group to an empty selection", () => {
    const next = toggleGroup(CLUB, PLAYERS, new Set());
    expect([...next].sort()).toEqual(groupSelectionKeys(CLUB, PLAYERS).sort());
    expect(peopleNamed(next)).toEqual(["Ada Kettle", "Bo Rivers"]);
  });

  it("unions with what is already selected", () => {
    const players = toggleGroup(CLUB, PLAYERS, new Set());
    const both = toggleGroup(CLUB, COMMITTEE, players);
    expect(peopleNamed(both)).toEqual(["Ada Kettle", "Bo Rivers", "Cy Marchbank", "Di Ashgrove"]);
  });
});

describe("pressing a lit group removes exactly its own keys", () => {
  it("keeps somebody a different group put there", () => {
    // The original defect: Ada is a player and on the committee. Undoing the
    // committee group must not take away her player selection.
    const players = toggleGroup(CLUB, PLAYERS, new Set());
    const both = toggleGroup(CLUB, COMMITTEE, players);

    const undone = toggleGroup(CLUB, COMMITTEE, both);

    expect(peopleNamed(undone)).toEqual(["Ada Kettle", "Bo Rivers"]);
    expect(undone.has(selectionKey("player", "membership-ada"))).toBe(true);
  });

  it("removes one capacity of a person who holds two that share an anchor", () => {
    // The defect independent review predicted would pass every screen test.
    // Cy is a coach AND on the committee, and both anchor on the same person id,
    // so `coach:person-cy` and `committee:person-cy` differ only by capacity.
    // Removing by anchor would take both; removing by key takes one.
    const coaches = toggleGroup(CLUB, COACHES, new Set());
    const both = toggleGroup(CLUB, COMMITTEE, coaches);
    expect(both.has(selectionKey("coach", CY))).toBe(true);
    expect(both.has(selectionKey("committee", CY))).toBe(true);

    const withoutCommittee = toggleGroup(CLUB, COMMITTEE, both);

    expect(withoutCommittee.has(selectionKey("coach", CY))).toBe(true);
    expect(withoutCommittee.has(selectionKey("committee", CY))).toBe(false);
    // Cy is still invited — as a coach, which is what "remove the committee
    // group" should leave behind.
    expect(peopleNamed(withoutCommittee)).toEqual(["Cy Marchbank"]);
  });

  it("clears everything when everyone-active is un-pressed", () => {
    const all = toggleGroup(CLUB, EVERYONE, new Set());
    expect(toggleGroup(CLUB, EVERYONE, all).size).toBe(0);
  });
});

describe("a lit group whose own keys are not selected", () => {
  /**
   * The known consequence of lighting by person and removing by key, disclosed
   * in `toggleGroup` and pinned here so a later change cannot alter it silently.
   *
   * After a save and reload the stored audience holds ONE key per person, at
   * their highest-precedence capacity. Ada comes back as a player only, so the
   * committee button is lit — everybody in that group is invited — while none of
   * its own keys are present.
   */
  const RESTORED = new Set([selectionKey("player", "membership-ada")]);

  it("is lit, because everybody in it is invited", () => {
    expect(groupIsSelected(CLUB, COMMITTEE, RESTORED)).toBe(false);
    // Di and Cy are not in the restored selection, so the committee group is not
    // fully covered. Narrow it to a club where it is.
    const adaOnly = CLUB.filter((entry) => entry.personId === ADA);
    expect(groupIsSelected(adaOnly, COMMITTEE, RESTORED)).toBe(true);
  });

  it("does nothing when pressed, rather than removing somebody it did not add", () => {
    const adaOnly = CLUB.filter((entry) => entry.personId === ADA);
    expect(groupIsSelected(adaOnly, COMMITTEE, RESTORED)).toBe(true);

    const pressed = toggleGroup(adaOnly, COMMITTEE, RESTORED);

    // The old behaviour removed Ada entirely here. The current behaviour leaves
    // the selection untouched: those people are still all invited, which is what
    // the lit button says.
    expect([...pressed]).toEqual([...RESTORED]);
  });
});

describe("resolution is unaffected by how a person was selected", () => {
  it("invites one person once, at the highest-precedence capacity", () => {
    const both = toggleGroup(CLUB, COMMITTEE, toggleGroup(CLUB, PLAYERS, new Set()));
    const resolution = resolveSelection(CLUB, [...both]);

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;

    const ada = resolution.members.filter((member) => member.personId === ADA);
    expect(ada).toHaveLength(1);
    expect(ada[0].capacity).toBe("player");

    const cy = resolution.members.filter((member) => member.personId === CY);
    expect(cy).toHaveLength(1);
    expect(cy[0].capacity).toBe("committee");
  });

  it("refuses a key that names nobody selectable", () => {
    const resolution = resolveSelection(CLUB, [selectionKey("player", CY)]);
    expect(resolution.ok).toBe(false);
    expect(resolution.ok === false && resolution.failure).toBe("unknown");
  });

  it("refuses an empty selection", () => {
    const resolution = resolveSelection(CLUB, []);
    expect(resolution.ok === false && resolution.failure).toBe("empty");
  });
});
