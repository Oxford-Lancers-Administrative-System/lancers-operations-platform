"use client";

import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { PersonRecord } from "@/lib/services/person-record";
import {
  ATTENDANCE_LABEL,
  CONSENT_LABELS,
  PROSPECT_STATUS_LABELS,
  RSVP_LABEL,
} from "@/lib/services/recruitment-vocabulary";
import type { RecruitmentProspectRecord } from "@/lib/services/recruitment-prospect";
import { StatusPill } from "../../board-filter-controls";
import { NOT_RECORDED, RecordField, Section } from "../../record-shell";
import { formatDay, formatWhen } from "../../roster/presentation";
import { BAND_COLOURS, EVENTS_BAND_COLOUR } from "../board-columns";
import { STATUS_COLOUR_FOR_PILL } from "../status-colour";
import NotesCard from "./notes-card";
import SendQuestionnaireButton from "./send-questionnaire-button";
import StatusCell from "../status-cell";

/** Same words as `../../roster/[membershipId]/attendance-section.tsx`'s own `EVENT_STATUS_LABEL`. */
const EVENT_STATUS_LABEL: Readonly<Record<"upcoming" | "occurred" | "cancelled", string>> =
  Object.freeze({
    upcoming: "Upcoming",
    occurred: "Occurred",
    cancelled: "Cancelled",
  });

/**
 * `/operate/recruitment/[prospectId]` — `W2`, rebuilt (2026-09-02
 * correction). Every card here is the shipped player record's own banded
 * card (`../../record-shell.tsx`, extracted from `../../roster/[membershipId]/record-view.tsx`,
 * LAN-187), its content replaced per `W2`'s own table: `Person` stays
 * Person; `Onboarding` becomes Recruitment; `Attendance` becomes
 * Recruitment events; `Their other seasons` becomes Notes; `Status history`
 * stays Status history. Brian, 2026-09-02: "How we did it for the roster
 * should be the same language, the same UI elements, and the same thing
 * should be identical here."
 */
