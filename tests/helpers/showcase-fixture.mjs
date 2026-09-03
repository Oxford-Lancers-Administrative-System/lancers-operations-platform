/**
 * Inputs for building the tester-week plan without a database — LAN-221.
 *
 * `testExisting()` is what `readExisting` returns against an empty target
 * apart from the migration-owned reference rows every target has: the role
 * catalogue, the messaging schedules and the two agreement versions.
 * `testParams()` names invented testers with no Auth users and its own
 * season labels, so a load in the automated suite stays out of every
 * "current season" query the rest of the suite makes.
 */

const ROLE_CODES = [
  "president",
  "general_manager",
  "head_coach",
  "it_officer",
  "vice_president",
  "offence_coach",
  "secretary",
  "defence_coach",
  "quarterbacks_coach",
  "treasurer",
  "social_secretary",
  "offensive_line_coach",
  "gameday_secretary",
  "wide_receivers_coach",
  "defensive_line_coach",
  "kit_manager",
  "media_secretary",
  "linebackers_coach",
  "defensive_backs_coach",
  "special_teams_coach",
];

export function testExisting() {
  return {
    operators: new Map(),
    assignments: new Map(),
    messagingSchedules: new Map(),
    agreementVersions: new Map([
      ["code_of_conduct", "11111111-1111-4111-8111-111111111111"],
      ["photo_release", "22222222-2222-4222-8222-222222222222"],
    ]),
    chaseSettings: { first_chase_after_hours: 48, chase_count: 4, chase_interval_days: 3 },
    roles: new Map(
      ROLE_CODES.map((code, index) => [
        code,
        {
          id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          code,
          scope: code.endsWith("_coach") ? "season" : "committee_year",
          is_constitutional_office: [
            "president",
            "vice_president",
            "secretary",
            "treasurer",
          ].includes(code),
          is_single_holder_seat: code === "general_manager",
        },
      ]),
    ),
    seasons: new Map(),
    terms: new Map(),
    vocabularies: new Map(),
    positions: new Map(),
    onboardingTypes: new Map(),
    openCommitteeYear: null,
  };
}

export function testParams(overrides = {}) {
  return {
    brian: {
      givenName: "Showcase",
      familyName: "Owner",
      phone: "07700 900901",
      roles: ["it_officer"],
    },
    stewart: { givenName: "Showcase", familyName: "Manager", roles: ["kit_manager"] },
    clint: { givenName: "Showcase", familyName: "President", roles: ["media_secretary"] },
    coach: { givenName: "Showcase", familyName: "Coach", roles: ["special_teams_coach"] },
    tokenSecret: "showcase-test-secret-0123456789",
    accessEndsOn: "2026-12-31",
    labels: {
      currentSeason: "Showcase test current",
      archivedSeason: "Showcase test archived",
      vocabularyCode: "showcase_test_vocab",
      seasonStatus: "archived",
    },
    ...overrides,
  };
}
