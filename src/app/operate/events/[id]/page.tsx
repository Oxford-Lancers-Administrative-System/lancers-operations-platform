import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { operatorHasCapability } from "@/lib/auth/guards";
import { readEvent, type EventDetail } from "@/lib/services/events";
import { readApprovalPreview } from "@/lib/services/event-approval";
import type { AudienceCandidate, AudienceCapacity } from "@/lib/services/audience-selection";
import { gateShellPage } from "../../gate";
import { AbandonDraftForm } from "../event-actions";
import { ApprovalWorkflow } from "./approval-workflow";
import {
  APPROVED_HEADLINE,
  APPROVED_NOTHING_SENT_YET,
  AUDIENCE_COMES_LATER,
  AUDIENCE_FROZEN_AT_APPROVAL,
  describeAttendance,
  describeSolicitation,
  formatDeadline,
  formatDetailWhen,
  formatTermAndWeek,
  isPreApproval,
  labelFor,
  NO_DISTRIBUTION_DETAIL,
  NO_DISTRIBUTION_HEADLINE,
  NO_DISTRIBUTION_RULE,
  NOTHING_DELIVERED_YET,
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
 *
 * ## After Brian's LAN-76 clarification
 *
 * The actions are gated on `event_calendar_management` — the President,
 * Vice-President, Secretary and General Manager. Any other linked operator can
 * open this page and read the event, and is offered nothing to press; the
 * actions guard themselves server-side regardless, so the hiding is a courtesy
 * rather than the boundary.
 *
 * ## What this screen deliberately does not show
 *
 * Neither who entered the event nor where its schedule comes from. Brian read
 * both on the real screen and they answered questions nobody was asking: the
 * calendar is the club's, every operator on it is equally entitled to change a
 * draft, and an event a club operator typed in is one the club schedules by
 * definition.
 *
 * **Both are still recorded.** `events.owner_person_id` is written on create
 * and `events.origin` on every row, and every transition names its actor in
 * `audit_events` — which is where "preserve creator information for
 * accountability and audit" actually lives. What went is the display, not the
 * record.
 */
export default async function EventDetailPage({
  params,
  searchParams,
}: PageProps<"/operate/events/[id]">) {
  const gate = await gateShellPage("/operate/events");
  if ("screen" in gate) return gate.screen;

  const { id } = await params;
  const query = await searchParams;
  const justApproved = query.approved === "1";

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

  const mayManage = operatorHasCapability(gate.operator, "event_calendar_management");
  const mayApprove = operatorHasCapability(gate.operator, "event_approval");

  /**
   * The catalogue is read only for the one operator, on the one event, who can
   * actually act on it. Every other reader — an operator without the capability,
   * an approved or withdrawn event — gets the detail and no audience data at
   * all, so the roster and the club's contact details are not in a payload
   * nobody on that path is entitled to.
   */
  const approval =
    mayApprove && event.status === "draft" ? await readApprovalPreview(event.id) : null;

  return (
    <EventDetailView
      event={event}
      mayManage={mayManage}
      justApproved={justApproved}
      approval={
        approval
          ? {
              candidates: approval.catalogue.candidates,
              counts: approval.catalogue.counts,
              deadline: approval.deadline
                ? {
                    label: formatDeadline(approval.deadline.at),
                    clamped: approval.deadline.clamped,
                  }
                : null,
            }
          : null
      }
    />
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

interface ApprovalProps {
  candidates: AudienceCandidate[];
  counts: Record<AudienceCapacity, number>;
  deadline: { label: string; clamped: boolean } | null;
}

/** UX-32 — the event itself, in whatever state it is in. */
function EventDetailView({
  event,
  mayManage,
  justApproved,
  approval,
}: {
  event: EventDetail;
  mayManage: boolean;
  justApproved: boolean;
  approval: ApprovalProps | null;
}) {
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

      {justApproved && event.status === "approved" ? (
        // UX-43. A state of this route rather than a fifth screen, the same
        // device LAN-76 used for UX-33 — the registry gives it this route.
        <Alert severity="success" data-testid="event-approved-note">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {`${APPROVED_HEADLINE} — ${event.invitationCount} ${
              event.invitationCount === 1 ? "invitation" : "invitations"
            } created`}
          </Typography>
          <Typography variant="body2">{APPROVED_NOTHING_SENT_YET}</Typography>
        </Alert>
      ) : null}

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
              event.audienceCount === 0 ? "Chosen at approval" : `${event.audienceCount} confirmed`
            }
            note={event.audienceCount === 0 ? AUDIENCE_COMES_LATER : AUDIENCE_FROZEN_AT_APPROVAL}
            testId="audience-fact"
          />
          <Divider />
          <Fact
            label="Distribution"
            value={event.invitationCount === 0 ? NO_DISTRIBUTION_HEADLINE : "Invitations created"}
            note={
              event.invitationCount === 0
                ? NO_DISTRIBUTION_DETAIL
                : // Until LAN-78 dispatches the jobs, "created" is the whole
                  // truth and the screen has to say so rather than implying
                  // anybody has been contacted.
                  `${event.invitationCount} invitations · ${event.responseCount} responses · ${NOTHING_DELIVERED_YET}`
            }
            testId="distribution-fact"
          />
        </Stack>
      </Paper>

      {approval && event.status === "draft" ? (
        <ApprovalWorkflow
          eventId={event.id}
          eventName={event.name}
          eventWhen={formatDetailWhen(event)}
          eventFacts={`${labelFor(TYPE_LABELS, event.eventType)} · ${event.venue ?? "No venue yet"}`}
          eventExpectation={`${describeAttendance(event.isMandatory)} · ${describeSolicitation(
            event.solicitsResponse,
          ).toLowerCase()}`}
          candidates={approval.candidates}
          counts={approval.counts}
          deadline={approval.deadline}
        />
      ) : null}

      <Stack spacing={2} sx={{ maxWidth: 420 }}>
        {mayManage && event.status === "draft" ? (
          <>
            <Button variant="contained" href={`/operate/events/${event.id}/edit`} fullWidth>
              Edit draft
            </Button>
            <AbandonDraftForm eventId={event.id} />
          </>
        ) : null}

        {event.status === "pending_approval" ? (
          <Typography variant="body2" color="text.secondary" data-testid="approval-note">
            This event is awaiting approval. Approval is not built yet — when it is, the approver
            confirms who the event goes to and it is sent from there.
          </Typography>
        ) : null}

        {mayManage ? null : (
          <Typography variant="body2" color="text.secondary" data-testid="read-only-note">
            You can see the club calendar. Creating and changing events is done by the President,
            Vice-President, Secretary and General Manager.
          </Typography>
        )}

        <Button variant="text" href="/operate/events">
          Back to events
        </Button>
      </Stack>
    </Stack>
  );
}
