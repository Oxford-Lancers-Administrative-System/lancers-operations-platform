import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { operatorHasCapability } from "@/lib/auth/guards";
import { derivedEventState, readEvent, type EventDetail } from "@/lib/services/events";
import { todayInClubZone } from "@/lib/club-time";
import {
  isRegisterAvailable,
  readEventAttendanceSummary,
  registerOpensAt,
  type AttendanceSummary,
} from "@/lib/services/attendance";
import {
  readApprovalPreview,
  readEventAudience,
  type AudienceMember,
} from "@/lib/services/event-approval";
import { readEventClubLink, readOperatorParticipation } from "@/lib/services/participation";
import {
  readParticipationFilters,
  type OperatorParticipation,
  type ParticipationFilters,
} from "@/lib/services/participation-view";
import {
  CLUB_LINK_NEEDS_AN_AUDIENCE_MESSAGE,
  CLUB_LINK_UNCONFIGURED_MESSAGE,
  clubLinkIsConfigured,
  clubLinkUrl,
} from "@/lib/services/club-link";
import { ParticipationFilterBar } from "../../../participation/participation-filters";
import { ParticipationTable } from "../../../participation/participation-table";
import { QuestionCounts } from "../../../participation/question-counts";
import { publicOrigin } from "../../../participation/origin";
import { SHARE_LINK } from "../../../participation/presentation";
import { SharePanel } from "./share-panel";
import { gateShellPage } from "../../gate";
import { ApproveEventForm } from "../event-actions";
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
  DELIVERY_MODE_LABELS,
  DERIVED_STATE_LABELS,
  describeAttendance,
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
  JOINING_URL_IS_NEVER_PUBLIC,
  NOTHING_DELIVERED_YET,
  STATUS_LABELS,
  TYPE_LABELS,
  venueLabel,
} from "../presentation";
import {
  ATTENDANCE_OPEN_DETAIL,
  describeRegisterOpensAt,
  formatShowedAgainstInvited,
  HEADLINE_INVITED_LABEL,
  HEADLINE_SAID_YES_LABEL,
  HEADLINE_SHOWED_LABEL,
  REGISTER_NOT_YET_HEADLINE,
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
/**
 * Why **Create the link** is not offered, or `null` because it is.
 *
 * Both refusals are content rather than an error — `docs/ux/standards.md`
 * rule 6 — and the service refuses again on its own behalf regardless.
 */
function shareBlockedReason(status: string): string | null {
  if (!clubLinkIsConfigured()) return CLUB_LINK_UNCONFIGURED_MESSAGE;
  if (status === "draft") return CLUB_LINK_NEEDS_AN_AUDIENCE_MESSAGE;
  return null;
}

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
  const shareOpen = query.share === "1";
  const shareError = typeof query.shareError === "string" ? query.shareError : null;

  let event: EventDetail;
  try {
    event = await readEvent(id);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen title="Event" message={error.message} testId="event-unavailable">
        <Box>
          <Button variant="outlined" href="/operate/events">
            Back to events
          </Button>
        </Box>
      </UnavailableScreen>
    );
  }

  const mayManage = operatorHasCapability(gate.operator, "event_calendar_management");
  const mayApprove = operatorHasCapability(gate.operator, "event_approval");
  const mayAdministerDelivery = operatorHasCapability(gate.operator, "delivery_administration");
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

  // REQ-headline-numbers, LAN-152. Read once there is an audience to count,
  // which is from approval onward — invitations are what approval creates, so
  // below it the three numbers would be three zeroes describing nothing.
  const summary = event.invitationCount > 0 ? await readEventAttendanceSummary(event.id) : null;

  // REQ-participation-table, LAN-157. Read from approval onward, for the same
  // reason the headline is: a draft has no invitations (invariant P1), so the
  // table would be a heading over nothing. `readOperatorParticipation` resolves
  // the operator from the session itself — this page's gate is the courtesy,
  // the service is the boundary.
  const participation =
    event.invitationCount > 0 ? await readOperatorParticipation(event.id) : null;
  const participationFilters = readParticipationFilters(query, participation?.questions ?? []);

  // The dialog reads the live link and never creates one; **Create the link**
  // is what creates one. A page render must not write.
  const clubLink = shareOpen && mayManage ? await readEventClubLink(event.id) : null;

  return (
    <EventDetailView
      event={event}
      mayManage={mayManage}
      mayApprove={mayApprove}
      mayAdministerDelivery={mayAdministerDelivery}
      justApproved={justApproved}
      audience={audience}
      summary={summary}
      participation={participation}
      participationFilters={participationFilters}
      share={
        shareOpen && mayManage
          ? {
              url: clubLink === null ? null : clubLinkUrl(await publicOrigin(), clubLink.token),
              blockedReason: shareBlockedReason(event.status),
              errorRule: shareError,
            }
          : null
      }
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
            note={`${describeAttendance(event.isMandatory)} · ${labelFor(
              DELIVERY_MODE_LABELS,
              event.deliveryMode,
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

/**
 * The three headline numbers — REQ-headline-numbers, D62, D73 and D74. LAN-152.
 *
 * **Invited · Said yes · Showed**, at the top of the event page and large,
 * because they are the primary operational facts about an event and the build
 * rendered them nowhere. Everything else on this page is administration; this
 * is what somebody opened it to find out.
 *
 * ## Three deliberate absences
 *
 * **No percentages.** D62 asks for raw pairs. `20 / 37` is the fact; `54%` is
 * the fact with both of the numbers the club wanted removed from it.
 *
 * **No sentence explaining the dash.** `Showed` reads `— / 37` until a register
 * has been saved and `0 / 37` afterwards, and the packet is explicit that the
 * application explains neither in words: "explanatory text about washouts
 * belongs in a review artifact, not in the product". The two values carry it.
 *
 * **No judgment.** Nothing here is coloured, flagged or compared against a
 * target. A quiet Tuesday in fifth week is a fact about the term, not a
 * failing, and a screen that decided otherwise would be inventing a club
 * policy nobody has agreed.
 */
function HeadlineNumbers({ summary }: { summary: AttendanceSummary }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
      }}
      data-testid="headline-numbers"
    >
      <Metric
        value={String(summary.invited)}
        label={HEADLINE_INVITED_LABEL}
        testId="headline-invited"
      />
      <Metric
        value={String(summary.saidYes)}
        label={HEADLINE_SAID_YES_LABEL}
        testId="headline-said-yes"
      />
      <Metric
        value={formatShowedAgainstInvited(summary)}
        label={HEADLINE_SHOWED_LABEL}
        testId="headline-showed"
      />
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
 * The register, and whether it is open yet.
 *
 * D71 opens it on a buffer before the event starts and D72 never closes it, so
 * this panel has one question to answer and it is the clock's. Nobody is asked
 * to decide anything here, and there is nothing to confirm.
 *
 * `isRegisterAvailable` is the same function the register itself calls, with
 * `registerSaved` taken off the headline numbers this page has already read.
 * `docs/ux/standards.md` rule 7 is why it has to be the same one: this panel
 * offering **Attendance** beside a register that then says "not open yet" is
 * two screens answering one question two ways, and it is what the LAN-152
 * browser preflight found.
 */
function RegisterPanel({ event, registerSaved }: { event: EventDetail; registerSaved: boolean }) {
  const available = isRegisterAvailable(event, registerSaved);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="register-panel">
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          {available ? "Attendance is open" : REGISTER_NOT_YET_HEADLINE}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {available
            ? ATTENDANCE_OPEN_DETAIL
            : describeRegisterOpensAt(registerOpensAt(event)?.toISOString() ?? null)}
        </Typography>

        {available ? (
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
  justApproved,
  audience,
  summary,
  participation,
  participationFilters,
  share,
}: {
  event: EventDetail;
  mayManage: boolean;
  mayApprove: boolean;
  mayAdministerDelivery: boolean;
  justApproved: boolean;
  audience: AudienceMember[];
  summary: AttendanceSummary | null;
  /** `null` until approval creates invitations — invariant P1. */
  participation: OperatorParticipation | null;
  participationFilters: ParticipationFilters;
  /** `null` unless the operator opened **Share link**. */
  share: { url: string | null; blockedReason: string | null; errorRule: string | null } | null;
}) {
  const preApproval = isPreApproval(event.status);
  const proposed = event.status === "draft" && audience.length > 0;
  // D30, derived and never stored. Shown beside the stored status rather than
  // instead of it: "Approved" and "Occurred" answer different questions.
  const derived = derivedEventState(event, todayInClubZone());

  return (
    <Stack
      spacing={3}
      sx={{ maxWidth: 1200 }}
      data-testid="event-detail"
      data-status={event.status}
    >
      <Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{
            justifyContent: "space-between",
            alignItems: { xs: "flex-start", sm: "center" },
          }}
        >
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {event.name}
          </Typography>
          {/*
            §4.15: issuing and sharing the club link is this workflow's, and it
            is offered beside the event's name because that is where the
            approved mockup puts it. `mayManage` decides whether it is drawn;
            the action and the service both refuse on their own behalf.
          */}
          {mayManage && event.status !== "draft" ? (
            <Button
              variant="outlined"
              size="small"
              href={`/operate/events/${event.id}?share=1`}
              data-testid="share-link-button"
            >
              {SHARE_LINK}
            </Button>
          ) : null}
        </Stack>
        {/*
          The derived state sits beside the stored one only where it says
          something the stored one does not — which is an approved event, and
          only that. A cancelled event would read "Cancelled · Cancelled", and a
          past draft would read "Draft · Occurred", which is worse than
          redundant: a draft nobody approved did not happen.
        */}
        <Typography variant="body2" color="text.secondary" data-testid="event-subtitle">
          {[
            labelFor(STATUS_LABELS, event.status),
            event.status === "approved" ? labelFor(DERIVED_STATE_LABELS, derived) : null,
            formatDetailWhen(event),
          ]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
      </Box>

      {share ? (
        <SharePanel
          eventId={event.id}
          url={share.url}
          blockedReason={share.blockedReason}
          errorRule={share.errorRule}
          closeHref={`/operate/events/${event.id}`}
        />
      ) : null}

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

      {summary ? <HeadlineNumbers summary={summary} /> : null}

      {preApproval ? (
        <Alert severity="info" data-testid="no-invitations-note">
          {NO_DISTRIBUTION_RULE}
        </Alert>
      ) : null}

      {event.status === "approved" ? (
        <RegisterPanel event={event} registerSaved={summary?.registerSaved ?? false} />
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
          <Fact label="Where" value={labelFor(DELIVERY_MODE_LABELS, event.deliveryMode)} />
          <Fact
            label={venueLabel(event.deliveryMode)}
            value={event.venue ?? "Not decided yet"}
            testId="venue-fact"
          />
          <Fact label="Term / week" value={formatTermAndWeek(event.termLabel, event.weekNumber)} />
          <Fact label="Attendance" value={describeAttendance(event.isMandatory)} />
          <Fact
            label="Required equipment"
            value={event.requiredEquipment ?? "Nothing listed"}
            testId="equipment-fact"
          />
          {event.description ? (
            <Fact label="Description" value={event.description} testId="description-fact" />
          ) : null}
          {/*
            REQ-no-joining-url. Operator tier only, and this route is operator
            tier. It is never rendered on a public surface, never in a feed, and
            never in a payload behind one.
          */}
          {event.joiningUrl ? (
            <Fact
              label="Joining link"
              value={event.joiningUrl}
              note={JOINING_URL_IS_NEVER_PUBLIC}
              testId="joining-url-fact"
            />
          ) : null}
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
          {/*
            W7: the audience list "becomes the full table". It survives for the
            one state the table cannot describe — a draft whose audience is
            chosen but not yet approved, which has no invitations, no answers
            and no attendance to put in columns (invariant P1).
          */}
          {audience.length > 0 && participation === null ? (
            <AudienceList
              audience={audience}
              heading={proposed ? "Who this is for" : "Who was invited"}
              testId="event-audience"
            />
          ) : null}
        </Stack>
      </Paper>

      {/*
        REQ-participation-table — W7's centre. One row per person: who was
        asked, what they said, and whether they came, with delivery at this
        tier and one column per question.
      */}
      {participation ? (
        <Stack spacing={2}>
          {/* D68's counts, collapsed. The per-person answers are in the table. */}
          <QuestionCounts participation={participation} />
          <ParticipationFilterBar
            basePath={`/operate/events/${event.id}`}
            filters={participationFilters}
            showDelivery
          />
          <ParticipationTable
            basePath={`/operate/events/${event.id}`}
            participation={participation}
            filters={participationFilters}
          />
        </Stack>
      ) : null}

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
            {/*
              **Abandon draft** was here and went with the `withdrawn` status it
              produced. An abandoned draft is deleted (D29), permanently and
              after a confirmation naming it, and that path belongs to this
              mission's W4 work package. Until it lands a draft nobody wants
              stays a draft rather than being parked in a status that says it
              never happened.
            */}
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
