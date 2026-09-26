import { notFound } from "next/navigation";
import { isServiceError } from "@/lib/db";
import { readPersonRecord } from "@/lib/services/person-record";
import { personVersion } from "@/lib/services/person-write";
import { readCurrentSeason } from "@/lib/services/seasons";
import { gateShellPage } from "../../../gate";
import EditPersonForm from "./edit-person-form";
import type { AccessRule } from "@/lib/auth/access";
import { mayEditRoster } from "@/lib/auth/roster-access";

// `/operate/people/[personId]/edit` — W2-01..W2-10, LAN-185.

const MAY_CORRECT: AccessRule = Object.freeze({
  either: Object.freeze([
    Object.freeze({ subject: Object.freeze({ kind: "roster", key: "person" }), minimum: "edit" }),
    Object.freeze({
      subject: Object.freeze({ kind: "roster", key: "contact_emergency" }),
      minimum: "edit",
    }),
  ]),
}) as AccessRule;
export default async function EditPersonPage({
  params,
}: PageProps<"/operate/people/[personId]/edit">) {
  const { personId } = await params;
  // LAN-432: correcting the record needs Person or Contact & emergency at
  // edit; the form draws, and is sent, only the categories the seat may edit.
  const gate = await gateShellPage(`/operate/people/${personId}/edit`, MAY_CORRECT);
  if ("screen" in gate) return gate.screen;
  const mayEditPerson = mayEditRoster(gate.operator.grants, "person");
  const mayEditContact = mayEditRoster(gate.operator.grants, "contact_emergency");

  let record;
  try {
    record = await readPersonRecord(personId);
  } catch (error) {
    if (isServiceError(error) && error.kind === "not_found") notFound();
    throw error;
  }

  const version = await personVersion(personId);
  // B3, round 2: the inline WhatsApp-seam preview needs the active season's label.
  const season = await readCurrentSeason().catch(() => null);

  return (
    <EditPersonForm
      personId={personId}
      record={{
        displayName: record.displayName,
        contacts: mayEditContact ? record.contacts : [],
        emergencyContact: mayEditContact ? record.emergencyContact : null,
        givenName: mayEditPerson ? record.givenName : "",
        middleName: mayEditPerson ? record.middleName : null,
        familyName: mayEditPerson ? record.familyName : null,
        aliases: mayEditPerson ? record.aliases : [],
        college: mayEditPerson ? record.college : null,
        matriculationYear: mayEditPerson ? record.matriculationYear : null,
        expectedGraduationYear: mayEditPerson ? record.expectedGraduationYear : null,
        degreeField: mayEditPerson ? record.degreeField : null,
        studentNumber: mayEditPerson ? record.studentNumber : null,
        bafaRegistrationNumber: mayEditPerson ? record.bafaRegistrationNumber : null,
        dateOfBirth: mayEditPerson ? record.dateOfBirth : null,
      }}
      mayEditPerson={mayEditPerson}
      mayEditContact={mayEditContact}
      expectedVersion={version}
      seasonLabel={season?.label ?? "the active season"}
    />
  );
}
