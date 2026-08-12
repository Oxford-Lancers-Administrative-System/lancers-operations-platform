import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { readEvent, type EventDetail } from "@/lib/services/events";
import { gateShellPage } from "../../gate";
import { AbandonDraftForm, SubmitEventButton, WithdrawSubmissionButton } from "../event-actions";
import {
  describeAttendance,
  describeSolicitation,
  formatDetailWhen,
  formatTermAndWeek,
  isPreApproval,
  labelFor,
  NO_DISTRIBUTION_DETAIL,
  NO_DISTRIBUTION_HEADLINE,
  NO_DISTRIBUTION_RULE,
  ORIGIN_LABELS,
  SOLICITS_RESPONSE_MEANING,
  STATUS_LABELS,
  TYPE_LABELS,
} from "../presentation";

/**
 * UX-32 and UX-33 — one event, in the two presentations LAN-76 owns.
 *
 * UX-33 ("Event submitted for approval") is a *state of this route*, reached by
 * `?submitted=1` immediately after the transition, rather than a fifth screen
 * with a route of its own — the screen registry gives both UX-32 and UX-33 the
 * same `/operate/events/[id]`, and its "View pending event" action is the link
 * back to this page without the flag.
 *
 * ## Deviations from the wireframe, and why
 *
 * * **"Submit for approval" is enabled on a draft.** UX-32 notes that it is
 *   "enabled only after an explicit audience is resolved". Audience resolution
 *   is LAN-77 and does not exist yet, while submitting a draft is LAN-76's own
 *   acceptance criterion — and live Linear outranks the SVG (`slice-ux.md`
 *   § 1). The boundary the note protects is untouched: approval still requires
 *   a confirmed audience, and the database refuses one without it (E1a).
 *
 * * **The venue carries no "Confirmed" chip.** The wireframe shows one; the
 *   frozen model has no venue-confirmation concept, and adding a field to say
 *   a venue is confirmed would be a domain-model change no agent makes.
 *   Reported to Brian rather than invented.
 */
export default async function EventDetailPage({
  params,
  searchParams,
}: PageProps<"/operate/events/[id]">) {
  const gate = await gateShellPage("/operate/events");
  if ("screen" in gate) return gate.screen;

  const { id } = await params;
  const query = await searchParams;
  const justSubmitted = query.submitted === "1";

  let event: EventDetail;
  try {
    event = await readEvent(id);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        <Typography variant="h6" component="h1">
          Event
        </Typography>
        <Alert severity="warning" data-testid="event-unavailable">
          {error.message}
        </Alert>
        <Box>
          <Button variant="outlined" href="/operate/events">
            Back to events
          </Button>
        </Box>
      </Stack>
    );
  }

  if (justSubmitted && event.status === "pending_approval") {
    return <SubmittedConfirmation event={event} />;
  }

  return <EventDetailView event={event} />;
}

/** UX-33 — the confirmation immediately after `draft → pending_approval`. */
function SubmittedConfirmation({ event }: { event: EventDetail }) {
  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }} data-testid="event-submitted">
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Event submitted for approval
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {`${event.name} · ${formatDetailWhen(event)}`}
        </Typography>
      </Box>

      <Alert severity="info" data-testid="pending-boundary-note">
        Pending approval still has no invitations, responses or attendance. Withdrawal returns the
        event to draft.
      </Alert>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Button variant="contained" href={`/operate/events/${event.id}`}>
          View pending event
        </Button>
        <Box sx={{ minWidth: { sm: 220 } }}>
          <WithdrawSubmissionButton eventId={event.id} />
        </Box>
      </Stack>
    </Stack>
  );
}

/** One labelled fact. The same two-line shape the wireframe's cards use. */
function Fact({
  label,
  value,
  note,
  testId,
}: {
  label: string;
  value: string;
  note?: string;
  testId?: string;
}) {
  return (
    <Box sx={{ minWidth: 0 }} data-testid={testId}>
      <Typography variant="overline" color="text.secondary" component="p">
        {label}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
      {note ? (
        <Typography variant="body2" color="text.secondary">
          {note}
        </Typography>
      ) : null}
    </Box>
  );
}

/** UX-32 — the event itself, in whatever state it is in. */
function EventDetailView({ event }: { event: EventDetail }) {
  const preApproval = isPreApproval(event.status);

  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }} data-testid="event-detail" data-status={event.status}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {event.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" data-testid="event-subtitle">
          {`${labelFor(STATUS_LABELS, event.status)} · ${formatDetailWhen(event)}`}
        </Typography>
      </Box>

      {preApproval ? (
        <Alert severity="info" data-testid="no-invitations-note">
          {NO_DISTRIBUTION_RULE}
        </Alert>
      ) : null}

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Box
          sx={{
            display: "grid",
            gap: 3,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          <Fact label="Type" value={labelFor(TYPE_LABELS, event.eventType)} />
          <Fact label="Venue" value={event.venue ?? "No venue yet"} />
          <Fact label="Term / week" value={formatTermAndWeek(event.termLabel, event.weekNumber)} />
          <Fact label="Origin" value={labelFor(ORIGIN_LABELS, event.origin)} />
          <Fact label="Owner" value={event.ownerName ?? "Not recorded"} />
          <Fact label="Attendance" value={describeAttendance(event.isMandatory)} />
          <Fact
            label="Response solicited"
            value={describeSolicitation(event.solicitsResponse)}
            note={SOLICITS_RESPONSE_MEANING}
            testId="solicits-fact"
          />
          {event.decisionReason ? (
            <Fact label="Reason" value={event.decisionReason} testId="decision-reason" />
          ) : null}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={3}>
          <Fact
            label="Audience"
            value={
              event.audienceCount === 0 ? "Not yet resolved" : `${event.audienceCount} selected`
            }
            note="Required before approval"
            testId="audience-fact"
          />
          <Divider />
          <Fact
            label="Distribution"
            value={event.invitationCount === 0 ? NO_DISTRIBUTION_HEADLINE : "Invitations issued"}
            note={
              event.invitationCount === 0
                ? NO_DISTRIBUTION_DETAIL
                : `${event.invitationCount} invitations · ${event.responseCount} responses`
            }
            testId="distribution-fact"
          />
        </Stack>
      </Paper>

      <Stack spacing={2} sx={{ maxWidth: 420 }}>
        {event.status === "draft" ? (
          <>
            <SubmitEventButton eventId={event.id} />
            <Button variant="outlined" href={`/operate/events/${event.id}/edit`} fullWidth>
              Edit draft
            </Button>
            <Button variant="outlined" disabled fullWidth>
              Build audience
            </Button>
            <Typography variant="body2" color="text.secondary" data-testid="audience-note">
              Building the audience and approving the event are LAN-77. Approval is refused until an
              audience has been explicitly confirmed.
            </Typography>
            <AbandonDraftForm eventId={event.id} />
          </>
        ) : null}

        {event.status === "pending_approval" ? (
          <>
            <WithdrawSubmissionButton eventId={event.id} />
            <Typography variant="body2" color="text.secondary">
              Withdrawal returns the event to draft. Approval is the designated approver’s decision,
              and is built by LAN-77.
            </Typography>
          </>
        ) : null}

        <Button variant="text" href="/operate/events">
          Back to events
        </Button>
      </Stack>
    </Stack>
  );
}
