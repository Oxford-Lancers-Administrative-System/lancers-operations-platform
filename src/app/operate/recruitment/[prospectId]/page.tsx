import { notFound } from "next/navigation";
import { isServiceError } from "@/lib/db";
import { readRecruitmentProspect } from "@/lib/services/recruitment-prospect";
import { readPersonRecord } from "@/lib/services/person-record";
import { redactPersonRecord } from "@/lib/auth/person-authority";
import type { PersonRecord } from "@/lib/services/person-record";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import RecruitmentRecordView from "./record-view";

/**
 * `/operate/recruitment/[prospectId]` — `W2`, LAN-204. One recruit's record,
 * on the shipped player record's own banded-card shell (`../roster/[membershipId]`,
 * LAN-187), gated on the same four-office `person_record_authority`.
 */
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

  return <RecruitmentRecordView record={record} person={person} />;
}
