import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { operatorHasCapability } from "@/lib/auth/guards";
import { readEvent, type EventDetail } from "@/lib/services/events";
import {
  readApprovalPreview,
  readEventAudience,
  type AudienceMember,
} from "@/lib/services/event-approval";
import { gateShellPage } from "../../gate";
import {
  AbandonDraftForm,
  ApproveEventForm,
  CorrectOccurrenceForm,
  OccurrenceDecisionForm,
} from "../event-actions";
import { AudienceBuilder } from "./audience-builder";
import {
  APPROVAL_DETAIL,
  APPROVAL_HEADLINE_PREFIX,
  APPROVED_HEADLINE,
  APPROVED_NOTHING_SENT_YET,
  AUDIENCE_COMES_LATER,
  AUDIENCE_FROZEN_AT_APPROVAL,
  CAPACITY_LABELS,
  DEADLINE_DUE_IMMEDIATELY,
  DEADLINE_DUE_IMMEDIATELY_DETAIL,
  DEADLINE_NONE,
  DEADLINE_NONE_DETAIL,
  describeAttendance,
  describeSolicitation,
  DISTRIBUTION_AUTOMATED,
  DISTRIBUTION_BEGINS_AFTER_APPROVAL,
  EMPTY_AUDIENCE_DETAIL,
  EMPTY_AUDIENCE_HEADLINE,
  EMPTY_AUDIENCE_SERVER_NOTE,
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
import {
  ATTENDANCE_OPENS_AFTER,
  ATTENDANCE_UNAVAILABLE,
  NOT_HELD_DETAIL,
  NOT_HELD_HEADLINE,
  OCCURRENCE_DETAIL,
  OCCURRENCE_HEADLINE,
  OCCURRENCE_NEVER_INFERRED,
  OCCURRENCE_NOT_ASSERTED,
} from "./attendance/presentation";

/**
 * One event, in every presentation this route owns — UX-32, UX-33, and LAN-77's
 * UX-40, UX-41, UX-42 and UX-43.
 *
 * ## Why they are all one route
 *
 * The screen registry gives every one of them `/operate/events/[id]`, and that
 * is not an oversight in the contract: they are states of one record. `?step=`
 * selects between the audience builder and the confirmation; `?approved=1`
 * reports the transition that just happened. The same device LAN-76 used for
 * UX-33.
 *
 * ## Every step renders from stored rows
 *
 * The audience is saved against the draft before the confirmation is shown, so
 * the confirmation reads it back out of the database rather than receiving it
 * from the browser. That is what makes it survive **Edit draft**, a refresh, a
 * closed tab and a second operator — and it is why the only client component
 * here is the tick list itself.
 *
 * ## After Brian's LAN-76 clarification
 *
 * Draft actions are gated on `event_calendar_management` and approval on
 * `event_approval`. Any other linked operator can open this page and read the
 * event, and is offered nothing to press; the actions guard themselves
 * server-side regardless, so the hiding is a courtesy rather than the boundary.
 *
 * ## What this screen deliberately does not show
 *
 * Neither who entered the event nor where its schedule comes from. Brian read
 * both on the real screen and they answered questions nobody was asking. Both
 * are still recorded — `events.owner_person_id`, `events.origin`, and every
 * transition's actor in `audit_events`. What went is the display, not the record.
 */
export default async function EventDetailPage({
  params,
  searchParams,
}: PageProps<"/operate/events/[id]">) {
  const gate = await gateShellPage("/operate/events");
  if ("screen" in gate) return gate.screen;

  const { id } = await params;
  const query = await searchParams;
  const step = typeof query.step === "string" ? query.step : "";
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
  const mayAdministerDelivery = operatorHasCapability(gate.operator, "delivery_administration");
  const mayAssertOccurrence = operatorHasCapability(gate.operator, "event_occurrence_assertion");
  const canWorkOnAudience = mayApprove && event.status === "draft";

  // UX-40 and UX-41 are read-heavy and only reachable by an approver working on
  // a draft. Everybody else — and every other status — gets the detail without
  // the roster and its contact details in the payload at all.
  if (canWorkOnAudience && (step === "audience" || step === "review")) {
    const preview = await readApprovalPreview(event.id);

    if (step === "audience") {
      return (
        <ApprovalLayout event={event}>
          <AudienceBuilder
            eventId={event.id}
            candidates={preview.catalogue.candidates}
            counts={preview.catalogue.counts}
            initialKeys={preview.audience.map((member) => `${member.capacity}:${member.anchorId}`)}
          />
        </ApprovalLayout>
      );
    }

    return (
      <ApprovalLayout event={event}>
        {preview.audience.length === 0 ? (
          <EmptyAudienceRefusal eventId={event.id} />
        ) : (
          <ApprovalReview
            event={event}
            audience={preview.audience}
            deadline={
              preview.deadline
                ? {
                    label: formatDeadline(preview.deadline.at),
                    clamped: preview.deadline.clamped,
                  }
                : null
            }
          />
        )}
      </ApprovalLayout>
    );
  }

  // The audience is shown on the detail from the moment one is proposed, so a
  // draft carrying forty people says so rather than looking untouched — and an
  // approved event answers "who was actually invited?" without a second screen.
  const audience = event.audienceCount > 0 ? await readEventAudience(event.id) : [];

  return (
    <EventDetailView
      event={event}
      mayManage={mayManage}
      mayApprove={mayApprove}
      mayAdministerDelivery={mayAdministerDelivery}
      mayAssertOccurrence={mayAssertOccurrence}
      justApproved={justApproved}
      audience={audience}
    />
  );
}

/** The heading every approval step sits under, so the event never leaves view. */
function ApprovalLayout({ event, children }: { event: EventDetail; children: React.ReactNode }) {
  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }} data-testid="approval-step">
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {event.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {`${labelFor(STATUS_LABELS, event.status)} · ${formatDetailWhen(event)}`}
        </Typography>
      </Box>
      {children}
      <Box>
        <Button variant="text" href={`/operate/events/${event.id}`}>
          Back to event
        </Button>
      </Box>
    </Stack>
  );
}