export default function RecruitmentRecordView({
  record,
  person,
}: {
  record: RecruitmentProspectRecord;
  person: Partial<PersonRecord>;
}) {
  // LAN-204, item 9 — the consent deadlock, fixed (Brian, 2026-09-02: "The
  // personal questionnaire is how we get consent… the fucking app is
  // deadlocked now"). The two SEND actions no longer share one gate:
  //
  //   - the personal track carries the sign-up-form link, so it is the one
  //     message allowed to establish consent rather than require it already
  //     exist — refused only by an explicit `refused`/`withdrawn` or by
  //     `declined` status, never by `never_asked`/`asked`.
  //   - the recruitment (Questionnaire B) track keeps the strict
  //     granted-only gate every other send in this codebase uses — and,
  //     per `Q-read-back-authorises-how-much` (Brian, 2026-09-02), that
  //     grant has to be the recruit's own, through the sign-up form
  //     (`consentSource: "qr_self_entry"`): a touchline read-back's grant
  //     authorises the welcome track alone.
  //
  // `sendRecruitmentQuestionnaireIn` (the service layer) enforces both of
  // these independently; this is the same story told in the UI, so the
  // button a recruit's consent state actually reaches matches what pressing
  // it will do.
  const blockedByStatus = record.status === "declined";
  const blockedByRefusal = record.consent === "refused" || record.consent === "withdrawn";
  const grantedViaSignupForm =
    record.consent === "granted" && record.consentSource === "qr_self_entry";
  const canSendPersonal = !blockedByStatus && !blockedByRefusal;
  const canSendRecruitment = !blockedByStatus && grantedViaSignupForm;

  const declinedOn = record.statusHistory.find(
    (event) => event.toStatus === "declined",
  )?.occurredAt;

  // `W2-04` (Brian, 2026-08-31): the same fact stated three times, in
  // descending order of how hard it is to miss — a banner at the top of the
  // record, the send action itself, and the dialog reached by pressing it.
  // The banner now fires only when *neither* track can reach this recruit —
  // `declined`, or an explicit `refused`/`withdrawn` — never for
  // `never_asked`/`asked`, which the personal track is built to answer.
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

  const bannerDetail = blockedByStatus
    ? `Declined${declinedOn ? ` on ${formatWhen(new Date(declinedOn))}` : ""}. Change the status if that is wrong.`
    : record.consent === "refused"
      ? "This recruit has refused messaging consent."
      : record.consent === "withdrawn"
        ? "This recruit has withdrawn messaging consent."
        : null;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }} data-testid="recruitment-record">
      {bannerDetail ? (
        <Alert severity="warning" sx={{ mb: 3 }} data-testid="recruitment-cannot-message-banner">
          <AlertTitle>The club will not message {record.displayName}.</AlertTitle>
          {bannerDetail}
        </Alert>
      ) : null}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" }, mb: 3 }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary">
            Recruitment · {record.seasonLabel}
          </Typography>
          <Typography variant="h5" component="h1">
            {record.displayName}
          </Typography>
          {record.convertedMembershipId ? (
            <Typography variant="body2" color="text.secondary">
              Joined —{" "}
              <a href={`/operate/roster/${record.convertedMembershipId}`}>view on the roster</a>
            </Typography>
          ) : null}
        </Box>
        {/* A glance-only pill, same as the roster record's own headline —
            the interactive control lives in the Recruitment card below. */}
        <StatusPill
          color={STATUS_COLOUR_FOR_PILL[record.status]}
          label={PROSPECT_STATUS_LABELS[record.status]}
        />
      </Stack>

      {/* Person and Recruitment stack full width, one above the other — the
          same plain vertical flow the shipped player record uses for its own
          bands (`../../roster/[membershipId]/record-view.tsx`), not a Grid
          item pair sized to share a row. Brian, 2026-09-02: "The bands are
          side by side when really they should be layered on top of each
          other." */}
      <Stack spacing={2} sx={{ mb: 2 }} data-testid="recruitment-record-top-bands">
        {/* ------------------------------------------------------------ Person -- */}
        <Section colours={BAND_COLOURS.person} title="Person" testId="person">
          <RecordField label="College" value={person.college ?? null} readOnly />
          <RecordField
            label="Matriculation"
            value={person.matriculationYear != null ? String(person.matriculationYear) : null}
            readOnly
          />
          <RecordField
            label="Expected graduation"
            value={
              person.expectedGraduationYear != null ? String(person.expectedGraduationYear) : null
            }
            readOnly
          />
          <RecordField label="Degree field" value={person.degreeField ?? null} readOnly />
          <Box sx={{ pt: 1.5 }}>
            <SendQuestionnaireButton
              prospectId={record.prospectId}
              track="personal"
              displayName={record.displayName}
              lastSentAt={record.personal.lastSentAt}
              canSend={canSendPersonal}
              disabledReason={personalDisabledReason}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {record.personal.lastSentAt
                ? `Last sent ${formatWhen(new Date(record.personal.lastSentAt))}`
                : "Not sent"}
            </Typography>
          </Box>
        </Section>

        {/* ------------------------------------------------------- Recruitment -- */}
        <Section colours={BAND_COLOURS.recruitment} title="Recruitment" testId="recruitment">
          <StatusRow
            status={record.status}
            prospectId={record.prospectId}
            displayName={record.displayName}
            seasonLabel={record.seasonLabel}
          />
          <RecordField label="Source" value={record.source} readOnly />
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
          <RecordField label="WhatsApp consent" value={CONSENT_LABELS[record.consent]} readOnly />
          <RecordField
            label="Played before"
            value={record.answers.playedBefore ? RSVP_LABEL[record.answers.playedBefore] : null}
            readOnly
          />
          <RecordField
            label="Watched before"
            value={record.answers.watchedBefore ? RSVP_LABEL[record.answers.watchedBefore] : null}
            readOnly
          />
          <RecordField label="Position interest" value={record.answers.positionInterest} readOnly />
          <RecordField label="Gear owned" value={record.answers.gearOwned} readOnly />
          <RecordField label="How they heard" value={record.answers.howTheyHeard} readOnly />
          <RecordField label="Anything else" value={record.answers.anythingElse} readOnly />
          <Box sx={{ pt: 1.5 }}>
            <SendQuestionnaireButton
              prospectId={record.prospectId}
              track="recruitment"
              displayName={record.displayName}
              lastSentAt={record.recruitment.lastSentAt}
              canSend={canSendRecruitment}
              disabledReason={recruitmentDisabledReason}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {record.recruitment.lastSentAt
                ? `Last sent ${formatWhen(new Date(record.recruitment.lastSentAt))}`
                : "Not sent"}
            </Typography>
          </Box>
        </Section>
      </Stack>

      <Grid container spacing={2}>
        {/* ------------------------------------------------- Recruitment events -- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Section colours={EVENTS_BAND_COLOUR} title="Recruitment events" testId="events">
            {record.events.length === 0 ? (
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
                    {record.events.map((event) => (
                      <TableRow key={event.eventId}>
                        <TableCell>{event.name}</TableCell>
                        <TableCell>{event.date ? formatDay(event.date) : NOT_RECORDED}</TableCell>
                        <TableCell>{event.rsvp ? RSVP_LABEL[event.rsvp] : NOT_RECORDED}</TableCell>
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
        </Grid>

        {/* ------------------------------------------------------------- Notes -- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Section colours={BAND_COLOURS.person} title="Notes" testId="notes">
            <Box sx={{ py: 1 }}>
              <NotesCard prospectId={record.prospectId} notes={record.notes} />
            </Box>
          </Section>
        </Grid>

        {/* ---------------------------------------------------- Status history -- */}
        <Grid size={{ xs: 12 }}>
          <Section colours={BAND_COLOURS.person} title="Status history" testId="status-history">
            {record.statusHistory.length === 0 ? (
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
                    {record.statusHistory.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          {event.fromStatus
                            ? PROSPECT_STATUS_LABELS[event.fromStatus]
                            : NOT_RECORDED}
                        </TableCell>
                        <TableCell>{PROSPECT_STATUS_LABELS[event.toStatus]}</TableCell>
                        <TableCell>{new Date(event.occurredAt).toLocaleString()}</TableCell>
                        <TableCell>{event.actorLabel}</TableCell>
                        <TableCell>{event.reason ?? NOT_RECORDED}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Section>
        </Grid>
      </Grid>

      <Button variant="outlined" href="/operate/recruitment" sx={{ mt: 3, minHeight: 44 }}>
        BACK TO RECRUITMENT
      </Button>
    </Box>
  );
}

/**
 * The Recruitment card's own Status row — the interactive control (the same
 * click-to-edit pill every board cell and this record share), inside the
 * banded card rather than a bespoke header box.
 */
function StatusRow({
  status,
  prospectId,
  displayName,
  seasonLabel,
}: {
  status: RecruitmentProspectRecord["status"];
  prospectId: string;
  displayName: string;
  seasonLabel: string;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.25, sm: 2 }}
      sx={{ py: 1, borderTop: "none", alignItems: { sm: "baseline" } }}
      data-testid="record-row"
      data-label="Status"
    >
      <Box sx={{ minWidth: { sm: 200 }, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary">
          Status
        </Typography>
      </Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <StatusCell
          prospectId={prospectId}
          status={status}
          displayName={displayName}
          seasonLabel={seasonLabel}
        />
      </Box>
    </Stack>
  );
}
