import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { isShowedPresence } from "@/lib/services/attendance-vocabulary";
import type { PersonRecord } from "@/lib/services/person-record";
import type { AttendanceEvent, PlayerRecordData } from "@/lib/services/player-record";
import { Fact, FactList } from "@/components/fact";
import { Metric, MetricRow } from "@/components/metric";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { DesktopOnly, RowCard, RowCardList } from "@/components/row-card";
import { Section } from "@/components/section";
import { TableFrame } from "@/components/sortable-header";
import { StatusChip } from "@/components/status-chip";
import {
  AVAILABILITY_LABELS,
  ELIGIBILITY_LABELS,
  FORMALWEAR_ITEMS,
  FORMALWEAR_LABELS,
} from "@/app/operate/roster/board-columns";
import {
  ENTRY_LABELS,
  formatDay,
  formatWhen,
  labelFor,
  MEMBERSHIP_STATUS_LABELS,
} from "@/app/operate/roster/presentation";
// LAN-217 replaced the flat `ONBOARDING_ITEM_LABELS` map with a per-item
// lookup, because the word for a status varies by item — "Invoiced" is not
// "Complete" (D-002). The preview reads the same function the record does, so
// the two cannot drift apart.
import { itemStateLabel } from "@/lib/services/onboarding-item-shapes";
import { formatShortDate } from "@/lib/services/event-vocabulary";

/**
 * The player record, rendered from the kit — LAN-225 S2.
 *
 * Every section, fact and value `record-view.tsx` shows, in the same order:
 * the headline row as one `MetricRow` (C5), the banded sections on the
 * brief's bands (A1), one `Fact` shape throughout (E5), the attendance table
 * on the neutral band with `StatusChip`s reading the one vocabulary (A4).
 */
const RSVP_LABEL: Readonly<Record<string, string>> = { yes: "Yes", no: "No" };
const ATTENDANCE_LABEL: Readonly<Record<string, string>> = {
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
};
const EVENT_STATUS_LABEL: Readonly<Record<string, string>> = {
  upcoming: "Upcoming",
  occurred: "Occurred",
  cancelled: "Cancelled",
};

