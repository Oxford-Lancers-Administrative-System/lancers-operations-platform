import {
  ROSTER_CATEGORIES,
  type CategoryLevel,
  type OperatorGrants,
  type RosterCategory,
} from "@/lib/auth/grants";
import { rosterLevel } from "@/lib/auth/roster-access";
import type { PlayerRecordData } from "./player-record";

/**
 * The player record as one seat may receive it — LAN-432, W3 of mission
 * M-GRANULAR-ROLES-AND-PERMISSIONS (LAN-423).
 *
 * Pure. `readPlayerRecord` assembles the whole record; this narrows it to the
 * seat's grants **before** it leaves the server, so a section held at `none`
 * is not hidden in the page but absent from the response: its keys are not
 * on the object at all. The person half is narrowed separately by
 * `redactPersonRecord` (`@/lib/auth/person-authority`), which reads Person and
 * Contact & emergency the same way.
 *
 * Which category each part reads as (the packet's W3 map):
 *
 * | Part                                                                   | Category     |
 * | ---------------------------------------------------------------------- | ------------ |
 * | onboarding items, outstanding, Activity, the questionnaire send        | Onboarding   |
 * | status, entry, milestones, jerseys, Blues, eligibility, BPS, Their     | Membership   |
 * | other seasons, Status history, constitutional membership               |              |
 * | availability                                                           | Availability |
 * | the three position-group multi-selects                                 | Coaching     |
 * | the two offence slots and their vocabulary                             | Offensive    |
 * | the two defence slots and their vocabulary                             | Defensive    |
 * | the twenty-four special-teams cells                                    | Special teams|
 * | the warmup small group                                                 | Warmup       |
 * | the eleven kit items and formalwear                                    | Kit          |
 * | attendance                                                             | always open  |
 *
 * The name always travels: it stays at the top of a record whatever the seat
 * holds. `closed` travels too — a departed or archived membership takes no
 * writes in any section — without the status that decides it.
 */

type SeasonFacts = PlayerRecordData["season"];

/** A seat's level on each roster category, as the record view draws its sections. */
export type RecordAccess = Readonly<Record<RosterCategory, CategoryLevel>>;

/** Every category at `edit` — what a record drawn without a seat (a test fixture) means. */
export const FULL_RECORD_ACCESS: RecordAccess = Object.freeze(
  Object.fromEntries(ROSTER_CATEGORIES.map((category) => [category, "edit"])) as Record<
    RosterCategory,
    CategoryLevel
  >,
);

type MembershipKeys =
  | "status"
  | "entry"
  | "confirmedOn"
  | "activatedOn"
  | "departedOn"
  | "expectedReturnOn"
  | "inactivityLabel"
  | "isConstitutionalMember"
  | "statusHistory"
  | "otherSeasons"
  | "jerseyHolders";

type OnboardingKeys = "onboardingItems" | "outstandingRequired" | "activityLog" | "send";

/**
 * What the record view receives. Everything a category owns is optional,
 * because for a seat holding that category at `none` it is not there.
 */
export type VisiblePlayerRecord = Pick<
  PlayerRecordData,
  "membershipId" | "personId" | "seasonId" | "seasonLabel" | "attendance"
> &
  Partial<Pick<PlayerRecordData, MembershipKeys | OnboardingKeys>> & {
    season: Partial<SeasonFacts>;
    positionOptions: PlayerRecordData["positionOptions"];
    /** The name at the top of the record. */
    displayName?: string;
    /** Departed or archived: nothing on the record takes a write. */
    closed?: boolean;
    /** The seat's level on each category. Absent means every category at `edit`. */
    access?: RecordAccess;
  };

/** Which season facts each category owns. */
const SEASON_FACT_CATEGORY: Readonly<Record<keyof SeasonFacts, RosterCategory>> = Object.freeze({
  blueNumbers: "membership",
  whiteNumbers: "membership",
  blues: "membership",
  bps: "membership",
  eligibility: "membership",
  availability: "availability",
  coachingGroups: "coaching",
  offensivePositionGroups: "coaching",
  defensivePositionGroups: "coaching",
  offencePosition: "offensive",
  offenceBackupPosition: "offensive",
  defencePosition: "defensive",
  defenceBackupPosition: "defensive",
  specialTeams: "special_teams",
  warmupSmallGroup: "warmup",
  kit: "kit",
  formalwear: "kit",
});

/** The seat's level on every roster category. */
function recordAccessFor(grants: OperatorGrants): RecordAccess {
  return Object.freeze(
    Object.fromEntries(
      ROSTER_CATEGORIES.map((category) => [category, rosterLevel(grants, category)]),
    ) as Record<RosterCategory, CategoryLevel>,
  );
}

/**
 * The record narrowed to a seat's grants: every `none` category's keys
 * removed, the person record removed (the caller sends `redactPersonRecord`'s
 * result instead), and the seat's levels attached for the view.
 */
export function redactPlayerRecord(
  data: PlayerRecordData,
  grants: OperatorGrants,
): VisiblePlayerRecord {
  const access = recordAccessFor(grants);
  const open = (category: RosterCategory) => access[category] !== "none";

  const season: Partial<SeasonFacts> = {};
  const seasonTarget = season as Record<string, unknown>;
  for (const [key, category] of Object.entries(SEASON_FACT_CATEGORY)) {
    if (open(category)) seasonTarget[key] = data.season[key as keyof SeasonFacts];
  }

  const visible: VisiblePlayerRecord = {
    membershipId: data.membershipId,
    personId: data.personId,
    seasonId: data.seasonId,
    seasonLabel: data.seasonLabel,
    displayName: data.person.displayName,
    closed: data.status === "departed" || data.status === "archived",
    attendance: data.attendance,
    access,
    season,
    positionOptions: {
      offence: open("offensive") ? data.positionOptions.offence : [],
      defence: open("defensive") ? data.positionOptions.defence : [],
    },
  };

  if (open("membership")) {
    visible.status = data.status;
    visible.entry = data.entry;
    visible.confirmedOn = data.confirmedOn;
    visible.activatedOn = data.activatedOn;
    visible.departedOn = data.departedOn;
    visible.expectedReturnOn = data.expectedReturnOn;
    visible.inactivityLabel = data.inactivityLabel;
    visible.isConstitutionalMember = data.isConstitutionalMember;
    visible.statusHistory = data.statusHistory;
    visible.otherSeasons = data.otherSeasons;
    // Who wears each number: only the jersey editor uses it.
    if (access.membership === "edit") visible.jerseyHolders = data.jerseyHolders;
  }

  if (open("onboarding")) {
    visible.onboardingItems = data.onboardingItems;
    visible.outstandingRequired = data.outstandingRequired;
    visible.activityLog = data.activityLog;
    visible.send = data.send;
  }

  return visible;
}
