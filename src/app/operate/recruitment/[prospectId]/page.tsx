import { notFound } from "next/navigation";
import { isServiceError } from "@/lib/db";
import { readRecruitmentProspect } from "@/lib/services/recruitment-prospect";
import { readPersonRecord } from "@/lib/services/person-record";
import { redactPersonRecord } from "@/lib/auth/person-authority";
import type { PersonRecord } from "@/lib/services/person-record";
import {
  listPersonRoleAssignments,
  listPersonSeasons,
  readPersonHistory,
  type PersonHistoryEntry,
  type PersonRoleAssignment,
  type PersonSeasonRecord,
} from "@/lib/services/people-directory";
import { readCurrentSeason } from "@/lib/services/seasons";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import RecruitmentRecordView from "./record-view";
import { operatorHoldsGrant } from "@/lib/auth/guards";
import { RECRUITING_REACH } from "@/lib/auth/roster-access";
import { recruitingAccessFor, redactProspectRecord } from "@/lib/services/recruitment-board-access";

// `/operate/recruitment/[prospectId]` — `W2`, LAN-204, on ../roster/[membershipId]'s shell (LAN-187).
export default async function RecruitmentRecordPage({
  params,
}: PageProps<"/operate/recruitment/[prospectId]">) {
  const { prospectId } = await params;
  // LAN-432: records open for anyone who reaches Recruitment; each section
  // then follows its recruiting category, and a `none` section's contents
  // never leave this server.
  const gate = await gateShellPage(`/operate/recruitment/${prospectId}`, RECRUITING_REACH);
  if ("screen" in gate) return gate.screen;
  const { operator } = gate;
  const access = recruitingAccessFor(operator.grants);
  const personOpen = access.recruit_person !== "none";

  let record: Awaited<ReturnType<typeof readRecruitmentProspect>>;
  try {
    record = await readRecruitmentProspect(prospectId);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title="Recruit"
        message={error.message}
        testId="recruitment-record-unavailable"
      />
    );
  }
  if (!record) notFound();

  let person: Partial<PersonRecord> = {};
  if (personOpen) {
    try {
      const fullPerson = await readPersonRecord(record.personId);
      person = redactPersonRecord(
        fullPerson as unknown as Record<string, unknown>,
        operator.grants,
        "recruiting",
      ) as unknown as Partial<PersonRecord>;
    } catch (error) {
      if (!isServiceError(error)) throw error;
      person = {};
    }
  }

  /**
   * LAN-307. The same sections the canonical person page draws, from the same
   * record and the same redaction — an operator looking at a recruit before
   * pressing send should not have to open a second page to find out what the
   * club holds about them, or where the message is going. LAN-432: they are
   * Person information's (Their seasons too), and What changed is Recruit
   * details'; none of them is read for a seat holding its category at `none`.
   */
  const [roles, seasons, fullHistory, currentSeason]: [
    readonly PersonRoleAssignment[],
    readonly PersonSeasonRecord[],
    readonly PersonHistoryEntry[],
    { label: string } | null,
  ] = await Promise.all([
    personOpen ? listPersonRoleAssignments(record.personId) : Promise.resolve([]),
    personOpen ? listPersonSeasons(record.personId) : Promise.resolve([]),
    access.recruit_details !== "none" ? readPersonHistory(record.personId) : Promise.resolve([]),
    readCurrentSeason().catch(() => null),
  ]);

  // A change to a contact point or the emergency contact carries the value
  // itself; on a recruit it is Person information's, as the People page keeps
  // it to Contact & emergency.
  const history = personOpen ? fullHistory : fullHistory.filter((entry) => !entry.contactFact);

  const alumniLabel = person.isPastMember
    ? "Alumnus"
    : seasons.length > 0
      ? "Current member"
      : "Never a member";

  return (
    <RecruitmentRecordView
      record={redactProspectRecord(record, access)}
      person={person}
      mayOpenPerson={operatorHoldsGrant(operator, { kind: "roster", key: "person" }, "view")}
      roles={roles}
      seasons={seasons}
      history={history}
      alumniLabel={alumniLabel}
      currentSeasonLabel={currentSeason?.label ?? null}
    />
  );
}
