"use client";

import { OutcomeSlotProvider } from "@/components/outcome-slot";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Metric, MetricRow } from "@/components/metric";
import { StatusChip } from "@/components/status-chip";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { PersonRecord } from "@/lib/services/person-record";
import type {
  PersonHistoryEntry,
  PersonRoleAssignment,
  PersonSeasonRecord,
} from "@/lib/services/people-directory";
import {
  ContactSection,
  IdentitySection,
  recordedMobile,
} from "@/app/operate/people/[personId]/identity-contact-sections";
import { RestrictedSection } from "@/app/operate/people/[personId]/academic-restricted-sections";
import StatusSection from "@/app/operate/people/[personId]/status-section";
import SeasonsSection from "@/app/operate/people/[personId]/seasons-section";
import HistorySection from "@/app/operate/people/[personId]/history-section";
import {
  ATTENDANCE_LABEL,
  consentStatusLabel,
  PROSPECT_STATUS_LABELS,
  RSVP_LABEL,
} from "@/lib/services/recruitment-vocabulary";
import type { RecruitmentProspectRecord } from "@/lib/services/recruitment-prospect";
import type { VisibleProspectRecord } from "@/lib/services/recruitment-board-access";
import { StatusPill } from "../../board-filter-controls";
import { FULL_RECRUITING_ACCESS } from "../board-columns";
import { NOT_RECORDED } from "@/components/fact";
import { RecordField, RecordRow } from "@/components/record-field";
import { Section } from "@/components/section";
import { formatDay, formatWhen } from "../../roster/presentation";
import NotesCard from "./notes-card";
import SendQuestionnaireButton from "./send-questionnaire-button";
import ConsentControl from "./consent-control";
import QueuedSendTime from "./queued-send-time";
import StatusCell from "../status-cell";

/** Same words as `../../roster/[membershipId]/attendance-section.tsx`'s own `EVENT_STATUS_LABEL`. */
const EVENT_STATUS_LABEL: Readonly<Record<"upcoming" | "occurred" | "cancelled", string>> =
  Object.freeze({
    upcoming: "Upcoming",
    occurred: "Occurred",
    cancelled: "Cancelled",
  });

/**
 * `/operate/recruitment/[prospectId]` — W2, rebuilt (2026-09-02 correction).
 * Card content follows W2's mapping onto the shipped roster record shell
 * (`../../record-shell.tsx`, LAN-187).
 */
