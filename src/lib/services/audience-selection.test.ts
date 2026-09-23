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
  audienceCategoriesForEventType,
  audienceOptionsForEventType,
  audienceGroupCounts,
  audiencePeople,
  groupSelectionKeys,
  groupsForEventType,
  RECRUITMENT_EVENT_TYPE,
  resolveSelection,
  selectionAfterGroupPress,
  selectionKey,
  summariseAudienceGroups,
  templateGroupsForEventType,
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

/** LAN-416: one open (or closed) recruit, as `listAudienceCatalogueIn` shapes one. */
function recruit(personId: string, displayName: string, status: string): AudienceCandidate {
  return {
    key: selectionKey("recruit", personId),
    capacity: "recruit",
    anchorId: personId,
    personId,
    displayName,
    standing: status,
    unit: null,
    contact: null,
    recruitStatus: status,
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

/** One group's row, against a selection — the picker's three numbers. */
function countFor(token: string, selected: Iterable<string> = []) {
  const counts = audienceGroupCounts(CLUB, [token], selected);
  const count = counts.get(token);
  if (!count) throw new Error(`no count for ${token}`);
  return count;
}

describe("group sizes count people, not rows", () => {
  it("counts the union once for everyone-active", () => {
    // Six rows, four humans.
    expect(CLUB).toHaveLength(6);
    expect(countFor(EVERYONE).size).toBe(4);
  });

  it("counts each narrower group by its own members", () => {
    expect(countFor(PLAYERS).size).toBe(2);
    expect(countFor(COACHES).size).toBe(1);
    expect(countFor(COMMITTEE).size).toBe(3);
  });

  it("offers everyone-active first", () => {
    expect(AUDIENCE_GROUPS[0].key).toBe(EVERYONE);
  });
});

/**
 * LAN-414 round 2 — the overlap arithmetic behind `adds N` / **Included**.
 *
 * Brian: "I click a group, I see how many people there are and which groups I
 * collect or not." These are the numbers that sentence turns into, and they are
 * about **people**: a person in two chosen groups is counted once, and a group
 * the selection already covers adds nobody.
 */
describe("what a group would add beyond the current selection", () => {
  it("adds its whole size against an empty selection", () => {
    const count = countFor(EVERYONE);
    expect(count.size).toBe(4);
    expect(count.adds).toBe(4);
    expect(count.included).toBe(false);
  });

  it("counts a person in two chosen groups once", () => {
    // Ada is a player and on the committee — two rows, two keys, one human.
    // Players (2) plus committee (3) is five rows and four people, so
    // everyone-active adds nothing beyond them rather than four.
    const players = selectionAfterGroupPress(CLUB, PLAYERS, new Set(), new Set());
    const both = selectionAfterGroupPress(CLUB, COMMITTEE, new Set([PLAYERS]), players);

    expect(peopleNamed(both)).toHaveLength(4);
    expect(countFor(EVERYONE, both).adds).toBe(0);
  });

  it("calls a group Included when the selection already covers everyone in it", () => {
    const everyone = selectionAfterGroupPress(CLUB, EVERYONE, new Set(), new Set());

    const players = countFor(PLAYERS, everyone);
    expect(players.size).toBe(2);
    expect(players.adds).toBe(0);
    expect(players.included).toBe(true);
  });

  it("counts only the people a selection has not reached", () => {
    // Coaches alone is Cy. Everyone-active is four people, so it adds the
    // other three, not all four.
    const coaches = selectionAfterGroupPress(CLUB, COACHES, new Set(), new Set());

    expect(peopleNamed(coaches)).toEqual(["Cy Marchbank"]);
    expect(countFor(EVERYONE, coaches).adds).toBe(3);
  });

  it("never calls an empty group Included, because there is nobody in it", () => {
    // Nobody in this club holds a special-teams slot, so the row is a nought
    // that adds nought — and saying "Included" would read as "you have them".
    const empty = countFor("special_teams:kickoff", [selectionKey("player", "membership-ada")]);
    expect(empty.size).toBe(0);
    expect(empty.adds).toBe(0);
    expect(empty.included).toBe(false);
  });

  it("ignores a key the catalogue no longer offers rather than blanking every row", () => {
    // A membership that changed under a saved audience narrows what is
    // reached; it does not make the picker's numbers meaningless.
    const stale = new Set([selectionKey("player", "membership-gone")]);
    expect(countFor(PLAYERS, stale).adds).toBe(2);
  });

  it("answers every token in one read, in one pass", () => {
    const tokens = [EVERYONE, PLAYERS, COACHES, COMMITTEE];
    const counts = audienceGroupCounts(CLUB, tokens, []);

    expect([...counts.keys()]).toEqual(tokens);
    expect(counts.get(PLAYERS)?.size).toBe(2);
    expect(counts.get(COMMITTEE)?.size).toBe(3);
  });
});

describe("ticking a group adds exactly its own keys", () => {
  it("adds a group to an empty selection", () => {
    const next = selectionAfterGroupPress(CLUB, PLAYERS, new Set(), new Set());
    expect([...next].sort()).toEqual(groupSelectionKeys(CLUB, PLAYERS).sort());
    expect(peopleNamed(next)).toEqual(["Ada Kettle", "Bo Rivers"]);
  });

  it("unions with what is already selected", () => {
    const players = selectionAfterGroupPress(CLUB, PLAYERS, new Set(), new Set());
    const both = selectionAfterGroupPress(CLUB, COMMITTEE, new Set([PLAYERS]), players);
    expect(peopleNamed(both)).toEqual(["Ada Kettle", "Bo Rivers", "Cy Marchbank", "Di Ashgrove"]);
  });

  /**
   * LAN-414 round 2. A group is ticked because somebody ticked it, so a group
   * whose people are all chosen already is still *untick*ed — pressing it adds
   * its keys rather than taking them away. Under the pills this case removed
   * people, because the pill decided it was lit by inference; it is the same
   * inference Brian rejected on sight.
   */
  it("adds, not removes, when the selection already covers the group", () => {
    const everyone = selectionAfterGroupPress(CLUB, EVERYONE, new Set(), new Set());
    expect(countFor(PLAYERS, everyone).included).toBe(true);

    const after = selectionAfterGroupPress(CLUB, PLAYERS, new Set([EVERYONE]), everyone);

    expect(peopleNamed(after)).toEqual(peopleNamed(everyone));
  });
});

describe("unticking a group removes exactly its own keys", () => {
  it("keeps somebody a different group put there", () => {
    // The original defect: Ada is a player and on the committee. Undoing the
    // committee group must not take away her player selection.
    const players = selectionAfterGroupPress(CLUB, PLAYERS, new Set(), new Set());
    const both = selectionAfterGroupPress(CLUB, COMMITTEE, new Set([PLAYERS]), players);

    const undone = selectionAfterGroupPress(CLUB, COMMITTEE, new Set([PLAYERS, COMMITTEE]), both);

    expect(peopleNamed(undone)).toEqual(["Ada Kettle", "Bo Rivers"]);
    expect(undone.has(selectionKey("player", "membership-ada"))).toBe(true);
  });

  it("removes one capacity of a person who holds two that share an anchor", () => {
    // The defect independent review predicted would pass every screen test.
    // Cy is a coach AND on the committee, and both anchor on the same person id,
    // so `coach:person-cy` and `committee:person-cy` differ only by capacity.
    // Removing by anchor would take both; removing by key takes one.
    const coaches = selectionAfterGroupPress(CLUB, COACHES, new Set(), new Set());
    const both = selectionAfterGroupPress(CLUB, COMMITTEE, new Set([COACHES]), coaches);
    expect(both.has(selectionKey("coach", CY))).toBe(true);
    expect(both.has(selectionKey("committee", CY))).toBe(true);

    const withoutCommittee = selectionAfterGroupPress(
      CLUB,
      COMMITTEE,
      new Set([COACHES, COMMITTEE]),
      both,
    );

    expect(withoutCommittee.has(selectionKey("coach", CY))).toBe(true);
    expect(withoutCommittee.has(selectionKey("committee", CY))).toBe(false);
    // Cy is still invited — as a coach, which is what "remove the committee
    // group" should leave behind.
    expect(peopleNamed(withoutCommittee)).toEqual(["Cy Marchbank"]);
  });

  /**
   * LAN-414 round 2. Overlap is a number on the screen, and it has to be a
   * number in the write too: unticking a wide group keeps the people a
   * narrower ticked group is still claiming.
   */
  it("keeps the keys another ticked group also claims", () => {
    const everyone = selectionAfterGroupPress(CLUB, EVERYONE, new Set(), new Set());
    const both = selectionAfterGroupPress(CLUB, PLAYERS, new Set([EVERYONE]), everyone);

    const untickEveryone = selectionAfterGroupPress(
      CLUB,
      EVERYONE,
      new Set([EVERYONE, PLAYERS]),
      both,
    );

    // The players stay, because All roster players is still ticked.
    expect(peopleNamed(untickEveryone)).toEqual(["Ada Kettle", "Bo Rivers"]);
  });

  it("clears everything when everyone-active is unticked", () => {
    const all = selectionAfterGroupPress(CLUB, EVERYONE, new Set(), new Set());
    expect(selectionAfterGroupPress(CLUB, EVERYONE, new Set([EVERYONE]), all).size).toBe(0);
  });
});

describe("resolution is unaffected by how a person was selected", () => {
  it("invites one person once, at the highest-precedence capacity", () => {
    const both = selectionAfterGroupPress(
      CLUB,
      COMMITTEE,
      new Set([PLAYERS]),
      selectionAfterGroupPress(CLUB, PLAYERS, new Set(), new Set()),
    );
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

// ---------------------------------------------------------------------------
// LAN-154 — the recruits group (D46), and the audience read as a shape
// ---------------------------------------------------------------------------

describe("a Recruits category, on every event type (LAN-416, amending D46)", () => {
  const OTHER_TYPES = [
    "practice",
    "strength_and_conditioning",
    "chalk",
    "game",
    "social",
    "meeting",
  ];

  it("leaves the General list the same six groups on every type", () => {
    for (const type of [...OTHER_TYPES, "recruitment"]) {
      expect(groupsForEventType(type).map((group) => group.key)).toEqual([
        EVERYONE,
        PLAYERS,
        COACHES,
        COMMITTEE,
        "onboarding",
        "bps",
      ]);
    }
  });

  it("offers the four recruit pills on every event type, Recruitment included", () => {
    for (const type of [...OTHER_TYPES, "recruitment"]) {
      const recruits = audienceCategoriesForEventType(type).find(
        (section) => section.category === "recruits",
      );
      expect(recruits?.label).toBe("Recruits");
      expect(recruits?.options.map((option) => option.token)).toEqual([
        "recruits:all",
        "recruits:identified",
        "recruits:engaged",
        "recruits:committed",
      ]);
      expect(recruits?.options.map((option) => option.label)).toEqual([
        "All active recruits",
        "Identified",
        "Engaged",
        "Committed",
      ]);
    }
  });

  it("does not fold recruits into everyone-active", () => {
    // D45: inactive people are never invited, and a prospect is not a member.
    // "Whole club" means the roster, and a recruit is deliberately not on
    // it — `recruitment_prospects` exists so the roster keeps meaning "people
    // on the team".
    const everyone = AUDIENCE_GROUPS.find((group) => group.key === EVERYONE)!;

    expect([...everyone.capacities]).toEqual(["player", "coach", "committee"]);
    expect(everyone.capacities).not.toContain("recruit");
  });
});

describe("the audience named by its groups before its people", () => {
  // Brian, 2026-08-21: "it should say at the very top what groups it would be
  // ... You don't have to show me how it's done."

  it("names the widest group that is wholly in, and not the ones it subsumes", () => {
    const summary = summariseAudienceGroups(CLUB, groupSelectionKeys(CLUB, EVERYONE), "practice");

    expect(summary.groups).toEqual(["Whole club"]);
    expect(summary.others).toBe(0);
    expect(summary.total).toBe(4);
  });

  it("names two narrower groups when that is what was chosen", () => {
    const chosen = [...groupSelectionKeys(CLUB, PLAYERS), ...groupSelectionKeys(CLUB, COACHES)];

    const summary = summariseAudienceGroups(CLUB, chosen, "practice");

    expect(summary.groups).toEqual(["All roster players", "All active coaches"]);
    expect(summary.total).toBe(3);
  });

  it("never names a group that is only partly selected", () => {
    // Naming it would tell the approver the whole group is invited when it is
    // not, which is the one thing this line must never do.
    const [onePlayer] = groupSelectionKeys(CLUB, PLAYERS);

    const summary = summariseAudienceGroups(CLUB, [onePlayer], "practice");

    expect(summary.groups).toEqual([]);
    expect(summary.others).toBe(1);
    expect(summary.total).toBe(1);
  });

  it("counts somebody chosen by hand rather than inventing a group for them", () => {
    const chosen = [...groupSelectionKeys(CLUB, PLAYERS), selectionKey("committee", "person-di")];

    const summary = summariseAudienceGroups(CLUB, chosen, "practice");

    expect(summary.groups).toEqual(["All roster players"]);
    expect(summary.others).toBe(1);
    expect(summary.total).toBe(3);
  });

  it("says nothing about a group whose people are already covered", () => {
    // Cy coaches and sits on the committee. Selecting everyone-active covers
    // both, and the line must not read "Everyone active, all active coaches".
    const summary = summariseAudienceGroups(CLUB, groupSelectionKeys(CLUB, EVERYONE), "practice");

    expect(summary.groups).toHaveLength(1);
  });

  it("is empty for an empty audience, and says so as a count", () => {
    expect(summariseAudienceGroups(CLUB, [], "practice")).toEqual({
      groups: [],
      named: [],
      others: 0,
      noLongerSelectable: 0,
      total: 0,
    });
  });

  // -------------------------------------------------------------------------
  // A member the catalogue no longer offers — LAN-242
  // -------------------------------------------------------------------------

  describe("when somebody in the saved audience has since gone inactive", () => {
    /** A key shaped exactly like a real one, for somebody the catalogue has dropped. */
    const GONE = "player:99999999-9999-4999-8999-999999999999";

    it("still counts them, rather than collapsing the whole summary to zero", () => {
      // The defect, exactly. `resolveSelection` refuses an unknown key outright,
      // and this function used to reach for it — so one lapsed membership made
      // `total` read 0 above a list of every remaining name, on the event page,
      // the approval review and the cancel screen alike (LAN-239, M2/M4/M6).
      const chosen = [...groupSelectionKeys(CLUB, PLAYERS), GONE];
      const summary = summariseAudienceGroups(CLUB, chosen, "practice");

      const stillListed = summariseAudienceGroups(
        CLUB,
        groupSelectionKeys(CLUB, PLAYERS),
        "practice",
      );

      expect(summary.total).toBe(stillListed.total + 1);
      expect(summary.noLongerSelectable).toBe(1);
    });

    it("does not call them chosen by hand", () => {
      // `others` means "no named group accounts for them", which is how the
      // line says "N chosen by hand". Somebody whose membership lapsed was not
      // chosen by hand, and saying so would be a small, confident lie.
      const summary = summariseAudienceGroups(
        CLUB,
        [...groupSelectionKeys(CLUB, PLAYERS), GONE],
        "practice",
      );

      expect(summary.others).toBe(0);
    });

    it("still names the groups that are wholly present today", () => {
      const summary = summariseAudienceGroups(
        CLUB,
        [...groupSelectionKeys(CLUB, PLAYERS), GONE],
        "practice",
      );

      expect(summary.groups).toContain("All roster players");
    });

    it("still refuses to name a group the audience only partly holds", () => {
      // The one rule this line must never break, restated against the tolerant
      // path: a person the catalogue has dropped cannot complete a group.
      const players = groupSelectionKeys(CLUB, PLAYERS);
      const summary = summariseAudienceGroups(CLUB, [...players.slice(1), GONE], "practice");

      expect(summary.groups).not.toContain("All roster players");
    });

    it("counts one absent person once, however many times their key is listed", () => {
      const summary = summariseAudienceGroups(CLUB, [GONE, GONE], "practice");

      expect(summary.total).toBe(1);
      expect(summary.noLongerSelectable).toBe(1);
    });
  });

  it("never names the recruits group on an event that cannot have one", () => {
    const summary = summariseAudienceGroups(CLUB, groupSelectionKeys(CLUB, EVERYONE), "practice");

    expect(summary.groups).not.toContain("Recruits");
  });
});

// Correction round 2, item 7 (`WP-operator-record`, LAN-217): BPS, driven by
// an extra flag on top of the `player` capacity rather than a capacity of
// its own — see `AudienceCandidate.isBps`'s own note for why.
describe("BPS is a player narrowed by an extra flag, not a capacity of its own", () => {
  const BPS_CLUB: AudienceCandidate[] = [
    { ...candidate("player", "membership-eve", "person-eve", "Eve Sandford"), isBps: true },
    candidate("player", "membership-fen", "person-fen", "Fen Oakley"),
  ];

  it("selects only the flagged player", () => {
    const keys = groupSelectionKeys(BPS_CLUB, "bps");
    const resolution = resolveSelection(BPS_CLUB, keys);

    expect(resolution.ok && resolution.members.map((m) => m.displayName)).toEqual(["Eve Sandford"]);
  });

  it("is offered on every event type — it is not a Recruits-style exception", () => {
    for (const type of ["practice", "game", "social", "meeting"]) {
      expect(groupsForEventType(type).map((g) => g.key)).toContain("bps");
    }
  });

  // D-003 (correction round 3, Q-14, Brian): "the BPS audience appears in
  // the event's own audience picker but not in event templates, so it
  // cannot be pre-chosen." That migration is authorised this round
  // (`supabase/migrations/20260904120000_bps_event_template_audience.sql`),
  // so BPS is now offered to a template's default-audience picker exactly
  // as every other group is.
  it("is offered to a template's own default-audience picker, like every other group", () => {
    expect(templateGroupsForEventType("practice").map((g) => g.key)).toContain("bps");
    expect(templateGroupsForEventType("practice").map((g) => g.key)).toEqual(
      groupsForEventType("practice").map((g) => g.key),
    );
  });

  // D-004 (correction round 3, Q-14, Brian): "The audience reads 'All Active
  // BPS', not 'BPS'."
  it('is named on the AUDIENCE_GROUPS list Brian approved, labelled exactly "All Active BPS"', () => {
    const bps = AUDIENCE_GROUPS.find((g) => g.key === "bps");
    expect(bps?.label).toBe("All Active BPS");
  });
});

/**
 * LAN-294 — one row per person, wherever the audience is shown or used.
 *
 * Brian, 2026-09-10, opening the picker on a practice event: Bertram (player +
 * President) and Caspian Hallowfield (player + three committee seats) were each
 * listed twice, once per capacity. A person who is a player, a coach *and* a
 * committee member would have been three rows and, on any writer that did not
 * go through `resolveSelection`, three invitations.
 */
describe("the catalogue as people — audiencePeople", () => {
  /** Em plays, coaches and sits on the committee: the three-group case. */
  const EM = "person-em";
  const TRIPLE: AudienceCandidate[] = [
    { ...candidate("player", "membership-em", EM, "Em Vaudrey"), unit: "Both", contact: "07700 1" },
    { ...candidate("coach", EM, EM, "Em Vaudrey"), standing: "Head Coach" },
    { ...candidate("committee", EM, EM, "Em Vaudrey"), standing: "Treasurer" },
    candidate("player", "membership-bo", "person-bo", "Bo Rivers"),
  ];

  it("gives one row per human, however many capacities they hold", () => {
    expect(TRIPLE).toHaveLength(4);
    expect(audiencePeople(TRIPLE).map((person) => person.displayName)).toEqual([
      "Bo Rivers",
      "Em Vaudrey",
    ]);
  });

  it("carries every capacity on the one row, in precedence order", () => {
    const em = audiencePeople(TRIPLE).find((person) => person.personId === EM);

    expect(em?.capacities).toEqual(["player", "coach", "committee"]);
    expect(em?.standings).toEqual(["Active", "Head Coach", "Treasurer"]);
    // The capacity a write would resolve them to, and the same one
    // `resolveSelection` picks — the two must not be able to disagree.
    expect(em?.capacity).toBe("player");
    const resolution = resolveSelection(TRIPLE, em?.keys ?? []);
    expect(resolution.ok && resolution.members).toHaveLength(1);
    expect(resolution.ok && resolution.members[0].capacity).toBe("player");
  });

  it("keeps every key the human holds, so a tick moves all of them together", () => {
    const em = audiencePeople(TRIPLE).find((person) => person.personId === EM);

    expect(em?.keys).toEqual([
      selectionKey("player", "membership-em"),
      selectionKey("coach", EM),
      selectionKey("committee", EM),
    ]);
  });

  it("keeps the details the row shows — unit and contact — from whichever row has them", () => {
    const em = audiencePeople(TRIPLE).find((person) => person.personId === EM);

    expect(em?.unit).toBe("Both");
    expect(em?.contact).toBe("07700 1");
  });

  it("collapses the seeded pair Brian found to one row each", () => {
    // Bertram: player + President. Caspian: player + three committee seats,
    // which the catalogue read has already joined into one committee row.
    const seeded: AudienceCandidate[] = [
      candidate("player", "membership-bertram", "person-bertram", "Bertram"),
      {
        ...candidate("committee", "person-bertram", "person-bertram", "Bertram"),
        standing: "President",
      },
      candidate("player", "membership-caspian", "person-caspian", "Caspian Hallowfield"),
      {
        ...candidate("committee", "person-caspian", "person-caspian", "Caspian Hallowfield"),
        standing: "Media Secretary, Secretary, IT Officer",
      },
    ];

    const people = audiencePeople(seeded);
    expect(people).toHaveLength(2);
    expect(people.map((person) => person.displayName)).toEqual(["Bertram", "Caspian Hallowfield"]);
    expect(people[1].standings).toEqual(["Active", "Media Secretary, Secretary, IT Officer"]);
  });

  it("joins a second row within one capacity rather than making a second person", () => {
    // Defensive: the catalogue read already joins several seats held in one
    // capacity. If it ever stopped, the person must still be one row.
    const twoSeats: AudienceCandidate[] = [
      {
        ...candidate("committee", "person-di", "person-di", "Di Ashgrove"),
        standing: "Social Sec",
      },
      {
        ...candidate("committee", "person-di", "person-di", "Di Ashgrove"),
        key: "committee:person-di-2",
        standing: "Kit Sec",
      },
    ];

    const people = audiencePeople(twoSeats);
    expect(people).toHaveLength(1);
    expect(people[0].standings).toEqual(["Social Sec, Kit Sec"]);
  });

  it("leaves the club fixture's six rows as its four humans", () => {
    expect(audiencePeople(CLUB).map((person) => person.displayName)).toEqual([
      "Ada Kettle",
      "Bo Rivers",
      "Cy Marchbank",
      "Di Ashgrove",
    ]);
  });
});

/**
 * LAN-416, amending D46 / LAN-295 — a recruit can be invited to any event type,
 * by explicit pick, and by no other route.
 *
 * LAN-295 said the opposite: the `recruits` group carried
 * `eventTypes: [recruitment]`, and the catalogue withheld recruits entirely off
 * a Recruitment event. Stewart's problem was the run of mixed events between
 * pure recruiting and the first team practice, which a good recruit who is not
 * yet Joined had no way onto; Brian's rule, accepted by Stewart and Clint on
 * 2026-09-22, is that a recruit can be invited anywhere and "the only way you
 * can add a recruit is by going to a special recruitment column and adding
 * them."
 *
 * These tests are LAN-295's own, rewritten to that decision. The catalogue half
 * — that a recruit now reaches every event type's candidate list — is
 * `listAudienceCatalogueIn`, proved against the database in
 * `event-approval.test.ts`.
 */
describe("recruits are reachable only through the Recruits pills", () => {
  const RECRUIT = recruit("person-prospect", "Wren Alderby", "engaged");
  const WITH_RECRUIT = [...CLUB, RECRUIT];

  it("names the behavioural class rather than a template name", () => {
    // After LAN-265 an operator names templates freely and everything they
    // create is `practice` class, so any rule keyed on a name would be one
    // rename away from meaning something else. The cadence rule LAN-416 keeps
    // (only a Recruitment event is gentle) is keyed on this constant.
    expect(RECRUITMENT_EVENT_TYPE).toBe("recruitment");
  });

  it("retires the General recruits group rather than widening it", () => {
    // The enum value survives — values cannot be dropped and rows held it — but
    // nothing offers it, so no General pill can reach a recruit.
    expect(AUDIENCE_GROUPS.map((group) => group.key)).not.toContain("recruits");
    for (const group of AUDIENCE_GROUPS) {
      expect(group.capacities).not.toContain("recruit");
    }
  });

  it("adds nobody from the recruit list to any General group, on any type", () => {
    for (const type of ["practice", "game", "chalk", "social", "meeting", "recruitment"]) {
      for (const group of groupsForEventType(type)) {
        expect(groupSelectionKeys(WITH_RECRUIT, group.key)).not.toContain(RECRUIT.key);
      }
    }
  });

  it("resolves an engaged recruit through the engaged pill and the all pill", () => {
    expect(groupSelectionKeys(WITH_RECRUIT, "recruits:engaged")).toEqual([RECRUIT.key]);
    expect(groupSelectionKeys(WITH_RECRUIT, "recruits:all")).toEqual([RECRUIT.key]);
    expect(groupSelectionKeys(WITH_RECRUIT, "recruits:identified")).toEqual([]);
    expect(groupSelectionKeys(WITH_RECRUIT, "recruits:committed")).toEqual([]);
  });

  // "Declined, disengaged, voided and joined never resolve into any recruit
  // pill, with a test per status" — LAN-416's own acceptance. A joined person
  // is a player and reaches the event through the player groups; the other
  // three never reach the catalogue at all, and this is the belt to that
  // brace: even handed one, no pill takes it.
  for (const status of ["declined", "disengaged", "void", "joined"]) {
    it(`never resolves a ${status} recruit, through any pill`, () => {
      const closed = [...CLUB, recruit("person-closed", "Quill Danesford", status)];
      for (const token of [
        "recruits:all",
        "recruits:identified",
        "recruits:engaged",
        "recruits:committed",
      ]) {
        expect(groupSelectionKeys(closed, token)).toEqual([]);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// LAN-388 — Onboarding as its own group
// ---------------------------------------------------------------------------

/**
 * Clint, 2026-09-17: "If someone's status is onboarding, I can't invite them
 * to any events. They aren't in the active group or the recruits group."
 * Confirmed by Brian the same day: Onboarding is its own group.
 *
 * **LAN-415, 2026-09-22, reverses the second half of that decision** — "not
 * folded into Active". Stewart: "I think active personally should include
 * onboarding because when I hit all active players that should include the
 * onboarding player." Brian: "I agree. Onboarding is an administrative status
 * internally… it's more of a marker to Clint." The group stays, for an
 * onboarding-only event; what changes is that Everyone active and All active
 * players now reach those people too, because an operator pressing either one
 * means everyone, and a rookie missed on a practice invitation is the
 * costliest miss the club has.
 *
 * The fixture is the awkward case as well as the plain one: **Wren** is
 * mid-onboarding, **Fen** is mid-onboarding *and* a live recruit, and **Bo**
 * from the club above is an ordinary active player. The BPS row is here too,
 * because an onboarding membership has always been allowed to hold a BPS
 * selection (REQ-nothing-gates) and that must not change.
 */
const WREN = "person-wren";
const FEN = "person-fen";

function onboardingPlayer(
  anchorId: string,
  personId: string,
  displayName: string,
  isBps = false,
): AudienceCandidate {
  return {
    ...candidate("player", anchorId, personId, displayName),
    standing: "Onboarding",
    isOnboarding: true,
    isBps,
  };
}

const MID_SEASON: AudienceCandidate[] = [
  candidate("player", "membership-bo", "person-bo", "Bo Rivers"),
  onboardingPlayer("membership-wren", WREN, "Wren Alderley"),
  onboardingPlayer("membership-fen", FEN, "Fen Coldstream"),
  { ...candidate("recruit", FEN, FEN, "Fen Coldstream"), standing: "Committed" },
];

const ONBOARDING = "onboarding";

describe("Onboarding is its own audience group", () => {
  it("offers exactly the mid-onboarding people, and counts them", () => {
    expect(audienceGroupCounts(MID_SEASON, [ONBOARDING], []).get(ONBOARDING)?.size).toBe(2);
    expect(groupSelectionKeys(MID_SEASON, ONBOARDING)).toEqual([
      selectionKey("player", "membership-wren"),
      selectionKey("player", "membership-fen"),
    ]);
  });

  /**
   * LAN-415. This assertion used to read "keeps them out of Active, which is
   * the whole point of a separate group" and is reversed, not deleted: the
   * group is still the only way to reach *only* those people, which is what it
   * is now for.
   */
  it("no longer keeps them out of Active — both player-wide groups reach them", () => {
    // Bo (active), Wren and Fen (both mid-onboarding).
    expect(audienceGroupCounts(MID_SEASON, [PLAYERS], []).get(PLAYERS)?.size).toBe(3);
    expect(audienceGroupCounts(MID_SEASON, [EVERYONE], []).get(EVERYONE)?.size).toBe(3);
    expect(groupSelectionKeys(MID_SEASON, PLAYERS)).toEqual([
      selectionKey("player", "membership-bo"),
      selectionKey("player", "membership-wren"),
      selectionKey("player", "membership-fen"),
    ]);
  });

  it("still reaches a completed membership, which was never in doubt", () => {
    expect(groupSelectionKeys(MID_SEASON, PLAYERS)).toContain(
      selectionKey("player", "membership-bo"),
    );
  });

  /**
   * LAN-415's boundary: onboarding is a player fact. A coach or a committee
   * seat carries no onboarding standing at all, so their groups are untouched
   * by this decision and a coach's own onboarding state changes nothing.
   */
  it("leaves the coach and committee groups exactly as they were", () => {
    const seats = [
      ...MID_SEASON,
      candidate("coach", "person-quill", "person-quill", "Quill Marchetti"),
      candidate("committee", "person-tam", "person-tam", "Tam Ellory"),
    ];

    expect(groupSelectionKeys(seats, "active_coaches")).toEqual([
      selectionKey("coach", "person-quill"),
    ]);
    expect(groupSelectionKeys(seats, "active_committee")).toEqual([
      selectionKey("committee", "person-tam"),
    ]);
  });

  it("is offered on every event class an active player is offered on", () => {
    for (const type of ["practice", "game", "social", "meeting", "chalk", "recruitment"]) {
      expect(groupsForEventType(type).map((group) => group.key)).toContain(ONBOARDING);
    }
  });

  it("can be pre-chosen on a template, like every other group", () => {
    expect(templateGroupsForEventType("practice").map((group) => group.key)).toContain(ONBOARDING);
  });

  it("still lets a BPS selection on an onboarding membership reach the BPS group", () => {
    // REQ-nothing-gates (WP-operator-record correction round 2, item 7). The
    // arm that used to carry this is gone; the group carries it now.
    const withBps = [
      ...MID_SEASON,
      onboardingPlayer("membership-hale", "person-hale", "Hale Tunstall", true),
    ];

    expect(groupSelectionKeys(withBps, "bps")).toEqual([selectionKey("player", "membership-hale")]);
  });

  it("gives a person who is both onboarding and a recruit one row, and one write", () => {
    // P9 / LAN-293 / LAN-294. Both groups offer Fen; ticking both resolves to
    // one member, on the player ladder, because player wins the precedence.
    const both = new Set([
      ...groupSelectionKeys(MID_SEASON, ONBOARDING),
      ...groupSelectionKeys(MID_SEASON, "recruits"),
    ]);
    const resolution = resolveSelection(MID_SEASON, [...both]);

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    const fen = resolution.members.filter((member) => member.personId === FEN);
    expect(fen).toHaveLength(1);
    expect(fen[0].capacity).toBe("player");
    expect(fen[0].anchorId).toBe("membership-fen");

    // And the two rows are one human in the picker.
    const people = audiencePeople(MID_SEASON);
    expect(people.filter((person) => person.personId === FEN)).toHaveLength(1);
    expect(people.find((person) => person.personId === FEN)!.capacities).toEqual([
      "player",
      "recruit",
    ]);
  });

  it("names the group in an audience summary rather than counting them as others", () => {
    const summary = summariseAudienceGroups(
      MID_SEASON,
      groupSelectionKeys(MID_SEASON, ONBOARDING),
      "practice",
    );

    expect(summary.groups).toContain("Onboarding");
    expect(summary.others).toBe(0);
    expect(summary.total).toBe(2);
  });

  it("ticks and clears its row like any other group", () => {
    const ticked = selectionAfterGroupPress(MID_SEASON, ONBOARDING, new Set(), new Set());

    // LAN-414 round 2: the row's mark, not a lit pill. Onboarding is chosen;
    // All roster players is not, and adds the one active player it
    // reaches that Onboarding does not.
    const counts = audienceGroupCounts(MID_SEASON, [ONBOARDING, PLAYERS], ticked);
    expect(counts.get(ONBOARDING)?.included).toBe(true);
    expect(counts.get(PLAYERS)?.adds).toBe(1);

    expect(
      selectionAfterGroupPress(MID_SEASON, ONBOARDING, new Set([ONBOARDING]), ticked).size,
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// LAN-414 — audiences by category
// ---------------------------------------------------------------------------

/**
 * State of the App call, 2026-09-22. Stewart defined the club's audiences from
 * the roster board and Clint confirmed the names: the assignment columns the
 * roster already keeps become audiences an event can be built from, under
 * category headers, beside the baseline groups.
 *
 * These are the pure half — which pill resolves to whom. The database half,
 * which is that `listAudienceCatalogueIn` carries each candidate's assignments
 * on the row, is proved in `event-approval.test.ts`.
 */
describe("audiences by category (LAN-414)", () => {
  function assigned(
    anchorId: string,
    personId: string,
    displayName: string,
    assignments: Partial<AudienceCandidate>,
  ): AudienceCandidate {
    return { ...candidate("player", anchorId, personId, displayName), ...assignments };
  }

  const QB = assigned("membership-quinn", "person-quinn", "Quinn Ashdown", {
    coachingValues: ["Offense", "Quarterbacks"],
    warmupGroup: "Kings",
    specialTeamsSquads: ["field_goal"],
  });
  const LB = assigned("membership-larke", "person-larke", "Larke Ombersley", {
    coachingValues: ["Defense", "Linebackers"],
    warmupGroup: "Raider",
    specialTeamsSquads: ["kick_return", "kickoff"],
  });
  const UNASSIGNED = assigned("membership-nyle", "person-nyle", "Nyle Ferrers", {});
  const SQUAD = [QB, LB, UNASSIGNED];

  it("shows the five categories in the call's own order, and labels them", () => {
    expect(audienceCategoriesForEventType("practice").map((section) => section.category)).toEqual([
      "general",
      "coaching",
      "warmup",
      "special_teams",
      "recruits",
    ]);
    expect(audienceCategoriesForEventType("practice").map((section) => section.label)).toEqual([
      "General",
      "Coaching assignments",
      "Warmup assignments",
      "Special teams",
      "Recruits",
    ]);
  });

  /**
   * LAN-414 round 2, Brian, 2026-09-22: "Coaching assignments splits into
   * three sub-categories, each folding on its own: Coaching groups, Offensive
   * position groups, Defensive position groups. Storage is unchanged; this is
   * the catalogue's grouping and the picker."
   */
  it("folds Coaching assignments into three sub-categories and nothing else into more than one", () => {
    const sections = audienceCategoriesForEventType("practice");
    const coaching = sections.find((section) => section.category === "coaching");

    expect(coaching?.subSections.map((sub) => sub.subCategory)).toEqual([
      "coaching_groups",
      "offensive_positions",
      "defensive_positions",
    ]);
    expect(coaching?.subSections.map((sub) => sub.label)).toEqual([
      "Coaching groups",
      "Offensive position groups",
      "Defensive position groups",
    ]);

    // Every other category is one band, and does not label it twice.
    for (const section of sections.filter((each) => each.category !== "coaching")) {
      expect(section.subSections).toHaveLength(1);
      expect(section.subSections[0].label).toBeNull();
    }
  });

  it("keeps every coaching token in the one namespace the three columns already shared", () => {
    // The split is the picker's and the catalogue's. A token is still
    // `coaching:<value>`, so no stored row, template default or migration moves.
    const coaching = audienceCategoriesForEventType("practice")[1];
    expect(coaching.options.map((option) => option.token)).toEqual(
      coaching.subSections.flatMap((sub) => sub.options.map((option) => option.token)),
    );
    for (const option of coaching.options) {
      expect(option.token).toBe(`coaching:${option.value}`);
      expect(option.category).toBe("coaching");
    }
  });

  it("names the two player-wide groups for what LAN-415 made them mean", () => {
    // Brian, 2026-09-22: the count was not going to make the inclusion
    // visible; the words have to. Keys and resolution are untouched.
    const general = audienceCategoriesForEventType("practice")[0];
    const labelFor = (token: string) =>
      general.options.find((option) => option.token === token)?.label;

    expect(labelFor(EVERYONE)).toBe("Whole club");
    expect(labelFor(PLAYERS)).toBe("All roster players");
  });

  it("carries each chosen group's headings out with the summary", () => {
    // What the approval review and the event's audience panel print under.
    // Quinn holds Offense and Quarterbacks, so the widest group that is wholly
    // in is Offense — the summary's rule since LAN-242, unchanged here. What
    // is new is that it says which band Offense came from.
    const summary = summariseAudienceGroups(
      SQUAD,
      groupSelectionKeys(SQUAD, "coaching:Quarterbacks"),
      "practice",
    );

    expect(summary.named).toContainEqual({
      label: "Offense",
      category: "coaching",
      categoryLabel: "Coaching assignments",
      subCategory: "coaching_groups",
      subCategoryLabel: "Coaching groups",
    });
    // `groups` stays the flat list of labels it always was.
    expect(summary.groups).toEqual(summary.named.map((entry) => entry.label));
  });

  it("leaves the sub-category label off a category that is one band", () => {
    // One player, one warmup group and no coaching value, so the widest group
    // wholly in is the warmup row itself — named under "Warmup assignments"
    // alone, with no second heading.
    // A second player, unchosen, so no General group is wholly present and the
    // warmup row is the widest group that is.
    const warmupOnly = [
      assigned("membership-wren", "person-wren", "Wren Alderley", { warmupGroup: "Raider" }),
      assigned("membership-nyle", "person-nyle", "Nyle Ferrers", {}),
    ];

    const summary = summariseAudienceGroups(
      warmupOnly,
      groupSelectionKeys(warmupOnly, "warmup:Raider"),
      "practice",
    );

    const raider = summary.named.find((entry) => entry.category === "warmup");
    expect(raider?.label).toBe("Raider");
    expect(raider?.categoryLabel).toBe("Warmup assignments");
    expect(raider?.subCategoryLabel).toBeNull();
  });

  it("puts the six baseline groups, and only those, under General", () => {
    const general = audienceCategoriesForEventType("practice")[0];
    expect(general.options.map((option) => option.token)).toEqual([
      EVERYONE,
      PLAYERS,
      COACHES,
      COMMITTEE,
      "onboarding",
      "bps",
    ]);
    // A General token is the bare enum key, unchanged — so every stored row,
    // every template default and every existing test still means what it meant.
    for (const option of general.options) {
      expect(option.audienceGroup).toBe(option.token);
      expect(option.value).toBeNull();
    }
  });

  it("offers one sub-group per value of the three Coaching Assignments columns", () => {
    const coaching = audienceCategoriesForEventType("practice")[1];
    expect(coaching.options.map((option) => option.label)).toEqual([
      "Offense",
      "Defense",
      "Special Teams",
      "Offensive Line",
      "Quarterbacks",
      "Runningbacks",
      "Wide Receivers",
      "Defensive Line",
      "Linebackers",
      "Defensive Backs",
    ]);
    expect(coaching.options[4].token).toBe("coaching:Quarterbacks");
    expect(coaching.options[4].value).toBe("Quarterbacks");
    expect(coaching.options[4].audienceGroup).toBeNull();
  });

  it("offers one sub-group per warmup small group, in Stewart's order", () => {
    const warmup = audienceCategoriesForEventType("practice")[2];
    expect(warmup.options.map((option) => option.label)).toEqual([
      "Kings",
      "Raider",
      "Bear",
      "Phoenix",
      "Cavalier",
      "Blue",
      "Gold",
      "Lancer",
    ]);
  });

  it("offers one sub-group per special-teams squad, and no slot of its own", () => {
    const squads = audienceCategoriesForEventType("practice")[3];
    expect(squads.options.map((option) => option.token)).toEqual([
      "special_teams:kick_return",
      "special_teams:kickoff",
      "special_teams:punt",
      "special_teams:punt_return",
      "special_teams:field_goal",
      "special_teams:field_goal_block",
    ]);
    expect(squads.options[0].label).toBe("Kick Return");
  });

  it("resolves a coaching value to everybody holding it this season", () => {
    expect(groupSelectionKeys(SQUAD, "coaching:Offense")).toEqual([QB.key]);
    expect(groupSelectionKeys(SQUAD, "coaching:Quarterbacks")).toEqual([QB.key]);
    expect(groupSelectionKeys(SQUAD, "coaching:Linebackers")).toEqual([LB.key]);
    expect(groupSelectionKeys(SQUAD, "coaching:Wide Receivers")).toEqual([]);
  });

  it("resolves a warmup small group to the one cell that holds it", () => {
    expect(groupSelectionKeys(SQUAD, "warmup:Kings")).toEqual([QB.key]);
    expect(groupSelectionKeys(SQUAD, "warmup:Gold")).toEqual([]);
  });

  // Stewart: "If you have an assignment in kick return, you need to get a
  // message… even if they're backup three."
  it("resolves a squad to everybody holding any slot in it, starter or backup", () => {
    expect(groupSelectionKeys(SQUAD, "special_teams:kick_return")).toEqual([LB.key]);
    expect(groupSelectionKeys(SQUAD, "special_teams:kickoff")).toEqual([LB.key]);
    expect(groupSelectionKeys(SQUAD, "special_teams:field_goal")).toEqual([QB.key]);
    expect(groupSelectionKeys(SQUAD, "special_teams:punt")).toEqual([]);
  });

  it("never reaches a recruit through an assignment sub-group", () => {
    // LAN-416's other half. An assignment hangs off a season membership, so a
    // recruit carries none — but the rule is stated, not inferred, because a
    // recruit reaching a practice through "Offense" would be exactly the
    // accident Brian's rule exists to prevent.
    const withRecruit = [...SQUAD, recruit("person-wren", "Wren Alderby", "engaged")];
    for (const option of audienceOptionsForEventType("practice")) {
      if (option.category === "recruits") continue;
      expect(groupSelectionKeys(withRecruit, option.token)).not.toContain(
        selectionKey("recruit", "person-wren"),
      );
    }
  });

  it("answers an unknown or malformed token with nobody, never with everybody", () => {
    for (const token of ["", ":", "coaching:", "nonsense", "nonsense:Kings", "general:bps"]) {
      expect(groupSelectionKeys(SQUAD, token)).toEqual([]);
    }
  });

  it("names a chosen sub-group in the audience summary", () => {
    // Widest first, as the summary has always worked: Quinn holds Offense and
    // Quarterbacks, and on this squad both resolve to exactly Quinn, so the
    // first of them in the catalogue's own order is the one named.
    const summary = summariseAudienceGroups(
      SQUAD,
      groupSelectionKeys(SQUAD, "coaching:Quarterbacks"),
      "practice",
    );
    expect(summary.groups).toEqual(["Offense"]);
    expect(summary.others).toBe(0);
    expect(summary.total).toBe(1);

    // A squad nobody else is in names itself, because nothing wider covers it.
    const squad = summariseAudienceGroups(
      SQUAD,
      groupSelectionKeys(SQUAD, "special_teams:kick_return"),
      "practice",
    );
    expect(squad.groups).toEqual(["Defense"]);
    expect(squad.total).toBe(1);
  });
});
