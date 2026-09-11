import { Section } from "@/components/section";
import { RecordRow as Fact } from "@/components/record-field";
import { NotRecorded } from "@/components/fact";
import { formatDay } from "@/app/operate/roster/presentation";
import Stack from "@mui/material/Stack";
import type { PersonRecord } from "@/lib/services/person-record";

/** "Academic" — only when `visible.college !== undefined` (page decides). */
export function AcademicSection({ record }: { record: PersonRecord }) {
  return (
    <Section variant="banded" band="person" title="Academic">
      <Fact label="College" note={record.collegeSource ?? undefined}>
        {record.college !== null ? <>{record.college}</> : <NotRecorded />}
      </Fact>
      <Fact label="Matriculation year" note={record.matriculationYearSource ?? undefined}>
        {record.matriculationYear !== null ? <>{record.matriculationYear}</> : <NotRecorded />}
      </Fact>
      <Fact label="Expected graduation" note={record.expectedGraduationYearSource ?? undefined}>
        {record.expectedGraduationYear !== null ? (
          <>{record.expectedGraduationYear}</>
        ) : (
          <NotRecorded />
        )}
      </Fact>
      <Fact label="Degree field" note={record.degreeFieldSource ?? undefined}>
        {record.degreeField !== null ? <>{record.degreeField}</> : <NotRecorded />}
      </Fact>
      {/* LAN-267: two personal facts under the same handling as the rest of
          this section. */}
      <Fact label="Student number" note={record.studentNumberSource ?? undefined}>
        {record.studentNumber !== null ? <>{record.studentNumber}</> : <NotRecorded />}
      </Fact>
      <Fact
        label="BAFA registration number"
        note={record.bafaRegistrationNumberSource ?? undefined}
      >
        {record.bafaRegistrationNumber !== null ? (
          <>{record.bafaRegistrationNumber}</>
        ) : (
          <NotRecorded />
        )}
      </Fact>
    </Section>
  );
}

/** "Restricted" — only when `visible.dateOfBirth !== undefined` (page decides). */
export function RestrictedSection({ record }: { record: PersonRecord }) {
  return (
    <Section variant="banded" band="person" title="Restricted">
      <Fact label="Date of birth" note={record.dateOfBirthSource ?? undefined}>
        {record.dateOfBirth !== null ? <>{formatDay(record.dateOfBirth)}</> : <NotRecorded />}
      </Fact>
      <Fact label="Under 18">
        {record.isUnder18 === null ? <NotRecorded /> : record.isUnder18 ? "Yes" : "No"}
      </Fact>
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
    </Section>
  );
}
