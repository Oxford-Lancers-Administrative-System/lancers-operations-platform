import { Section } from "@/components/section";
import { RecordRow as Fact } from "@/components/record-field";
import { NotRecorded } from "@/components/fact";
import { formatDay } from "@/app/operate/roster/presentation";
import Stack from "@mui/material/Stack";
import type { VisiblePersonRecord } from "./identity-contact-sections";

// LAN-365, Brian 2026-09-16: "no academic section." The two identifiers left
// first, and the correction round folded the remaining four academic facts
// (college, matriculation year, expected graduation, degree field) into
// `IdentitySection` too — see that file. Nothing academic is rendered
// separately any more; only `RestrictedSection` remains here.

/**
 * "Restricted" — Person's. The emergency contact inside it is Contact &
 * emergency's (LAN-432): its row is drawn only when the redaction left it.
 */
export function RestrictedSection({ record }: { record: VisiblePersonRecord }) {
  return (
    <Section variant="banded" band="person" title="Restricted">
      <Fact label="Date of birth" note={record.dateOfBirthSource ?? undefined}>
        {record.dateOfBirth != null ? <>{formatDay(record.dateOfBirth)}</> : <NotRecorded />}
      </Fact>
      <Fact label="Under 18">
        {record.isUnder18 == null ? <NotRecorded /> : record.isUnder18 ? "Yes" : "No"}
      </Fact>
      {record.emergencyContact === undefined ? null : (
        <Fact label="Emergency contact">
          {record.emergencyContact ? (
            <Stack>
              <span>
                {record.emergencyContact.givenName}
                {record.emergencyContact.familyName ? ` ${record.emergencyContact.familyName}` : ""}
                {record.emergencyContact.relationship
                  ? ` · ${record.emergencyContact.relationship}`
                  : ""}
              </span>
              <span>
                {[record.emergencyContact.phone, record.emergencyContact.email]
                  .filter(Boolean)
                  .join(" · ") || <NotRecorded />}
              </span>
            </Stack>
          ) : (
            <NotRecorded />
          )}
        </Fact>
      )}
    </Section>
  );
}
