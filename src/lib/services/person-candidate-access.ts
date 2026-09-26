import type { OperatorGrants } from "@/lib/auth/grants";
import { mayViewRecruiting, mayViewRoster } from "@/lib/auth/roster-access";
import type { PersonDuplicateCandidate } from "./person-duplicate";
import type { CandidateIdentity } from "./recruitment-candidate-identity";
import type { PersonCandidate } from "./roster";

/**
 * The duplicate check's matches as one seat may receive them — LAN-423. Pure.
 *
 * Add player and Add recruit are opened by a switch, not by a roster or
 * recruiting category, so the matches they list are narrowed by the seat's own
 * grants before they leave the server, the way `event-audience-access.ts`
 * narrows an audience. The name and why it matched always travel: that is
 * what the step is for, choosing "this is the same person" or "a new person".
 *
 * - Email and phone: Contact & emergency at View (Add player), Person
 *   information at View (Add recruit).
 * - Membership status: Membership at View. Whether the person already holds a
 *   membership this season still travels — it decides whether choosing them
 *   is refused — but not its status.
 * - A recruit's status (Add recruit): Recruit details at View.
 */

/** Which facts were withheld from this seat, so the form omits them rather than calling them missing. */
interface WithheldCandidateFacts {
  readonly contact: boolean;
  readonly membershipStatus: boolean;
}

export type SeatPersonCandidate = PersonCandidate & { readonly withheld: WithheldCandidateFacts };

/** Add player's matches narrowed to one seat. */
export function redactRosterCandidates(
  candidates: readonly PersonCandidate[],
  grants: OperatorGrants,
): SeatPersonCandidate[] {
  const contact = mayViewRoster(grants, "contact_emergency");
  const membership = mayViewRoster(grants, "membership");
  return candidates.map((candidate) => ({
    personId: candidate.personId,
    givenName: candidate.givenName,
    familyName: candidate.familyName,
    displayAlias: candidate.displayAlias,
    email: contact ? candidate.email : null,
    phone: contact ? candidate.phone : null,
    currentMembership:
      candidate.currentMembership && !membership
        ? { ...candidate.currentMembership, status: "" }
        : candidate.currentMembership,
    matchedOn: [...candidate.matchedOn],
    withheld: { contact: !contact, membershipStatus: !membership },
  }));
}

type RecruitCandidate = PersonDuplicateCandidate & { readonly identity: CandidateIdentity };

/** Add recruit's matches narrowed to one seat. */
export function redactRecruitCandidates(
  candidates: readonly RecruitCandidate[],
  grants: OperatorGrants,
): RecruitCandidate[] {
  const contact = mayViewRecruiting(grants, "recruit_person");
  const membership = mayViewRoster(grants, "membership");
  const recruitDetails = mayViewRecruiting(grants, "recruit_details");
  return candidates.map((candidate) => ({
    personId: candidate.personId,
    givenName: candidate.givenName,
    familyName: candidate.familyName,
    displayAlias: candidate.displayAlias,
    displayName: candidate.displayName,
    currentEmails: contact ? [...candidate.currentEmails] : [],
    currentPhones: contact ? [...candidate.currentPhones] : [],
    matchedOn: [...candidate.matchedOn],
    identity: redactIdentity(candidate.identity, membership, recruitDetails),
  }));
}

function redactIdentity(
  identity: CandidateIdentity,
  membership: boolean,
  recruitDetails: boolean,
): CandidateIdentity {
  if (identity.kind === "player" && !membership) return { ...identity, membershipStatus: "" };
  if (identity.kind === "recruit" && !recruitDetails) return { ...identity, prospectStatus: "" };
  return identity;
}
