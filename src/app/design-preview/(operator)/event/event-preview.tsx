import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isRegisterAvailable, registerOpensAt } from "@/lib/services/attendance";
import type { AttendanceSummary } from "@/lib/services/attendance-vocabulary";
import type { EventChangeEntry } from "@/lib/services/event-amendment";
import type { AudienceMember } from "@/lib/services/event-approval";
import type { EventQuestion } from "@/lib/services/event-questions";
import {
  describeQuestionAnswer,
  type DerivedEventState,
  type EventDetail,
} from "@/lib/services/events";
import type { FrozenMessagingPlan } from "@/lib/services/messaging-schedule";
import type {
  OperatorParticipation,
  ParticipationFilters,
} from "@/lib/services/participation-view";
import { ActionBar } from "@/components/action-bar";
import { Fact, FactGrid, FactList } from "@/components/fact";
import { Metric, MetricRow } from "@/components/metric";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatusChip } from "@/components/status-chip";
import { ParticipationFilterBar } from "@/app/participation/participation-filters";
import { QuestionCounts } from "@/app/participation/question-counts";
import { SHARE_LINK } from "@/app/participation/presentation";
import {
  frozenPlanForDisplay,
  MessagingPlanDisclosure,
} from "@/app/operate/events/[id]/messaging-plan";
import {
  CANCEL_EVENT_LABEL,
  describeHistoryEntry,
  describeTold,
  EDIT_EVENT_LABEL,
  formatRecordedMoment,
  HISTORY_EMPTY,
  HISTORY_HEADING,
} from "@/app/operate/events/[id]/change-presentation";
import {
  ATTENDANCE_OPEN_DETAIL,
  describeRegisterOpensAt,
  formatShowedAgainstInvited,
  HEADLINE_INVITED_LABEL,
  HEADLINE_SAID_YES_LABEL,
  HEADLINE_SHOWED_LABEL,
  REGISTER_NOT_YET_HEADLINE,
} from "@/app/operate/events/[id]/attendance/presentation";
import {
  AUDIENCE_FROZEN_AT_APPROVAL,
  DELIVERY_MODE_LABELS,
  DERIVED_STATE_LABELS,
  describeAttendance,
  DUPLICATE_ACTION,
  formatDetailWhen,
  formatTermAndWeek,
  JOINING_URL_IS_NEVER_PUBLIC,
  labelFor,
  NO_AUDIENCE_YET,
  NO_DISTRIBUTION_DETAIL,
  NO_DISTRIBUTION_HEADLINE,
  NOTHING_DELIVERED_YET,
  PLAN_MISSING_HEADLINE,
  PLAN_MISSING_NOTE,
  QUESTIONS_HEADLINE,
  STATUS_LABELS,
  TYPE_LABELS,
  venueLabel,
} from "@/app/operate/events/presentation";
import { Notice } from "@/components/notice";
import ParticipationPreview from "./participation-preview";

/**
 * The event record, rendered from the kit — LAN-225 S3.
 *
 * Every panel `EventDetailView` draws for an approved event, in its order:
 * the headline numbers as `Metric`s (E3), the register panel and the facts
 * as `Section`s, one `Fact` shape (C6), the frozen plan through the real
 * disclosure, the change history and the questions as `Section`s, the
 * participation table on the one status vocabulary (A4), and the actions
 * moved to the `PageHeader` with an `ActionBar` at the foot (E10).
 */