export default function PlayerRecordPreview({
  record,
  person,
}: {
  record: PlayerRecordData;
  person: Partial<PersonRecord>;
}) {
  const closed = record.status === "departed" || record.status === "archived";
  const resolvedCount = record.onboardingItems.filter((item) =>
    ["complete", "waived", "not_applicable"].includes(item.status),
  ).length;
  const bluesTotal =
    person.fullBlueCount || person.halfBlueCount
      ? [
          person.fullBlueCount ? `${person.fullBlueCount} Full` : null,
          person.halfBlueCount ? `${person.halfBlueCount} Half` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "None";
  const personalEmail = currentContact(person.contacts, "email", "personal");
  const mobile = currentContact(person.contacts, "phone", null);
  const missing = person.missingRequiredFields?.length ?? 0;

  const occurred = record.attendance.filter((event) => event.eventStatus === "occurred");
  const scored = occurred.filter((event) => event.isMandatory && event.attendance !== null);
  const attended = scored.filter((event) => isShowedPresence(event.attendance));
  const pct = scored.length === 0 ? null : Math.round((attended.length / scored.length) * 100);
  const unrecorded = occurred.filter(
    (event) => event.isMandatory && event.attendance === null,
  ).length;

  return (
    <Stack spacing={3}>
      <PageHeader
        eyebrow="Player record"
        title={person.displayName ?? record.membershipId}
        subtitle={`${record.seasonLabel} membership · ${labelFor(ENTRY_LABELS, record.entry)}`}
        back={{ href: "/design-preview/roster", label: "Back to roster" }}
        status={
          <StatusChip
            domain="membership"
            status={record.status}
            label={labelFor(MEMBERSHIP_STATUS_LABELS, record.status)}
            size="medium"
          />
        }
        actions={
          <Button variant="outlined" href={`/operate/people/${record.personId}`}>
            Open the person record
          </Button>
        }
      />

      <MetricRow columns={missing > 0 ? 5 : 4} testId="record-metrics">
        <Metric
          value={
            record.onboardingItems.length === 0
              ? "—"
              : `${resolvedCount} of ${record.onboardingItems.length}`
          }
          label="Onboarding items resolved"
        />
        <Metric value={labelFor(ENTRY_LABELS, record.entry)} label="Entry" />
        <Metric value={bluesTotal} label="Blues total" caption="All seasons" />
        <Metric
          value={record.isConstitutionalMember ? "Yes" : "No"}
          label="Constitutional member"
          caption="Derived"
        />
        {missing > 0 ? (
          <Metric
            value={
              <StatusChip
                domain="onboardingItem"
                status="outstanding"
                label={`${missing} missing`}
              />
            }
            label="Required facts"
          />
        ) : null}
      </MetricRow>

      <Section variant="banded" band="person" title="Person" testId="person">
        <FactList>
          <Fact label="Name" value={person.displayName ?? null} layout="inline" />
          <Fact label="Aliases" value={joinAliases(person.aliases)} layout="inline" />
          <Fact label="Mobile phone" value={mobile} layout="inline" />
          <Fact label="Personal email" value={personalEmail} layout="inline" />
          <Fact label="College" value={person.college ?? null} layout="inline" />
          <Fact
            label="Matriculation year"
            value={person.matriculationYear != null ? String(person.matriculationYear) : null}
            layout="inline"
          />
          <Fact
            label="Expected graduation"
            value={
              person.expectedGraduationYear != null ? String(person.expectedGraduationYear) : null
            }
            layout="inline"
          />
          <Fact label="Degree field" value={person.degreeField ?? null} layout="inline" />
          <Fact
            label="Date of birth"
            value={person.dateOfBirth ? formatDay(person.dateOfBirth) : null}
            layout="inline"
          />
          <Fact
            label="Emergency contact"
            value={formatEmergencyContact(person.emergencyContact)}
            layout="inline"
          />
          <Fact
            label="Under 18"
            value={
              person.isUnder18 === null || person.isUnder18 === undefined
                ? null
                : person.isUnder18
                  ? "Yes"
                  : "No"
            }
            note="Derived from date of birth"
            layout="inline"
          />
        </FactList>
      </Section>

      <Section variant="banded" band="onboarding" title="Onboarding" testId="onboarding">
        {record.onboardingItems.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            This season has no onboarding items configured, so this membership has none.
          </Typography>
        ) : (
          <FactList>
            {record.onboardingItems.map((item) => (
              <Fact
                key={item.id}
                label={item.label}
                layout="inline"
                value={
                  <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{ flexWrap: "wrap", gap: 0.75, alignItems: "center" }}
                  >
                    <StatusChip
                      domain="onboardingItem"
                      status={item.status}
                      label={itemStateLabel(item.code, item.status)}
                    />
                    {item.isRequired ? (
                      <StatusChip domain="onboardingItem" status="required" label="Required" />
                    ) : null}
                    {item.isSubscription ? (
                      <StatusChip
                        domain="onboardingItem"
                        status="never_blocks"
                        label="Never blocks activation"
                      />
                    ) : null}
                  </Stack>
                }
                provenance={provenanceNote(item)}
              />
            ))}
          </FactList>
        )}
        {record.outstandingRequired.length > 0 ? (
          <Stack sx={{ py: 1.5 }}>
            <Notice severity="info" testId="outstanding-note">
              {`${record.outstandingRequired.length === 1 ? "One required item is" : `${record.outstandingRequired.length} required items are`} still outstanding: ${record.outstandingRequired.map((item) => item.label).join(", ")}.`}
            </Notice>
          </Stack>
        ) : null}
      </Section>

      <Section
        variant="banded"
        band="season"
        title={`Season · ${record.seasonLabel}`}
        testId="season"
      >
        <FactList>
          <Fact
            label="Status"
            layout="inline"
            value={
              <StatusChip
                domain="membership"
                status={record.status}
                label={labelFor(MEMBERSHIP_STATUS_LABELS, record.status)}
              />
            }
            note={closed ? "This season is over. Nothing here changes it." : undefined}
          />
          <Fact label="Entry" value={labelFor(ENTRY_LABELS, record.entry)} layout="inline" />
          <Fact
            label="Confirmed"
            value={record.confirmedOn ? formatDay(record.confirmedOn) : null}
            layout="inline"
          />
          <Fact
            label="Activated"
            value={record.activatedOn ? formatDay(record.activatedOn) : null}
            layout="inline"
          />
          <Fact
            label="Departed"
            value={record.departedOn ? formatDay(record.departedOn) : null}
            layout="inline"
          />
          <Fact
            label="Expected return"
            value={record.expectedReturnOn ? formatDay(record.expectedReturnOn) : null}
            layout="inline"
          />
          <Fact label="Offence" value={record.season.offencePosition} layout="inline" />
          <Fact label="Defence" value={record.season.defencePosition} layout="inline" />
          <Fact label="Special teams" value={record.season.specialTeamsPosition} layout="inline" />
          <Fact
            label="Jersey — Blue"
            value={record.season.blueNumbers.join(", ") || null}
            layout="inline"
          />
          <Fact
            label="Jersey — White"
            value={record.season.whiteNumbers.join(", ") || null}
            layout="inline"
          />
          <Fact label="Coach group" value={record.season.coachGroup} layout="inline" />
          <Fact
            label="Formalwear"
            value={
              FORMALWEAR_ITEMS.filter((item) => record.season.formalwear[item])
                .map((item) => FORMALWEAR_LABELS[item])
                .join(", ") || null
            }
            layout="inline"
          />
          <Fact label="Half / Full Blue" value={record.season.blues} layout="inline" />
          <Fact
            label="Eligibility"
            value={
              record.season.eligibility
                ? labelFor(ELIGIBILITY_LABELS, record.season.eligibility)
                : null
            }
            layout="inline"
          />
          <Fact
            label="Availability"
            layout="inline"
            value={
              record.season.availability ? (
                <StatusChip
                  domain="availability"
                  status={record.season.availability}
                  label={labelFor(AVAILABILITY_LABELS, record.season.availability)}
                />
              ) : null
            }
          />
        </FactList>
      </Section>

      <Section variant="banded" band="attendance" title="Attendance" testId="attendance">
        <Stack spacing={2} sx={{ py: 1.5 }}>
          <MetricRow columns={3}>
            <Metric
              value={pct === null ? "—" : `${pct}%`}
              label="Attended"
              caption={`${attended.length} of ${scored.length} mandatory sessions with a record`}
            />
            <Metric
              value={String(occurred.length)}
              label="Occurred events"
              caption="Sent an invitation"
            />
            <Metric
              value={String(unrecorded)}
              label="Not recorded"
              caption="Occurred, mandatory, no register"
            />
          </MetricRow>
          <AttendanceTable events={occurred} />
        </Stack>
      </Section>

      <Section variant="banded" band="history" title="Their other seasons" testId="other-seasons">
        {record.otherSeasons.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            No earlier seasons are recorded.
          </Typography>
        ) : (
          <FactList>
            {record.otherSeasons.map((season) => (
              <Fact
                key={season.membershipId}
                label={season.seasonLabel}
                layout="inline"
                value={
                  <StatusChip
                    domain="membership"
                    status={season.status}
                    label={labelFor(MEMBERSHIP_STATUS_LABELS, season.status)}
                  />
                }
                note={season.blueJerseyNumber ? `Blue ${season.blueJerseyNumber}` : undefined}
              />
            ))}
          </FactList>
        )}
      </Section>

      <Section
        variant="banded"
        band="history"
        title="Status history"
        testId="status-history"
        action={
          <Button
            href={`/operate/people/${record.personId}?history=expanded`}
            size="small"
            sx={{ color: "inherit", py: 0, minHeight: 0 }}
          >
            Everything that changed about this person
          </Button>
        }
      >
        {record.statusHistory.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            No recorded transition for this membership.
          </Typography>
        ) : (
          <FactList>
            {record.statusHistory.map((event, index) => {
              const from = event.fromStatus
                ? labelFor(MEMBERSHIP_STATUS_LABELS, event.fromStatus)
                : "Created as";
              const to = labelFor(MEMBERSHIP_STATUS_LABELS, event.toStatus);
              return (
                <Fact
                  key={`${event.toStatus}-${index}`}
                  label={formatWhen(event.occurredAt)}
                  value={event.fromStatus ? `${from} → ${to}` : `${from} ${to.toLowerCase()}`}
                  provenance={[
                    event.actorName ?? event.actorLabel ?? "a named process",
                    event.reason,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  layout="inline"
                />
              );
            })}
          </FactList>
        )}
      </Section>
    </Stack>
  );
}

