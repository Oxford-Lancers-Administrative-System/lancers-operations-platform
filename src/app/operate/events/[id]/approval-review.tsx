import { Notice } from "@/components/notice";
import { Fact } from "@/components/fact";
import { Metric } from "@/components/metric";
import { Section } from "@/components/section";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { describeMissingForApproval } from "@/lib/services/event-approval";
import type { AudienceMember, UnreachableAudienceMember } from "@/lib/services/event-approval";
import type { EventDetail, EventQuestion } from "@/lib/services/events";
import type { AudienceGroupSummary } from "@/lib/services/audience-selection";
import type { MessagingPlan } from "@/lib/services/messaging-schedule";
import { ApproveEventForm } from "../event-actions";
import { MessagingPlanDisclosure, planForDisplay, WhatsAppErrorsAlert } from "./messaging-plan";
import { AudienceList, describeAudienceShape } from "./audience-list";
import { QuestionList } from "./question-list";
import {
  APPROVAL_HEADLINE_PREFIX,
  DEADLINE_DUE_IMMEDIATELY,
  DEADLINE_DUE_IMMEDIATELY_DETAIL,
  DEADLINE_NONE,
  DEADLINE_NONE_DETAIL,
  DELIVERY_MODE_LABELS,
  describeAttendance,
  DISTRIBUTION_AUTOMATED,
  DISTRIBUTION_BEGINS_AFTER_APPROVAL,
  EMPTY_AUDIENCE_DETAIL,
  EMPTY_AUDIENCE_HEADLINE,
  formatDetailWhen,
  INCOMPLETE_EVENT_ACTION,
  INCOMPLETE_EVENT_HEADLINE,
  labelFor,
  QUESTIONS_REVIEW_DETAIL,
  STATUS_LABELS,
} from "../presentation";

/** The heading every approval step sits under, so the event never leaves view. */
export function ApprovalLayout({
  event,
  children,
}: {
  event: EventDetail;
  children: React.ReactNode;
}) {
  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }} data-testid="approval-step">
      <PageHeader
        title={event.name}
        subtitle={formatDetailWhen(event)}
        back={{ href: `/operate/events/${event.id}`, label: "Back to event" }}
        status={
          <StatusChip
            domain="event"
            status={event.status}
            label={labelFor(STATUS_LABELS, event.status)}
          />
        }
      />
      {children}
    </Stack>
  );
}

/** UX-42 — refused before anything is written, and said as a screen. */
export function EmptyAudienceRefusal({ eventId }: { eventId: string }) {
  return (
    <Section title={EMPTY_AUDIENCE_HEADLINE} testId="empty-audience-refusal">
      <Stack spacing={2}>
        <Notice variant="refusal">{EMPTY_AUDIENCE_DETAIL}</Notice>

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
    </Section>
  );
}

/**
 * D16's refusal, named — W4-06.
 *
 * The completeness gate is enforced in `approveEvent`, so this screen is what an
 * operator sees rather than what stops them. It names the fields rather than
 * disabling the button silently, and offers the route that fixes them, which is
 * `docs/ux/standards.md` rules 4 and 5 over the same panel.
 */
export function IncompleteRefusal({ eventId, missing }: { eventId: string; missing: string[] }) {
  return (
    <Section title={INCOMPLETE_EVENT_HEADLINE} testId="incomplete-refusal">
      <Stack spacing={2}>
        <Notice variant="refusal">{describeMissingForApproval(missing)}</Notice>
        <Box>
          <Button
            variant="contained"
            href={`/operate/events/${eventId}/edit`}
            sx={{ minHeight: 44 }}
          >
            {INCOMPLETE_EVENT_ACTION}
          </Button>
        </Box>
      </Stack>
    </Section>
  );
}

/** UX-41 — the event, the people and the questions, read once. */
export function ApprovalReview({
  event,
  audience,
  questions,
  groupSummary,
  approvable,
  deadline,
  plan,
  unreachable,
}: {
  event: EventDetail;
  audience: AudienceMember[];
  questions: EventQuestion[];
  groupSummary: AudienceGroupSummary;
  approvable: boolean;
  deadline: { label: string; clamped: boolean } | null;
  /** LAN-171. `null` only while `deadline` is — an event with no date yet. */
  plan: MessagingPlan | null;
  unreachable: readonly UnreachableAudienceMember[];
}) {
  const stale = audience.filter((member) => !member.stillSelectable).length;

  return (
    <Section title={`${APPROVAL_HEADLINE_PREFIX} ${event.name}`} testId="approval-review">
      <Stack spacing={3}>
        {/*
          The audience by its groups, before its people — Brian, 2026-08-21:
          "it should say at the very top what groups it would be ... You don't
          have to show me how it's done." An approver checks a shape faster than
          they check a list of thirty-five, and the names are still underneath.
        */}
        <Box data-testid="audience-shape">
          <Typography variant="overline" color="text.secondary" component="p">
            Who will be asked
          </Typography>
          <Typography variant="h6" component="p">
            {describeAudienceShape(groupSummary)}
          </Typography>
        </Box>

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
          <Notice severity="info" testId="stale-audience-note">
            {stale === 1
              ? "One person in this audience is no longer active. They will still be invited."
              : `${stale} people in this audience are no longer active. They will still be invited.`}
          </Notice>
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
            value={`${event.templateName} · ${event.venue ?? "No venue yet"}`}
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

        {/*
          D8, W1's exception table: a missing or unusable WhatsApp route is an
          error named before approval, not discovered afterwards. Placed beside
          the facts and ahead of the named list, exactly where the approved
          mockup puts it.
        */}
        <WhatsAppErrorsAlert unreachable={unreachable} />

        <AudienceList audience={audience} heading="By name" testId="resolved-audience" />

        <Box>
          <Typography variant="overline" color="text.secondary" component="p">
            {`What they will be asked`}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {QUESTIONS_REVIEW_DETAIL}
          </Typography>
          <QuestionList questions={questions} leadWithRsvp testId="review-questions" />
        </Box>

        {/*
          W1's purpose: an approver reads the whole plan before pressing
          Approve. Last in the review, per the approved acceptance contract —
          "the messaging plan appears last as an expandable disclosure".
        */}
        {plan ? (
          <MessagingPlanDisclosure
            display={planForDisplay(plan)}
            // REQ-approval-shows-both-ladders. Once there is a recruit
            // ladder, `audienceSize` is the ladder it is paired with in the
            // disclosure — everyone the player ladder actually reaches,
            // never including the recruits shown in their own block below.
            audienceSize={audience.filter((member) => member.capacity !== "recruit").length}
            recruitAudienceSize={audience.filter((member) => member.capacity === "recruit").length}
            approved={false}
          />
        ) : null}

        {approvable ? <ApproveEventForm eventId={event.id} /> : null}
      </Stack>
    </Section>
  );
}
