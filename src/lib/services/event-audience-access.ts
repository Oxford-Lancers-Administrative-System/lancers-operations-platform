import type { OperatorGrants } from "@/lib/auth/grants";
import { mayViewRoster, recruitingLevel } from "@/lib/auth/roster-access";
import {
  audienceOptionsForEventType,
  candidateInGroup,
  type AudienceCandidate,
  type AudienceCapacity,
} from "./audience-selection";
import {
  COACHING_GROUP_VALUES,
  DEFENSIVE_POSITION_GROUP_VALUES,
  OFFENSIVE_POSITION_GROUP_VALUES,
} from "./roster-board/vocabulary";

/**
 * An event's audience as one seat may receive it — LAN-423. Pure.
 *
 * Choosing an audience needs Manage on the event's template and nothing on the
 * roster, so the per-person detail the catalogue carries is withheld by the
 * seat's own grants before it leaves the server. Names, capacities, seats held
 * and the group structure always travel: an audience is built from its groups,
 * so every candidate carries the group tokens it falls into, worked out here
 * from the full facts before they are dropped.
 *
 * - Contact (phone or email): Contact & emergency at View.
 * - A player's membership status, and BPS and onboarding behind the groups:
 *   Membership at View.
 * - A recruit's status: Recruit details at View.
 * - A player's unit: Offensive, Defensive and Special teams at View (it is
 *   read from the sides of all three).
 * - Coaching and position groups, warmup group, special-teams squads: their
 *   own roster category at View.
 */

type Visibility = Readonly<{
  contact: boolean;
  membership: boolean;
  recruitDetails: boolean;
  unit: boolean;
  coachingValues: ReadonlySet<string>;
  warmup: boolean;
  specialTeams: boolean;
}>;

function visibilityFor(grants: OperatorGrants): Visibility {
  const coachingValues = new Set<string>([
    ...(mayViewRoster(grants, "coaching") ? COACHING_GROUP_VALUES : []),
    ...(mayViewRoster(grants, "offensive") ? OFFENSIVE_POSITION_GROUP_VALUES : []),
    ...(mayViewRoster(grants, "defensive") ? DEFENSIVE_POSITION_GROUP_VALUES : []),
  ]);
  return {
    contact: mayViewRoster(grants, "contact_emergency"),
    membership: mayViewRoster(grants, "membership"),
    recruitDetails: recruitingLevel(grants, "recruit_details") !== "none",
    unit:
      mayViewRoster(grants, "offensive") &&
      mayViewRoster(grants, "defensive") &&
      mayViewRoster(grants, "special_teams"),
    coachingValues,
    warmup: mayViewRoster(grants, "warmup"),
    specialTeams: mayViewRoster(grants, "special_teams"),
  };
}

/** Whether this capacity's standing is a category fact the seat cannot read. */
function standingWithheld(capacity: AudienceCapacity, visible: Visibility): boolean {
  if (capacity === "player") return !visible.membership;
  if (capacity === "recruit") return !visible.recruitDetails;
  return false; // a coach's or committee member's standing is the seats they hold
}

/**
 * The audience catalogue's candidates narrowed to one seat. `extraTokens` are
 * group tokens the page will press besides the event type's own catalogue
 * (the template's and the saved event's), so their membership is known too.
 */
export function redactAudienceCandidates(
  candidates: readonly AudienceCandidate[],
  grants: OperatorGrants,
  eventType: string,
  extraTokens: readonly string[] = [],
): AudienceCandidate[] {
  const visible = visibilityFor(grants);
  const tokens = [
    ...new Set([
      ...audienceOptionsForEventType(eventType).map((option) => option.token),
      ...audienceOptionsForEventType(eventType, { templateOnly: true }).map(
        (option) => option.token,
      ),
      ...extraTokens,
    ]),
  ];

  return candidates.map((candidate) => {
    const out: AudienceCandidate = {
      key: candidate.key,
      capacity: candidate.capacity,
      anchorId: candidate.anchorId,
      personId: candidate.personId,
      displayName: candidate.displayName,
      standing: standingWithheld(candidate.capacity, visible) ? "" : candidate.standing,
      unit: visible.unit ? candidate.unit : null,
      contact: visible.contact ? candidate.contact : null,
      groups: tokens.filter((token) => candidateInGroup(candidate, token)),
    };
    if (visible.membership) {
      if (candidate.isBps !== undefined) out.isBps = candidate.isBps;
      if (candidate.isOnboarding !== undefined) out.isOnboarding = candidate.isOnboarding;
    }
    if (candidate.coachingValues !== undefined) {
      out.coachingValues = candidate.coachingValues.filter((value) =>
        visible.coachingValues.has(value),
      );
    }
    if (visible.warmup && candidate.warmupGroup !== undefined) {
      out.warmupGroup = candidate.warmupGroup;
    }
    if (visible.specialTeams && candidate.specialTeamsSquads !== undefined) {
      out.specialTeamsSquads = candidate.specialTeamsSquads;
    }
    if (visible.recruitDetails && candidate.recruitStatus !== undefined) {
      out.recruitStatus = candidate.recruitStatus;
    }
    return out;
  });
}

/** An event's saved audience narrowed to one seat: the standing follows the same rule. */
export function redactAudienceMembers<
  T extends { readonly capacity: AudienceCapacity; readonly standing: string },
>(members: readonly T[], grants: OperatorGrants): T[] {
  const visible = visibilityFor(grants);
  return members.map((member) =>
    standingWithheld(member.capacity, visible) ? { ...member, standing: "" } : member,
  );
}