export default function EventPreview({
  event,
  derived,
  mayManage,
  mayApprove,
  mayAdministerDelivery,
  audience,
  questions,
  summary,
  history,
  participation,
  participationFilters,
  frozenPlan,
}: {
  event: EventDetail;
  derived: DerivedEventState;
  mayManage: boolean;
  mayApprove: boolean;
  mayAdministerDelivery: boolean;
  audience: AudienceMember[];
  questions: EventQuestion[];
  summary: AttendanceSummary | null;
  history: readonly EventChangeEntry[];
  participation: OperatorParticipation | null;
  participationFilters: ParticipationFilters;
  frozenPlan: FrozenMessagingPlan | null;
}) {
  const registerAvailable = isRegisterAvailable(event, summary?.registerSaved ?? false);
  const approved = event.status === "approved";

  return (
    <Stack spacing={3} data-testid="event-preview" data-status={event.status}>
      <PageHeader
        eyebrow={labelFor(TYPE_LABELS, event.eventType)}
        title={event.name}
        subtitle={formatDetailWhen(event)}
        back={{ href: "/operate/events", label: "Back to events" }}
        status={
          <Stack direction="row" spacing={0.75}>
            <StatusChip
              domain="event"
              status={event.status}
              label={labelFor(STATUS_LABELS, event.status)}
              size="medium"
            />
            {approved ? (
              <StatusChip
                domain="event"
                status={derived}
                label={labelFor(DERIVED_STATE_LABELS, derived)}
                size="medium"
              />
            ) : null}
          </Stack>
        }
        actions={
          <>
            {mayApprove && approved ? (
              <Button variant="contained">{EDIT_EVENT_LABEL}</Button>
            ) : null}
            {mayManage && event.status !== "draft" ? (
              <Button variant="outlined">{SHARE_LINK}</Button>
            ) : null}
          </>
        }
      />

      {summary ? (
        <MetricRow columns={3} testId="headline-numbers">
          <Metric value={String(summary.invited)} label={HEADLINE_INVITED_LABEL} />
          <Metric value={String(summary.saidYes)} label={HEADLINE_SAID_YES_LABEL} />
          <Metric value={formatShowedAgainstInvited(summary)} label={HEADLINE_SHOWED_LABEL} />
        </MetricRow>
      ) : null}

      {approved ? (
        <Section
          title={registerAvailable ? "Attendance is open" : REGISTER_NOT_YET_HEADLINE}
          description={
            registerAvailable
              ? ATTENDANCE_OPEN_DETAIL
              : describeRegisterOpensAt(registerOpensAt(event)?.toISOString() ?? null)
          }
          action={registerAvailable ? <Button variant="contained">Attendance</Button> : undefined}
          testId="register"
        />
      ) : null}

      <Section title="Details" testId="facts">
        <FactGrid columns={2}>
          <Fact label="Type" value={labelFor(TYPE_LABELS, event.eventType)} emphasis />
          <Fact label="Where" value={labelFor(DELIVERY_MODE_LABELS, event.deliveryMode)} emphasis />
          <Fact
            label={venueLabel(event.deliveryMode)}
            value={event.venue ?? "Not decided yet"}
            emphasis
          />
          <Fact
            label="Term / week"
            value={formatTermAndWeek(event.termLabel, event.weekNumber)}
            emphasis
          />
          <Fact label="Attendance" value={describeAttendance(event.isMandatory)} emphasis />
          <Fact
            label="Required equipment"
            value={event.requiredEquipment ?? "Nothing listed"}
            emphasis
          />
          {event.description ? (
            <Fact label="Description" value={event.description} emphasis />
          ) : null}
          {event.joiningUrl ? (
            <Fact
              label="Joining link"
              value={event.joiningUrl}
              note={JOINING_URL_IS_NEVER_PUBLIC}
              emphasis
            />
          ) : null}
        </FactGrid>
      </Section>

      <Section title="Audience and distribution" testId="audience">
        <FactList>
          <Fact
            label="Audience"
            layout="inline"
            value={event.audienceCount === 0 ? NO_AUDIENCE_YET : `${event.audienceCount} confirmed`}
            note={event.audienceCount === 0 ? undefined : AUDIENCE_FROZEN_AT_APPROVAL}
          />
          <Fact
            label="Distribution"
            layout="inline"
            value={event.invitationCount === 0 ? NO_DISTRIBUTION_HEADLINE : "Invitations created"}
            note={
              event.invitationCount === 0
                ? NO_DISTRIBUTION_DETAIL
                : `${event.invitationCount} invitations · ${event.responseCount} responses · ${NOTHING_DELIVERED_YET}`
            }
          />
        </FactList>
      </Section>

      {frozenPlan ? (
        <MessagingPlanDisclosure
          display={frozenPlanForDisplay(frozenPlan)}
          audienceSize={audience.filter((member) => member.capacity !== "recruit").length}
          recruitAudienceSize={audience.filter((member) => member.capacity === "recruit").length}
          approved
        />
      ) : approved ? (
        <Notice severity="warning" title={PLAN_MISSING_HEADLINE}>
          {PLAN_MISSING_NOTE}
        </Notice>
      ) : null}

      {event.status !== "draft" ? (
        <Section title={HISTORY_HEADING} testId="history">
          {history.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {HISTORY_EMPTY}
            </Typography>
          ) : (
            <FactList>
              {history.map((entry) => (
                <Fact
                  key={entry.id}
                  label={formatRecordedMoment(entry.occurredAt)}
                  value={describeHistoryEntry(entry)}
                  note={describeTold(entry.notified, entry.recipients)}
                  provenance={entry.actorName ?? "Not recorded"}
                  layout="inline"
                />
              ))}
            </FactList>
          )}
        </Section>
      ) : null}

      <Section title={QUESTIONS_HEADLINE} testId="questions">
        {questions.length === 0 ? null : (
          <FactList>
            {questions.map((question) => (
              <Fact
                key={question.id}
                label={question.prompt}
                layout="inline"
                value={
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.75 }}
                  >
                    <Typography variant="body2">{describeQuestionAnswer(question)}</Typography>
                    <StatusChip
                      domain="onboardingItem"
                      status={question.isRequired ? "required" : "optional"}
                      label={question.isRequired ? "Required" : "Optional"}
                    />
                  </Stack>
                }
              />
            ))}
          </FactList>
        )}
      </Section>

      {participation ? (
        <Stack spacing={2}>
          <QuestionCounts participation={participation} />
          <ParticipationFilterBar
            basePath="/design-preview/event"
            filters={participationFilters}
            showDelivery
          />
          <ParticipationPreview participation={participation} filters={participationFilters} />
        </Stack>
      ) : null}

      <ActionBar
        primary={
          mayApprove && approved ? (
            <Button variant="contained">{EDIT_EVENT_LABEL}</Button>
          ) : (
            <Button variant="outlined">{DUPLICATE_ACTION}</Button>
          )
        }
        secondary={
          <>
            {mayApprove && approved ? (
              <Button variant="outlined" color="error">
                {CANCEL_EVENT_LABEL}
              </Button>
            ) : null}
            {mayAdministerDelivery && approved ? (
              <Button variant="outlined">Delivery</Button>
            ) : null}
            {mayManage && mayApprove && approved ? (
              <Button variant="outlined">{DUPLICATE_ACTION}</Button>
            ) : null}
          </>
        }
        cancel={
          <Button variant="text" href="/operate/events">
            Back to events
          </Button>
        }
      />
    </Stack>
  );
}
