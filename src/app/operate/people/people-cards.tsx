import { StatusChip } from "@/components/status-chip";
import { RowCard, RowCardList } from "@/components/row-card";
import type { PersonListEntry } from "@/lib/services/people-directory";
import { labelFor, STATUS_LABELS } from "./presentation";

function StatusCell({ status }: { status: PersonListEntry["status"] }) {
  if (status === null) return null;
  return (
    <StatusChip
      domain={status === "recruit" ? "personType" : "membership"}
      status={status}
      label={labelFor(STATUS_LABELS, status)}
    />
  );
}

function PersonCard({ person }: { person: PersonListEntry }) {
  return (
    <RowCard
      testId="people-card"
      title={person.displayName}
      href={`/operate/people/${person.personId}`}
      chips={person.status !== null ? <StatusCell status={person.status} /> : undefined}
      sublines={[
        ...(person.matchedAlias ? [`matched alias “${person.matchedAlias}”`] : []),
        ...(person.clubRoleSummary ? [person.clubRoleSummary] : []),
        ...(person.missingRequiredFields.length > 0
          ? [`${person.missingRequiredFields.length} missing`]
          : []),
      ]}
    />
  );
}

/** Phone: one card per person, the same `entries` the desktop table renders. */
export default function PeopleCards({ entries }: { entries: readonly PersonListEntry[] }) {
  return (
    <RowCardList>
      {entries.map((person) => (
        <PersonCard key={person.personId} person={person} />
      ))}
    </RowCardList>
  );
}
