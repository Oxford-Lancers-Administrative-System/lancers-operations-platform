"use client";

import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Divider from "@mui/material/Divider";
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
import { formatWhen } from "../../roster/presentation";
import NotesCard from "./notes-card";
import SendQuestionnaireButton from "./send-questionnaire-button";
import StatusCell from "../status-cell";

const NOT_RECORDED = "Not recorded";

/** Same words as `../[membershipId]/attendance-section.tsx`'s own `EVENT_STATUS_LABEL`. */
const EVENT_STATUS_LABEL: Readonly<Record<"upcoming" | "occurred" | "cancelled", string>> =
  Object.freeze({
    upcoming: "Upcoming",
    occurred: "Occurred",
    cancelled: "Cancelled",
  });

function LabelRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: "right" }}>
        {value === null || value === undefined || value === "" ? NOT_RECORDED : value}
      </Typography>
    </Stack>
  );
}

/**
 * `/operate/recruitment/[prospectId]` — `W2`. Every card here is the shipped
 * player record's own card, its content replaced — `../roster/[membershipId]/record-view.tsx`
 * is the shell this clones (LAN-187), and `W2`'s own table names what each
 * becomes: `PERSON` stays Person; `ONBOARDING` becomes Recruitment;
 * `ATTENDANCE` becomes Recruitment events; `THEIR OTHER SEASONS` becomes
 * Notes; `STATUS HISTORY` stays Status history.
 */
export default function RecruitmentRecordView({
  record,
  person,
}: {
  record: RecruitmentProspectRecord;
  person: Partial<PersonRecord>;
}) {
  const canSend = record.consent === "granted" && record.status !== "declined";

  // `W2-04` (Brian, 2026-08-31): the same fact stated three times, in
  // descending order of how hard it is to miss — a banner at the top of the
  // record, the send action itself, and the dialog reached by pressing it
  // (`send-questionnaire-button.tsx`). Correction round 1 (F-LAN204-005)
  // found only the third of the three had ever been built.
  const declinedOn = record.statusHistory.find(
    (event) => event.toStatus === "declined",
  )?.occurredAt;
  const disabledReason =
    record.status === "declined"
      ? "Messaging is refused. This recruit declined."
      : !canSend
        ? "Messaging is refused. Consent has not been granted for this season."
        : null;
  // `W2-04`'s own copy, verbatim in shape: one short fact as the alert's
  // title, then a second, separate line naming why and what would change
  // it — never folded into a single narrative sentence.
  const bannerDetail =
    record.status === "declined"
      ? `Declined${declinedOn ? ` on ${formatWhen(new Date(declinedOn))}` : ""}. Change the status if that is wrong.`
      : !canSend
        ? "Messaging consent has not been granted for this season."
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
        <Box sx={{ minWidth: 200 }}>
          <StatusCell
            prospectId={record.prospectId}
            status={record.status}
            displayName={record.displayName}
            seasonLabel={record.seasonLabel}
          />
        </Box>
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ borderTop: "4px solid #455a64" }}>
            <CardHeader title="Person" />
            <CardContent>
              <LabelRow label="College" value={person.college ?? null} />
              <LabelRow label="Matriculation" value={person.matriculationYear ?? null} />
              <LabelRow label="Expected graduation" value={person.expectedGraduationYear ?? null} />
              <LabelRow label="Degree field" value={person.degreeField ?? null} />
              <Divider sx={{ my: 1.5 }} />
              <Stack spacing={0.5}>
                <SendQuestionnaireButton
                  prospectId={record.prospectId}
                  track="personal"
                  displayName={record.displayName}
                  lastSentAt={record.personal.lastSentAt}
                  canSend={canSend}
                  disabledReason={disabledReason}
                />
                <Typography variant="caption" color="text.secondary">
                  {record.personal.lastSentAt
                    ? `Last sent ${formatWhen(new Date(record.personal.lastSentAt))}`
                    : "Not sent"}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ borderTop: "4px solid #00695c" }}>
            <CardHeader title="Recruitment" />
            <CardContent>
              <LabelRow label="Status" value={PROSPECT_STATUS_LABELS[record.status]} />
              <LabelRow label="Source" value={record.source} />
              <LabelRow label="First contact" value={record.firstContactOn} />
              <LabelRow label="Committed on" value={record.committedOn} />
              <LabelRow label="WhatsApp consent" value={CONSENT_LABELS[record.consent]} />
              <Divider sx={{ my: 1 }} />
              <LabelRow label="Played before" value={record.answers.playedBefore ?? null} />
              <LabelRow label="Watched before" value={record.answers.watchedBefore ?? null} />
              <LabelRow label="Position interest" value={record.answers.positionInterest} />
              <LabelRow label="Gear owned" value={record.answers.gearOwned} />
              <LabelRow label="How they heard" value={record.answers.howTheyHeard} />
              <LabelRow label="Anything else" value={record.answers.anythingElse} />
              <Divider sx={{ my: 1.5 }} />
              <Stack spacing={0.5}>
                <SendQuestionnaireButton
                  prospectId={record.prospectId}
                  track="recruitment"
                  displayName={record.displayName}
                  lastSentAt={record.recruitment.lastSentAt}
                  canSend={canSend}
                  disabledReason={disabledReason}
                />
                <Typography variant="caption" color="text.secondary">
                  {record.recruitment.lastSentAt
                    ? `Last sent ${formatWhen(new Date(record.recruitment.lastSentAt))}`
                    : "Not sent"}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ borderTop: "4px solid #0b3d91" }}>
            <CardHeader title="Recruitment events" />
            <CardContent sx={{ overflowX: "auto" }}>
              {record.events.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Not recorded
                </Typography>
              ) : (
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
                        <TableCell>{event.date ?? NOT_RECORDED}</TableCell>
                        <TableCell>{event.rsvp ? RSVP_LABEL[event.rsvp] : NOT_RECORDED}</TableCell>
                        <TableCell>
                          {event.attendance ? ATTENDANCE_LABEL[event.attendance] : NOT_RECORDED}
                        </TableCell>
                        <TableCell>{EVENT_STATUS_LABEL[event.eventStatus]}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ borderTop: "4px solid #455a64" }}>
            <CardHeader title="Notes" />
            <CardContent>
              <NotesCard prospectId={record.prospectId} notes={record.notes} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Card variant="outlined" sx={{ borderTop: "4px solid #455a64" }}>
            <CardHeader title="Status history" />
            <CardContent sx={{ overflowX: "auto" }}>
              {record.statusHistory.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Not recorded
                </Typography>
              ) : (
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
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Button variant="outlined" href="/operate/recruitment" sx={{ mt: 3, minHeight: 44 }}>
        BACK TO RECRUITMENT
      </Button>
    </Box>
  );
}