/** UX-42 — refused before anything is written, and said as a screen. */
function EmptyAudienceRefusal({ eventId }: { eventId: string }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="empty-audience-refusal">
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          {EMPTY_AUDIENCE_HEADLINE}
        </Typography>
        <Alert severity="warning">{EMPTY_AUDIENCE_DETAIL}</Alert>
        <Typography variant="body2" color="text.secondary">
          {EMPTY_AUDIENCE_SERVER_NOTE}
        </Typography>
        <Box>
          <Button
            variant="contained"
            href={`/operate/events/${eventId}?step=audience`}
            sx={{ minHeight: 44 }}
          >
            Build audience
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}

/** UX-41 — the exact list, and what approving it will do. */
function ApprovalReview({
  event,
  audience,
  deadline,
}: {
  event: EventDetail;
  audience: AudienceMember[];
  deadline: { label: string; clamped: boolean } | null;
}) {
  const stale = audience.filter((member) => !member.stillSelectable).length;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="approval-review">
      <Stack spacing={3}>
        <Typography variant="h6" component="h2">
          {`${APPROVAL_HEADLINE_PREFIX} ${event.name}`}
        </Typography>

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(2, minmax(0, 160px))" },
          }}
        >
          <Metric
            value={String(audience.length)}
            label="Confirmed audience"
            testId="audience-total"
          />
          <Metric value={String(stale)} label="No longer active" testId="audience-defects" />
        </Box>

        {stale > 0 ? (
          // Approval honours the confirmed list as-is, so this is information
          // rather than an obstacle — but an approver should not discover it
          // afterwards in the Monday report.
          <Alert severity="info" data-testid="stale-audience-note">
            {stale === 1
              ? "One person in this audience is no longer active. They will still be invited."
              : `${stale} people in this audience are no longer active. They will still be invited.`}
          </Alert>
        ) : null}

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          <Fact
            label="Event"
            value={`${labelFor(TYPE_LABELS, event.eventType)} · ${event.venue ?? "No venue yet"}`}
            note={`${describeAttendance(event.isMandatory)} · ${describeSolicitation(
              event.solicitsResponse,
            ).toLowerCase()}`}
          />
          <Fact
            label="Audience"
            value={`${audience.length} named ${audience.length === 1 ? "invitee" : "invitees"}`}
            note="Explicitly resolved"
          />
          <Fact
            label="RSVP deadline"
            value={
              deadline
                ? deadline.clamped
                  ? DEADLINE_DUE_IMMEDIATELY
                  : deadline.label
                : DEADLINE_NONE
            }
            note={
              deadline
                ? deadline.clamped
                  ? DEADLINE_DUE_IMMEDIATELY_DETAIL
                  : "Set from the club's rule for this kind of event"
                : DEADLINE_NONE_DETAIL
            }
            testId="deadline-fact"
          />
          <Fact
            label="Distribution"
            value={DISTRIBUTION_AUTOMATED}
            note={DISTRIBUTION_BEGINS_AFTER_APPROVAL}
          />
        </Box>

        <AudienceList audience={audience} heading="Who will be asked" testId="resolved-audience" />

        <Typography variant="body2" color="text.secondary">
          {APPROVAL_DETAIL}
        </Typography>

        <ApproveEventForm eventId={event.id} />
      </Stack>
    </Paper>
  );
}

