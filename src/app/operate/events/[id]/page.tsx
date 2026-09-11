import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { operatorHasCapability } from "@/lib/auth/guards";
import { readEvent, readEventQuestions, type EventDetail } from "@/lib/services/events";
import { readEventAttendanceSummary } from "@/lib/services/attendance";
import {
  readApprovalPreview,
  readEventAudience,
  readEventAudienceGroupSummary,
} from "@/lib/services/event-approval";
import { readFrozenMessagingPlan } from "@/lib/services/messaging-schedule";
import { readEventTemplate } from "@/lib/services/event-templates";
import { readEventChangeHistory } from "@/lib/services/event-amendment";
import { readEventClubLink, readOperatorParticipation } from "@/lib/services/participation";
import { readParticipationFilters } from "@/lib/services/participation-view";
import {
  CLUB_LINK_NEEDS_AN_AUDIENCE_MESSAGE,
  CLUB_LINK_UNCONFIGURED_MESSAGE,
  clubLinkIsConfigured,
  clubLinkUrl,
} from "@/lib/services/club-link";
import { publicOrigin } from "../../../participation/origin";
import { gateShellPage } from "../../gate";
import { AudienceBuilder } from "./audience-builder";
import {
  ApprovalLayout,
  ApprovalReview,
  EmptyAudienceRefusal,
  IncompleteRefusal,
} from "./approval-review";
import { EventDetailView } from "./event-detail-view";
import { formatDeadline } from "../presentation";

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

/**
 * One event, in every presentation this route owns — UX-32, UX-33, and LAN-77's
 * UX-40, UX-41, UX-42 and UX-43. `?step=` selects the audience builder or the
 * confirmation; `?approved=1` reports the transition that just happened.
 *
 * Decision history: docs/ux/tickets/LAN-77-event-approval.md ·
 * docs/adr/0022-audience-proposed-then-frozen.md.
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
      // D47. Read for the sentence above the tick list only: what is *selected*
      // is what is stored on the draft, which may since have been edited.
      const template = await readEventTemplate(event.templateId);
      return (
        <ApprovalLayout event={event}>
          <AudienceBuilder
            eventId={event.id}
            eventType={event.eventType}
            templateName={event.templateName}
            candidates={preview.catalogue.candidates}
            counts={preview.catalogue.counts}
            initialKeys={preview.audience.map((member) => `${member.capacity}:${member.anchorId}`)}
            templateGroups={template.audienceGroups}
          />
        </ApprovalLayout>
      );
    }

    return (
      <ApprovalLayout event={event}>
        {preview.missing.length > 0 ? (
          <IncompleteRefusal eventId={event.id} missing={preview.missing} />
        ) : null}
        {preview.audience.length === 0 ? (
          <EmptyAudienceRefusal eventId={event.id} />
        ) : (
          <ApprovalReview
            event={event}
            audience={preview.audience}
            questions={preview.questions}
            groupSummary={preview.groupSummary}
            approvable={preview.missing.length === 0}
            deadline={
              preview.deadline
                ? {
                    label: formatDeadline(preview.deadline.at),
                    clamped: preview.deadline.clamped,
                  }
                : null
            }
            plan={preview.plan}
            unreachable={preview.unreachable}
          />
        )}
      </ApprovalLayout>
    );
  }

  // The audience is shown on the detail from the moment one is proposed, so a
  // draft carrying forty people says so rather than looking untouched — and an
  // approved event answers "who was actually invited?" without a second screen.
  const audience = event.audienceCount > 0 ? await readEventAudience(event.id) : [];

  // Amendment W4-A1. Read on every status: a draft's questions are being written
  // and an approved event's are what people were actually asked.
  const questions = await readEventQuestions(event.id);

  // REQ-headline-numbers, LAN-152. Read once there is an audience to count,
  // which is from approval onward — invitations are what approval creates, so
  // below it the three numbers would be three zeroes describing nothing.
  const summary = event.invitationCount > 0 ? await readEventAttendanceSummary(event.id) : null;

  // W5-05 and W6-02, LAN-156. Read for anything past `draft`, because a draft
  // has no history worth a panel: it has never been approved, so nothing has
  // been changed that anybody was told about.
  const history = event.status === "draft" ? [] : await readEventChangeHistory(event.id);

  // REQ-participation-table, LAN-157. Read from approval onward, for the same
  // reason the headline is: a draft has no invitations (invariant P1), so the
  // table would be a heading over nothing. `readOperatorParticipation` resolves
  // the operator from the session itself — this page's gate is the courtesy,
  // the service is the boundary.
  const participation =
    event.invitationCount > 0 ? await readOperatorParticipation(event.id) : null;
  const participationFilters = readParticipationFilters(
    query,
    participation?.questions ?? [],
    "operator",
  );

  // D3 (round 2): the audience is named by its groups before its people here
  // too, the same rule the approval review already states — read only when
  // `AudienceList` below will actually render, which is exactly when this
  // section shows names at all.
  const audienceGroupSummary =
    audience.length > 0 && participation === null
      ? await readEventAudienceGroupSummary(event.id)
      : null;

  // The dialog reads the live link and never creates one; **Create the link**
  // is what creates one. A page render must not write.
  const clubLink = shareOpen && mayManage ? await readEventClubLink(event.id) : null;

  // LAN-171. Frozen at approval and never recomputed — `REQ-schedule-not-retroactive`.
  // Read only once there is one to read: a draft has never been approved, so it
  // has no row in `event_messaging_plans` yet.
  const frozenPlan = event.status === "approved" ? await readFrozenMessagingPlan(event.id) : null;

  return (
    <EventDetailView
      event={event}
      mayManage={mayManage}
      mayApprove={mayApprove}
      mayAdministerDelivery={mayAdministerDelivery}
      justApproved={justApproved}
      audience={audience}
      audienceGroupSummary={audienceGroupSummary}
      questions={questions}
      summary={summary}
      history={history}
      participation={participation}
      participationFilters={participationFilters}
      frozenPlan={frozenPlan}
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
