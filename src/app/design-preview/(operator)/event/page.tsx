import { isServiceError } from "@/lib/db";
import { operatorHasCapability } from "@/lib/auth/guards";
import { todayInClubZone } from "@/lib/club-time";
import { readEventAttendanceSummary } from "@/lib/services/attendance";
import { readEventChangeHistory } from "@/lib/services/event-amendment";
import { readEventAudience } from "@/lib/services/event-approval";
import {
  derivedEventState,
  readEvent,
  readEventQuestions,
  type EventDetail,
} from "@/lib/services/events";
import { readFrozenMessagingPlan } from "@/lib/services/messaging-schedule";
import { readOperatorParticipation } from "@/lib/services/participation";
import { readParticipationFilters } from "@/lib/services/participation-view";
import { Refusal } from "@/components/refusal";
import { gateShellPage } from "@/app/operate/gate";
import { pickApprovedEvent } from "../../picks";
import EventPreview from "./event-preview";

/**
 * S3 — an approved event, on the kit. LAN-225.
 *
 * `/operate/events/[id]` for the next approved event with invitations, read
 * through the same gate and the same services in the same order. Content
 * unchanged; the buttons are drawn, not wired.
 */
export default async function EventPreviewPage({
  searchParams,
}: PageProps<"/design-preview/event">) {
  const gate = await gateShellPage("/design-preview/event");
  if ("screen" in gate) return gate.screen;

  const picked = await pickApprovedEvent();
  if (!picked) {
    return (
      <Refusal
        title="No approved event to show"
        message="The seed has no approved event with invitations."
        action={{ href: "/design-preview", label: "Back to the preview" }}
      />
    );
  }

  let event: EventDetail;
  try {
    event = await readEvent(picked.id);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <Refusal
        title="Event"
        message={error.message}
        action={{ href: "/operate/events", label: "Back to events" }}
      />
    );
  }

  const query = await searchParams;
  const [audience, questions, summary, history, participation, frozenPlan] = await Promise.all([
    event.audienceCount > 0 ? readEventAudience(event.id) : Promise.resolve([]),
    readEventQuestions(event.id),
    event.invitationCount > 0 ? readEventAttendanceSummary(event.id) : Promise.resolve(null),
    event.status === "draft" ? Promise.resolve([]) : readEventChangeHistory(event.id),
    event.invitationCount > 0 ? readOperatorParticipation(event.id) : Promise.resolve(null),
    event.status === "approved" ? readFrozenMessagingPlan(event.id) : Promise.resolve(null),
  ]);
  const participationFilters = readParticipationFilters(
    query,
    participation?.questions ?? [],
    "operator",
  );

  return (
    <EventPreview
      event={event}
      derived={derivedEventState(event, todayInClubZone())}
      mayManage={operatorHasCapability(gate.operator, "event_calendar_management")}
      mayApprove={operatorHasCapability(gate.operator, "event_approval")}
      mayAdministerDelivery={operatorHasCapability(gate.operator, "delivery_administration")}
      audience={audience}
      questions={questions}
      summary={summary}
      history={history}
      participation={participation}
      participationFilters={participationFilters}
      frozenPlan={frozenPlan}
    />
  );
}