/** The named list, used by the confirmation and by the event detail alike. */
function AudienceList({
  audience,
  heading,
  testId,
}: {
  audience: AudienceMember[];
  heading: string;
  testId: string;
}) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" component="p">
        {heading}
      </Typography>
      <Stack component="ul" spacing={0} sx={{ listStyle: "none", p: 0, m: 0 }} data-testid={testId}>
        {audience.map((member) => (
          <Box
            component="li"
            key={member.id}
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1,
              alignItems: "center",
              justifyContent: "space-between",
              py: 1,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {member.displayName}
            </Typography>
            <Stack direction="row" spacing={1}>
              {member.stillSelectable ? null : (
                <Chip size="small" color="warning" label="No longer active" />
              )}
              <Chip size="small" label={labelFor(CAPACITY_LABELS, member.capacity)} />
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function Metric({ value, label, testId }: { value: string; label: string; testId?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid={testId}>
      <Typography variant="h5" component="p" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Paper>
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

/**
 * UX-70 — **Confirm what happened**. LAN-80.
 *
 * ## Why it is offered whatever the clock says
 *
 * The wireframe shows "Start time has passed" as one of three facts beside the
 * two buttons, and this renders it as exactly that: a fact, not a condition.
 * Invariant E5 says "the passage of time never equals occurrence", and the rule
 * cuts both ways — time does not make an event occurred, and it does not
 * license the interface to decide when somebody may say what happened. The two
 * real cases settle it: a practice abandoned at 19:55 because the pitch flooded
 * is **not held** before its own start time, and last Wednesday's practice is
 * still waiting to be recorded on Friday. Refusing either would be a rule this
 * repository invented.
 *
 * ## Why an operator without the capability still sees it
 *
 * They see the three facts and no buttons, because the point of the panel is
 * that this event is waiting on a decision — which is true regardless of who is
 * looking. The action guards itself server-side; hiding the buttons is the
 * courtesy that stops somebody pressing one to find out.
 */
function OccurrencePanel({
  event,
  mayAssertOccurrence,
}: {
  event: EventDetail;
  mayAssertOccurrence: boolean;
}) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="occurrence-decision">
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" component="h2">
            {OCCURRENCE_HEADLINE}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {OCCURRENCE_DETAIL}
          </Typography>
        </Box>

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
          }}
        >
          {/*
            No "start time has passed" line. The wireframe had one and Brian
            removed it on the real screen: an operator standing in front of this
            decision was at the event, or knows perfectly well that it has been
            and gone, so a computed restatement of the date above adds nothing.
            Nothing decided from it either — invariant E5 kept time out of the
            assertion — so the whole computation went with the caption.
          */}
          <Fact
            label="Event status"
            value={labelFor(STATUS_LABELS, event.status)}
            testId="occurrence-status-fact"
          />
          <Fact
            label="Occurrence"
            value={OCCURRENCE_NOT_ASSERTED}
            note={OCCURRENCE_NEVER_INFERRED}
            testId="occurrence-fact"
          />
          <Fact
            label="Attendance"
            value={ATTENDANCE_UNAVAILABLE}
            note={ATTENDANCE_OPENS_AFTER}
            testId="occurrence-attendance-fact"
          />
        </Box>

        {mayAssertOccurrence ? (
          <OccurrenceDecisionForm eventId={event.id} />
        ) : (
          <Typography variant="body2" color="text.secondary" data-testid="occurrence-read-only">
            Recording what happened is done by the President, Vice-President, Secretary and General
            Manager.
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}

/**
 * What the event looks like once somebody has said what happened — UX-75 for
 * `not_held`, and the way through to the board for `occurred`.
 *
 * Both carry the correction, because § 9 requires a completed state to offer
 * "any permitted correction" and because an assertion made against the wrong
 * event in a list is the mistake this whole panel is one press away from.
 */
function OutcomePanel({
  event,
  mayAssertOccurrence,
}: {
  event: EventDetail;
  mayAssertOccurrence: boolean;
}) {
  const notHeld = event.status === "not_held";

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="outcome-panel">
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          {notHeld ? NOT_HELD_HEADLINE : "Attendance is open"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {notHeld
            ? NOT_HELD_DETAIL
            : "This event is recorded as having happened, so attendance can be recorded against it."}
        </Typography>

        {notHeld ? null : (
          <Box>
            <Button
              variant="contained"
              href={`/operate/events/${event.id}/attendance`}
              sx={{ minHeight: 44 }}
              data-testid="open-attendance"
            >
              Attendance
            </Button>
          </Box>
        )}

        {mayAssertOccurrence ? (
          <CorrectOccurrenceForm
            eventId={event.id}
            currentStatus={notHeld ? "not_held" : "occurred"}
          />
        ) : null}
      </Stack>
    </Paper>
  );
}

/** UX-32 — the event itself, in whatever state it is in. */
function EventDetailView({
  event,
  mayManage,
  mayApprove,
  mayAdministerDelivery,
  mayAssertOccurrence,
  justApproved,
  audience,
}: {
  event: EventDetail;
  mayManage: boolean;
  mayApprove: boolean;
  mayAdministerDelivery: boolean;
  mayAssertOccurrence: boolean;
  justApproved: boolean;
  audience: AudienceMember[];
}) {
  const preApproval = isPreApproval(event.status);
  const proposed = event.status === "draft" && audience.length > 0;
  const asserted = event.status === "occurred" || event.status === "not_held";

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

      {event.status === "approved" ? (
        <OccurrencePanel event={event} mayAssertOccurrence={mayAssertOccurrence} />
      ) : null}

      {asserted ? <OutcomePanel event={event} mayAssertOccurrence={mayAssertOccurrence} /> : null}

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
              event.audienceCount === 0
                ? "Chosen at approval"
                : proposed
                  ? `${event.audienceCount} chosen, not yet approved`
                  : `${event.audienceCount} confirmed`
            }
            note={
              event.audienceCount === 0
                ? AUDIENCE_COMES_LATER
                : proposed
                  ? "Saved against this draft. Nothing is sent until it is approved."
                  : AUDIENCE_FROZEN_AT_APPROVAL
            }
            testId="audience-fact"
          />
          <Divider />
          <Fact
            label="Distribution"
            value={event.invitationCount === 0 ? NO_DISTRIBUTION_HEADLINE : "Invitations created"}
            note={
              event.invitationCount === 0
                ? NO_DISTRIBUTION_DETAIL
                : `${event.invitationCount} invitations · ${event.responseCount} responses · ${NOTHING_DELIVERED_YET}`
            }
            testId="distribution-fact"
          />
          {audience.length > 0 ? (
            <AudienceList
              audience={audience}
              heading={proposed ? "Who this is for" : "Who was invited"}
              testId="event-audience"
            />
          ) : null}
        </Stack>
      </Paper>

      <Stack spacing={2} sx={{ maxWidth: 420 }}>
        {mayAdministerDelivery && !preApproval ? (
          // LAN-78's surface, reachable only once there is something to look
          // at. The route guards itself on `delivery_administration`; this is
          // the courtesy that stops an operator finding it by guessing.
          <Button
            variant="outlined"
            href={`/operate/events/${event.id}/delivery`}
            fullWidth
            sx={{ minHeight: 44 }}
          >
            Delivery
          </Button>
        ) : null}

        {mayApprove && event.status === "draft" ? (
          <Stack spacing={1}>
            <Button
              variant="contained"
              href={`/operate/events/${event.id}?step=${audience.length > 0 ? "review" : "audience"}`}
              fullWidth
              sx={{ minHeight: 44 }}
            >
              {audience.length > 0 ? "Review audience and approve" : "Choose audience and approve"}
            </Button>
            <Typography variant="body2" color="text.secondary">
              Nothing is sent until you have chosen who this event is for and approved it.
            </Typography>
          </Stack>
        ) : null}

        {mayManage && event.status === "draft" ? (
          <>
            <Button variant="contained" href={`/operate/events/${event.id}/edit`} fullWidth>
              Edit draft
            </Button>
            <AbandonDraftForm eventId={event.id} />
          </>
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
