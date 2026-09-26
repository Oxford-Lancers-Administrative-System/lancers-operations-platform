import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
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
import {
  readEventClubLink,
  readEventShareFacts,
  readOperatorParticipation,
} from "@/lib/services/participation";
import { readParticipationFilters } from "@/lib/services/participation-view";
import {
  CLUB_LINK_NEEDS_AN_AUDIENCE_MESSAGE,
  CLUB_LINK_UNCONFIGURED_MESSAGE,
  clubLinkIsConfigured,
  clubLinkUrl,
} from "@/lib/services/club-link";
import { publicOrigin } from "../../../participation/origin";
import { buildShareMessage } from "../../../participation/share-message";
import {
  redactAudienceCandidates,
  redactAudienceMembers,
  redactUnreachable,
} from "@/lib/services/event-audience-access";
import { gateEventPage } from "../event-gate";
import { AudienceBuilder } from "./audience-builder";
import {
  ApprovalLayout,
  ApprovalReview,
  EmptyAudienceRefusal,
  IncompleteRefusal,
} from "./approval-review";
import { EventDetailView } from "./event-detail-view";
import { formatDeadline } from "../presentation";

/** Why **Create the link** is not offered, or `null` because it is — content, not an error (`docs/ux/standards.md` rule 6). */
function shareBlockedReason(status: string): string | null {
  if (!clubLinkIsConfigured()) return CLUB_LINK_UNCONFIGURED_MESSAGE;
  if (status === "draft") return CLUB_LINK_NEEDS_AN_AUDIENCE_MESSAGE;
  return null;
}

/** One event, in every presentation this route owns — UX-32/33, LAN-77's UX-40..43. */
export default async function EventDetailPage({
  params,
  searchParams,
}: PageProps<"/operate/events/[id]">) {
  const { id } = await params;
  // LAN-431: View on this event's template opens the page; Manage adds every control.
  const gate = await gateEventPage("/operate/events", id, "view");
  if ("screen" in gate) return gate.screen;

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

  // LAN-431: all three follow Manage on this event's template — creating, editing, deleting,
  // approving, releasing invitations, amending, cancelling and delivery are one level.
  const mayManage = gate.level === "manage";
  const mayApprove = mayManage;
  const mayAdministerDelivery = mayManage;
  const canWorkOnAudience = mayApprove && event.status === "draft";

  // UX-40/41: audience data loaded only for an approver working a draft.
  if (canWorkOnAudience && (step === "audience" || step === "review")) {
    const preview = await readApprovalPreview(event.id);
    // LAN-423: the per-person detail follows the seat's roster and recruiting
    // grants; Manage on the template alone carries names and groups.
    const grants = gate.operator.grants;
    const audienceMembers = redactAudienceMembers(preview.audience, grants);

    if (step === "audience") {
      // D47: read only for the "selected" sentence — may differ from the stored draft.
      const template = await readEventTemplate(event.templateId);
      return (
        <ApprovalLayout event={event}>
          <AudienceBuilder
            eventId={event.id}
            eventType={event.eventType}
            templateName={event.templateName}
            candidates={redactAudienceCandidates(
              preview.catalogue.candidates,
              grants,
              event.eventType,
              [...preview.audienceGroups, ...template.audienceGroups],
            )}
            counts={preview.catalogue.counts}
            initialKeys={audienceMembers.map((member) => `${member.capacity}:${member.anchorId}`)}
            initialGroups={preview.audienceGroups}
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
        {audienceMembers.length === 0 ? (
          <EmptyAudienceRefusal eventId={event.id} />
        ) : (
          <ApprovalReview
            event={event}
            audience={audienceMembers}
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
            unreachable={redactUnreachable(preview.unreachable, grants)}
          />
        )}
      </ApprovalLayout>
    );
  }

  // Audience shown on detail from the moment one is proposed (no second screen after approval).
  const audience =
    event.audienceCount > 0
      ? redactAudienceMembers(await readEventAudience(event.id), gate.operator.grants)
      : [];

  // Amendment W4-A1: read on every status.
  const questions = await readEventQuestions(event.id);

  // REQ-headline-numbers, LAN-152: read once there's an audience to count (from approval).
  const summary = event.invitationCount > 0 ? await readEventAttendanceSummary(event.id) : null;

  // W5-05, W6-02, LAN-156: read for anything past draft (nothing to show before approval).
  const history = event.status === "draft" ? [] : await readEventChangeHistory(event.id);

  // REQ-participation-table, LAN-157: read from approval onward; service resolves the operator itself.
  const participation =
    event.invitationCount > 0 ? await readOperatorParticipation(event.id) : null;
  const participationFilters = readParticipationFilters(
    query,
    participation?.questions ?? [],
    "operator",
  );

  // D3 (round 2): audience named by groups before people, read only when AudienceList will render.
  const audienceGroupSummary =
    audience.length > 0 && participation === null
      ? await readEventAudienceGroupSummary(event.id)
      : null;

  // Dialog reads the live link; a page render must not write.
  // W4-05: the Event info link shares and sends nothing, so View holds it.
  const clubLink = shareOpen ? await readEventClubLink(event.id) : null;

  /**
   * The six lines the share panel shows and its button copies — LAN-410.
   *
   * Read here, on the server, rather than fetched by the button: Safari
   * refuses a clipboard write once the click's activation has lapsed, and an
   * awaited server action guarantees that. `readEventShareFacts` issues a link
   * where there is none, so it is called only where `clubLink` already exists
   * — opening the panel stays a read, and the link is still issued by the
   * panel's own button.
   */
  const shareMessage =
    clubLink === null
      ? null
      : await (async () => {
          const facts = await readEventShareFacts(event.id);
          return buildShareMessage({
            eventName: facts.eventName,
            scheduledOn: facts.scheduledOn,
            startsAt: facts.startsAt,
            endsAt: facts.endsAt,
            venue: facts.venue,
            invited: facts.invited,
            saidYes: facts.saidYes,
            saidNo: facts.saidNo,
            url: clubLinkUrl(await publicOrigin(), facts.token),
          });
        })();

  // LAN-171, REQ-schedule-not-retroactive: frozen at approval, read only once there is a row.
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
        shareOpen
          ? {
              url: clubLink === null ? null : clubLinkUrl(await publicOrigin(), clubLink.token),
              message: shareMessage,
              blockedReason: shareBlockedReason(event.status),
              errorRule: shareError,
            }
          : null
      }
    />
  );
}
