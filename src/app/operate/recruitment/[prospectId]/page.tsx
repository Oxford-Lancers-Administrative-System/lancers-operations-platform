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

// `/operate/recruitment/[prospectId]` — `W2`, LAN-204, on ../roster/[membershipId]'s shell (LAN-187).
export default async function RecruitmentRecordPage({
  params,
}: PageProps<"/operate/recruitment/[prospectId]">) {
  const { prospectId } = await params;
  const gate = await gateShellPage(`/operate/recruitment/${prospectId}`, "person_record_authority");
  if ("screen" in gate) return gate.screen;
  const { operator } = gate;

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

  let person: Partial<PersonRecord>;
  try {
    const fullPerson = await readPersonRecord(record.personId);
    person = redactPersonRecord(
      fullPerson as unknown as Record<string, unknown>,
      operator.roleCodes,
    ) as unknown as Partial<PersonRecord>;
  } catch (error) {
    if (!isServiceError(error)) throw error;
    person = {};
  }

  /**
   * LAN-307. The same sections the canonical person page draws, from the same
   * record and the same redaction — an operator looking at a recruit before
   * pressing send should not have to open a second page to find out what the
   * club holds about them, or where the message is going. No new grant: this
   * page already gates on `person_record_authority`, and `redactPersonRecord`
   * above still decides every field.
   */
  const [roles, seasons, history, currentSeason]: [
    readonly PersonRoleAssignment[],
    readonly PersonSeasonRecord[],
    readonly PersonHistoryEntry[],
    { label: string } | null,
  ] = await Promise.all([
    listPersonRoleAssignments(record.personId),
    listPersonSeasons(record.personId),
    readPersonHistory(record.personId),
    readCurrentSeason().catch(() => null),
  ]);

  const alumniLabel = person.isPastMember
    ? "Alumnus"
    : seasons.length > 0
      ? "Current member"
      : "Never a member";

  return (
    <RecruitmentRecordView
      record={record}
      person={person}
      roles={roles}
      seasons={seasons}
      history={history}
      alumniLabel={alumniLabel}
      currentSeasonLabel={currentSeason?.label ?? null}
    />
  );
}