function AttendanceTable({ events }: { events: readonly AttendanceEvent[] }) {
  const rows = [...events].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No occurred event has asked this player yet this season.
      </Typography>
    );
  }
  return (
    <>
      <DesktopOnly>
        <TableFrame>
          <Table size="small" aria-label="Attendance">
            <TableHead>
              <TableRow>
                <TableCell>Event</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Mandatory</TableCell>
                <TableCell>RSVP</TableCell>
                <TableCell>Attendance</TableCell>
                <TableCell>Event status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((event) => (
                <TableRow key={event.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{event.eventName}</TableCell>
                  <TableCell>{formatShortDate(event.date)}</TableCell>
                  <TableCell>{event.isMandatory ? "Mandatory" : "Not mandatory"}</TableCell>
                  <TableCell>
                    {event.rsvp === null ? (
                      <StatusChip domain="rsvp" status="none" label="Not recorded" />
                    ) : (
                      <StatusChip
                        domain="rsvp"
                        status={event.rsvp}
                        label={RSVP_LABEL[event.rsvp]}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {event.attendance === null ? (
                      <StatusChip domain="attendance" status="not_recorded" label="Not recorded" />
                    ) : (
                      <StatusChip
                        domain="attendance"
                        status={event.attendance}
                        label={ATTENDANCE_LABEL[event.attendance] ?? event.attendance}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusChip
                      domain="event"
                      status={event.eventStatus}
                      label={EVENT_STATUS_LABEL[event.eventStatus] ?? event.eventStatus}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </DesktopOnly>
      <RowCardList>
        {rows.map((event) => (
          <RowCard
            key={event.id}
            title={event.eventName}
            trailing={formatShortDate(event.date)}
            chips={
              <>
                {event.rsvp === null ? (
                  <StatusChip domain="rsvp" status="none" label="RSVP not recorded" />
                ) : (
                  <StatusChip
                    domain="rsvp"
                    status={event.rsvp}
                    label={`RSVP ${RSVP_LABEL[event.rsvp]}`}
                  />
                )}
                {event.attendance === null ? (
                  <StatusChip domain="attendance" status="not_recorded" label="Not recorded" />
                ) : (
                  <StatusChip
                    domain="attendance"
                    status={event.attendance}
                    label={ATTENDANCE_LABEL[event.attendance] ?? event.attendance}
                  />
                )}
              </>
            }
            sublines={[event.isMandatory ? "Mandatory" : "Not mandatory"]}
          />
        ))}
      </RowCardList>
    </>
  );
}

function provenanceNote(item: PlayerRecordData["onboardingItems"][number]): string | undefined {
  if (item.waivedReason)
    return `Waived by ${item.waivedByName ?? "an operator"} — ${item.waivedReason}`;
  if (item.completedOn) return `Completed ${formatDay(item.completedOn)}`;
  return undefined;
}

function currentContact(
  contacts: PersonRecord["contacts"] | undefined,
  kind: "email" | "phone",
  scope: "personal" | "college" | null,
): string | null {
  if (!contacts) return null;
  const matches = contacts.filter(
    (contact) =>
      contact.kind === kind &&
      contact.validUntil === null &&
      (scope === null || contact.scope === scope),
  );
  if (matches.length === 0) return null;
  const preferred = matches.find((contact) => contact.isPreferred);
  return (preferred ?? matches[0]).rawValue;
}

function joinAliases(aliases: PersonRecord["aliases"] | undefined): string | null {
  if (!aliases || aliases.length === 0) return null;
  return aliases.map((alias) => alias.alias).join(", ") || null;
}

function formatEmergencyContact(
  contact: PersonRecord["emergencyContact"] | null | undefined,
): string | null {
  if (!contact) return null;
  const name = contact.familyName
    ? `${contact.givenName} ${contact.familyName}`
    : contact.givenName;
  const detail = [contact.relationship, contact.phone, contact.email].filter(Boolean).join(" · ");
  return detail ? `${name} — ${detail}` : name;
}