export default function RecruitmentRecordView({
  record,
  person,
  // LAN-307's supplementary person-record context. Optional because the person
  // read can fail open (`person` is then `{}`, and every section below is
  // gated on a field that is therefore absent); the page supplies all five.
  roles = [],
  seasons = [],
  history = [],
  alumniLabel = "Never a member",
  currentSeasonLabel = null,
  mayOpenPerson = true,
  mayAssignRole = false,
}: {
  /** Narrowed on the server (LAN-432): a `none` category's keys are absent. */
  record: VisibleProspectRecord;
  person: Partial<PersonRecord>;
  roles?: readonly PersonRoleAssignment[];
  seasons?: readonly PersonSeasonRecord[];
  history?: readonly PersonHistoryEntry[];
  alumniLabel?: string;
  currentSeasonLabel?: string | null;
  /** LAN-432 — Person at `view` on the roster, which the person record asks. */
  mayOpenPerson?: boolean;
  /** LAN-423 — `role_management`, which Assign a role's target asks. */
  mayAssignRole?: boolean;
}) {
  // LAN-432: each section follows its recruiting category. `none` is a locked
  // head with nothing of it sent; `view` reads; `edit` as before.
  const access = record.access ?? FULL_RECRUITING_ACCESS;
  const personOpen = access.recruit_person !== "none";
  const detailsOpen = access.recruit_details !== "none";
  const detailsEdit = access.recruit_details === "edit";
  const eventsOpen = access.recruit_events !== "none";

  // LAN-204 item 9: the consent deadlock, fixed — personal and recruitment
  // sends no longer share one gate. See `sendRecruitmentQuestionnaireIn`.
  // LAN-371: "WhatsApp granted", "Revoked (by operator, date)" or "Revoked (by
  // the person, date)" — the same sentence on the record and on the board.
  const consentStatus =
    record.consent !== undefined
      ? consentStatusLabel(record.consent, {
          byOperator: record.consentByOperator ?? false,
          changedAt: record.consentChangedAt ?? null,
        })
      : null;

  const blockedByStatus = record.status === "declined";
  const blockedByRefusal = record.consent === "refused" || record.consent === "withdrawn";
  const grantedViaSignupForm =
    record.consent === "granted" && record.consentSource === "qr_self_entry";
  const canSendPersonal = !blockedByStatus && !blockedByRefusal;
  const canSendRecruitment = !blockedByStatus && grantedViaSignupForm;

  const declinedOn = record.statusHistory?.find(
    (event) => event.toStatus === "declined",
  )?.occurredAt;

  // W2-04: the same fact stated three times — banner, send action, dialog.
  const personalDisabledReason = blockedByStatus
    ? "Messaging is refused. This recruit declined."
    : record.consent === "refused"
      ? "Messaging is refused. This recruit has refused consent."
      : record.consent === "withdrawn"
        ? "Messaging is refused. This recruit has withdrawn consent."
        : null;
  const recruitmentDisabledReason = blockedByStatus
    ? "Messaging is refused. This recruit declined."
    : record.consent !== "granted"
      ? "Messaging is refused. Consent has not been granted for this season."
      : !grantedViaSignupForm
        ? "Messaging is refused. Consent was recorded another way, not through the sign-up form — this questionnaire waits for that."
        : null;

  // LAN-307: the destination itself, beside the actions, so an operator can
  // read where the questionnaire is going before pressing send.
  const sendsTo = recordedMobile(person);

  const bannerDetail = blockedByStatus
    ? `Declined${declinedOn ? ` on ${formatWhen(new Date(declinedOn))}` : ""}. Change the status if that is wrong.`
    : record.consent === "refused"
      ? "This recruit has refused messaging consent."
      : record.consent === "withdrawn"
        ? "This recruit has withdrawn messaging consent."
        : null;

  const personal = record.personal;
  const answers = record.answers;
  const events = eventsOpen ? record.events : undefined;
  const statusHistory = record.statusHistory;
  const recruitmentSend = record.recruitment;
  const status = record.status;
  const metrics = [
    status !== undefined ? (
      <Metric
        key="status"
        value={
          <StatusChip domain="recruitment" status={status} label={PROSPECT_STATUS_LABELS[status]} />
        }
        label="Recruit status"
      />
    ) : null,
    consentStatus !== null ? (
      <Metric key="consent" value={consentStatus} label="WhatsApp consent" />
    ) : null,
    personal !== undefined ? (
      <Metric
        key="personal"
        value={personal.lastSentAt ? "Sent" : personal.queuedFor ? "Queued" : "Not sent"}
        label="Personal questionnaire"
      />
    ) : null,
    recruitmentSend !== undefined ? (
      <Metric
        key="recruitment"
        value={
          recruitmentSend.lastSentAt ? "Sent" : recruitmentSend.queuedFor ? "Queued" : "Not sent"
        }
        label="Recruitment questionnaire"
      />
    ) : null,
  ].filter((metric) => metric !== null);

  return (
    <OutcomeSlotProvider>
      <Box
        sx={{ p: { xs: 2, md: 3 }, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 3 }}
        data-testid="recruitment-record"
      >
        {bannerDetail ? (
          <Notice
            severity="warning"
            title={`The club will not message ${record.displayName}.`}
            testId="recruitment-cannot-message-banner"
          >
            {bannerDetail}
          </Notice>
        ) : null}
        <PageHeader
          title={record.displayName}
          eyebrow={`Recruitment · ${record.seasonLabel}`}
          subtitle={
            <span data-testid="recruitment-subtitle">
              {record.status !== undefined
                ? `${record.seasonLabel} recruitment · ${PROSPECT_STATUS_LABELS[record.status]}`
                : `${record.seasonLabel} recruitment`}
            </span>
          }
          back={{ href: "/operate/recruitment", label: "Back to recruitment" }}
          status={
            // LAN-432, Brian round 4: the header's status is text, never a pill.
            record.status !== undefined ? (
              <Typography
                variant="body2"
                color="text.secondary"
                component="span"
                data-testid="recruitment-header-status"
              >
                {`Recruit status · ${PROSPECT_STATUS_LABELS[record.status]}`}
              </Typography>
            ) : undefined
          }
          actions={
            <>
              {/* LAN-307: where a correction is made, in the place the person
                  page puts its own record actions. */}
              {mayOpenPerson && personOpen ? (
                <Button
                  variant="outlined"
                  href={`/operate/people/${record.personId}`}
                  data-testid="open-person-record"
                >
                  Open the person record
                </Button>
              ) : null}
              {record.convertedMembershipId ? (
                <Button variant="outlined" href={`/operate/roster/${record.convertedMembershipId}`}>
                  Joined — view on the roster
                </Button>
              ) : null}
              {/*
                LAN-371. A recruit who wants out and cannot make it happen may
                complain to WhatsApp, which risks the club's sending account,
                and Meta classified a text "press X to stop" as marketing — so
                the mechanism is this control. The reverse is the same control
                when consent is not standing.
              */}
              {detailsEdit ? (
                <ConsentControl
                  prospectId={record.prospectId}
                  displayName={record.displayName}
                  granted={record.consent === "granted"}
                />
              ) : null}
            </>
          }
        />
        {/* V-8: headline strip mirrors the roster record's own strip (own shape, not shared import). */}
        {/* LAN-432: a tile built from a `none` category is absent. */}
        {metrics.length > 0 ? (
          <MetricRow columns={4} testId="recruitment-headline-strip">
            {metrics}
          </MetricRow>
        ) : null}

        {/* Person and Recruitment stacked full width — mirrors the shipped roster bands. */}
        <Stack spacing={3} data-testid="recruitment-record-top-bands">
          {/* LAN-307: the canonical person record's own sections, rendered from
              the same record under the same redaction — not a second, drifting
              four-field summary of it. The send actions stay at the top, with
              the destination beside them. */}
          {personal === undefined ? (
            <Section
              variant="banded"
              band="person"
              title="Personal questionnaire"
              testId="person"
              locked
            />
          ) : (
            <Section variant="banded" band="person" title="Personal questionnaire" testId="person">
              <RecordField label="Sends to" value={sendsTo} readOnly />
              <Box sx={{ py: 1.5 }}>
                {detailsEdit ? (
                  <SendQuestionnaireButton
                    prospectId={record.prospectId}
                    track="personal"
                    displayName={record.displayName}
                    lastSentAt={personal.lastSentAt}
                    canSend={canSendPersonal}
                    disabledReason={personalDisabledReason}
                    blockedByDecline={blockedByStatus}
                  />
                ) : null}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 1 }}
                  data-testid="personal-send-caption"
                >
                  {personal.lastSentAt ? (
                    `Sent — last sent ${formatWhen(new Date(personal.lastSentAt))}`
                  ) : personal.queuedFor ? (
                    <QueuedSendTime scheduledFor={personal.queuedFor} />
                  ) : personal.cancelledReason ? (
                    /* LAN-341: the state is still Not sent, and the club's own
                       recorded reason says why nothing more is coming. */
                    `Not sent — ${personal.cancelledReason}`
                  ) : (
                    "Not sent"
                  )}
                </Typography>
              </Box>
            </Section>
          )}

          {/* LAN-365 correction: "Who they are" (which now also carries the
              academic facts and the two identifiers) renders after "How to
              reach them", the same order the canonical person record uses. */}
          {personOpen ? (
            <>
              {person.contacts !== undefined ? (
                <ContactSection record={person} currentSeasonLabel={currentSeasonLabel} />
              ) : null}
              <IdentitySection record={person} />
              {person.dateOfBirth !== undefined ? <RestrictedSection record={person} /> : null}
              {person.status !== undefined ? (
                <StatusSection
                  record={person}
                  roles={roles}
                  alumniLabel={alumniLabel}
                  mayAssignRole={mayAssignRole}
                />
              ) : null}
            </>
          ) : (
            <>
              <Section variant="banded" band="person" title="How to reach them" locked />
              <Section variant="banded" band="person" title="Who they are" locked />
              <Section variant="banded" band="person" title="Restricted" locked />
              <Section variant="banded" band="person" title="Where they stand" locked />
            </>
          )}

          {status === undefined || answers === undefined || recruitmentSend === undefined ? (
            <Section
              variant="banded"
              band="recruitment"
              title="Recruitment"
              testId="recruitment"
              locked
            />
          ) : (
            <Section variant="banded" band="recruitment" title="Recruitment" testId="recruitment">
              <StatusRow
                editable={detailsEdit}
                status={status}
                prospectId={record.prospectId}
                displayName={record.displayName}
                seasonLabel={record.seasonLabel}
              />
              <RecordField label="Source" value={record.source ?? null} readOnly />
              <RecordField
                label="First contact"
                value={record.firstContactOn ? formatDay(record.firstContactOn) : null}
                readOnly
              />
              <RecordField
                label="Committed on"
                value={record.committedOn ? formatDay(record.committedOn) : null}
                readOnly
              />
              <RecordField label="WhatsApp consent" value={consentStatus} readOnly />
              <RecordField
                label="Played before"
                value={answers.playedBefore ? RSVP_LABEL[answers.playedBefore] : null}
                readOnly
              />
              <RecordField
                label="Watched before"
                value={answers.watchedBefore ? RSVP_LABEL[answers.watchedBefore] : null}
                readOnly
              />
              <RecordField label="Position interest" value={answers.positionInterest} readOnly />
              <RecordField label="Gear owned" value={answers.gearOwned} readOnly />
              <RecordField label="How they heard" value={answers.howTheyHeard} readOnly />
              <RecordField label="Anything else" value={answers.anythingElse} readOnly />
              <Box sx={{ py: 1.5 }}>
                {detailsEdit ? (
                  <SendQuestionnaireButton
                    prospectId={record.prospectId}
                    track="recruitment"
                    displayName={record.displayName}
                    lastSentAt={recruitmentSend.lastSentAt}
                    canSend={canSendRecruitment}
                    disabledReason={recruitmentDisabledReason}
                    blockedByDecline={blockedByStatus}
                  />
                ) : null}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 1 }}
                  data-testid="recruitment-send-caption"
                >
                  {recruitmentSend.lastSentAt ? (
                    `Sent — last sent ${formatWhen(new Date(recruitmentSend.lastSentAt))}`
                  ) : recruitmentSend.queuedFor ? (
                    <QueuedSendTime scheduledFor={recruitmentSend.queuedFor} />
                  ) : recruitmentSend.cancelledReason ? (
                    /* LAN-341: the state is still Not sent, and the club's own
                       recorded reason says why nothing more is coming. */
                    `Not sent — ${recruitmentSend.cancelledReason}`
                  ) : (
                    "Not sent"
                  )}
                </Typography>
              </Box>
            </Section>
          )}
        </Stack>

        {/* LAN-253: recruitment events, notes and status history stacked single column, not two-up. */}
        <Stack spacing={3} data-testid="recruitment-record-lower-bands">
          {events === undefined ? (
            <Section
              variant="banded"
              band="attendance"
              title="Recruitment events"
              testId="events"
              locked
            />
          ) : (
            <Section variant="banded" band="attendance" title="Recruitment events" testId="events">
              {events.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                  {NOT_RECORDED}
                </Typography>
              ) : (
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small" data-testid="recruitment-record-events">
                    <TableHead>
                      <TableRow>
                        <TableCell>Event</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>RSVP</TableCell>
                        <TableCell>Attendance</TableCell>
                        <TableCell>Event status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {events.map((event) => (
                        <TableRow key={event.eventId}>
                          <TableCell>{event.name}</TableCell>
                          <TableCell>{event.date ? formatDay(event.date) : NOT_RECORDED}</TableCell>
                          <TableCell>
                            {event.rsvp ? RSVP_LABEL[event.rsvp] : NOT_RECORDED}
                          </TableCell>
                          <TableCell>
                            {event.attendance ? ATTENDANCE_LABEL[event.attendance] : NOT_RECORDED}
                          </TableCell>
                          <TableCell>{EVENT_STATUS_LABEL[event.eventStatus]}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </Section>
          )}

          {record.notes === undefined ? (
            <Section variant="banded" band="person" title="Notes" testId="notes" locked />
          ) : (
            <Section variant="banded" band="person" title="Notes" testId="notes">
              <Box sx={{ py: 1 }}>
                <NotesCard
                  prospectId={record.prospectId}
                  notes={record.notes}
                  readOnly={!detailsEdit}
                />
              </Box>
            </Section>
          )}

          {personOpen ? (
            <SeasonsSection seasons={seasons} />
          ) : (
            <Section variant="banded" band="season" title="Their seasons" locked />
          )}

          {/* Collapsed here. "Show all" opens the canonical page, which owns the
              filter form and the query string it reads (LAN-307). */}
          {detailsOpen ? (
            <HistorySection
              personId={record.personId}
              history={history}
              historyExpanded={false}
              historyField=""
              historyActor=""
            />
          ) : (
            <Section title="What changed" locked />
          )}

          {statusHistory === undefined ? (
            <Section title="Status history" testId="status-history" locked />
          ) : (
            <Section collapsible title="Status history" testId="status-history">
              {statusHistory.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                  {NOT_RECORDED}
                </Typography>
              ) : (
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small" data-testid="recruitment-record-history">
                    <TableHead>
                      <TableRow>
                        <TableCell>From</TableCell>
                        <TableCell>To</TableCell>
                        <TableCell>When</TableCell>
                        <TableCell>By</TableCell>
                        <TableCell>Reason</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {statusHistory.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell>
                            {event.fromStatus
                              ? PROSPECT_STATUS_LABELS[event.fromStatus]
                              : NOT_RECORDED}
                          </TableCell>
                          <TableCell>{PROSPECT_STATUS_LABELS[event.toStatus]}</TableCell>
                          {/* LAN-248: shared formatter, not toLocaleString() — docs/ux/standards.md rule 3. */}
                          <TableCell>{formatWhen(new Date(event.occurredAt))}</TableCell>
                          <TableCell>{event.actorLabel}</TableCell>
                          <TableCell>{event.reason ?? NOT_RECORDED}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </Section>
          )}
        </Stack>
      </Box>
    </OutcomeSlotProvider>
  );
}

/**
 * The Recruitment card's Status row — same click-to-edit pill as other board cells.
 */
function StatusRow({
  editable,
  status,
  prospectId,
  displayName,
  seasonLabel,
}: {
  /** LAN-432 — Recruit details at `edit`. At `view` the status is the board's own pill. */
  editable: boolean;
  status: RecruitmentProspectRecord["status"];
  prospectId: string;
  displayName: string;
  seasonLabel: string;
}) {
  if (!editable) {
    return (
      <RecordRow label="Status">
        <StatusPill domain="recruitment" status={status} label={PROSPECT_STATUS_LABELS[status]} />
      </RecordRow>
    );
  }
  return (
    <RecordRow label="Status">
      <StatusCell
        prospectId={prospectId}
        status={status}
        displayName={displayName}
        seasonLabel={seasonLabel}
      />
    </RecordRow>
  );
}
