import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  buildLadder,
  type FrozenMessagingPlan,
  type FrozenRecruitLadder,
  type LadderRung,
  type MessagingPlan,
  type RecruitMessagingLadder,
} from "@/lib/services/messaging-schedule";
import {
  describePlanStepCount,
  describeWhatsAppErrorCount,
  formatPlanWhen,
  MESSAGING_PLAN_HEADLINE,
  PLAN_COMMITS_ON_APPROVAL,
  PLAN_DISPATCHES_IMMEDIATELY,
  PLAN_FROZEN_AT_APPROVAL,
  PLAN_LATE_APPROVAL,
  PLAN_LIGHTS_OUT,
  PLAN_RECOVERY_NOTE,
  WHATSAPP_ERROR_DETAIL,
  whatsAppErrorDisclosureLabel,
} from "../presentation";
import type { UnreachableAudienceMember } from "@/lib/services/event-approval";
import {
  clubEventStart,
  describeEventMessage,
  eventMessageSendAt,
  type EventMessageChannel,
  type EventMessageRecipients,
} from "@/lib/services/event-messages-input";

/**
 * The messaging plan disclosure — W1, LAN-171. Projects a resolved plan
 * (pre- or post-approval) into what the event page shows; creates and sends
 * nothing itself. See `messaging-schedule.ts` for where the values come from.
 */
/** REQ-approval-shows-both-ladders. Recruit ladder only — one invitation and at most one follow-up, built directly rather than through {@link buildLadder}. */
interface DisplayRecruitPlan {
  readonly rungs: readonly LadderRung[];
  readonly dispatchesImmediately: boolean;
}

/** LAN-508. One event message, as a row of the plan (W1-03). */
interface DisplayEventMessage {
  readonly at: Date;
  readonly detail: string;
  readonly recipients: EventMessageRecipients;
}

interface DisplayPlan {
  readonly rungs: readonly LadderRung[];
  readonly escalationAt: Date | null;
  readonly dispatchesImmediately: boolean;
  readonly lateApproval: boolean;
  readonly recruit: DisplayRecruitPlan | null;
  readonly eventMessages: readonly DisplayEventMessage[];
}

/** What the plan needs of an event message: when it goes, or went, and what it says. */
export interface PlanEventMessage {
  readonly hoursBefore: number;
  readonly channel: EventMessageChannel;
  readonly recipients: EventMessageRecipients;
  readonly lastSend?: { readonly sentAt: Date } | null;
}

/**
 * LAN-508. The event messages as plan rows, each at its moment: when it went,
 * or when it goes (the event start less its hours, 07:00 for a moment in
 * lights-out). None before the event has a date and a start.
 */
function eventMessagesForDisplay(
  messages: readonly PlanEventMessage[],
  event: { scheduledOn: string | null; startsAt: string | null },
): DisplayEventMessage[] {
  const start = clubEventStart(event.scheduledOn, event.startsAt);
  if (start === null) return [];
  return messages.map((message) => ({
    at: message.lastSend?.sentAt ?? eventMessageSendAt(start, message.hoursBefore),
    detail: describeEventMessage(message),
    recipients: message.recipients,
  }));
}

function recruitRungs(ladder: RecruitMessagingLadder | FrozenRecruitLadder): LadderRung[] {
  const rungs: LadderRung[] = [
    { rung: 0, kind: "invitation", channel: "whatsapp", at: ladder.invitationAt },
  ];
  if (ladder.followUpAt) {
    rungs.push({ rung: 1, kind: "reminder", channel: "whatsapp", at: ladder.followUpAt });
  }
  return rungs;
}

export function planForDisplay(
  plan: MessagingPlan,
  messages: readonly PlanEventMessage[] = [],
  event: { scheduledOn: string | null; startsAt: string | null } = {
    scheduledOn: null,
    startsAt: null,
  },
): DisplayPlan {
  return {
    eventMessages: eventMessagesForDisplay(messages, event),
    rungs: plan.rungs,
    escalationAt: plan.escalationAt,
    dispatchesImmediately: plan.dispatchesImmediately,
    lateApproval: plan.lateApproval,
    recruit: plan.recruitLadder
      ? {
          rungs: recruitRungs(plan.recruitLadder),
          dispatchesImmediately: plan.recruitLadder.dispatchesImmediately,
        }
      : null,
  };
}

export function frozenPlanForDisplay(
  frozen: FrozenMessagingPlan,
  messages: readonly PlanEventMessage[] = [],
  event: { scheduledOn: string | null; startsAt: string | null } = {
    scheduledOn: null,
    startsAt: null,
  },
): DisplayPlan {
  const scheduled = frozen.whatsappRemindersScheduled + frozen.emailRemindersScheduled;
  return {
    eventMessages: eventMessagesForDisplay(messages, event),
    rungs: buildLadder(
      frozen.invitationAt,
      frozen.schedule.reminderCadenceHours,
      frozen.whatsappRemindersScheduled,
      frozen.emailRemindersScheduled,
      scheduled,
    ),
    escalationAt: frozen.escalationAt,
    dispatchesImmediately: frozen.dispatchesImmediately,
    lateApproval: frozen.lateApproval,
    recruit: frozen.recruitLadder
      ? {
          rungs: recruitRungs(frozen.recruitLadder),
          dispatchesImmediately: frozen.recruitLadder.dispatchesImmediately,
        }
      : null,
  };
}

/** One rung, described for rendering: "WhatsApp message 2", not "rung 1". */
interface DescribedRung {
  readonly rung: LadderRung;
  readonly title: string;
  readonly note: string;
  readonly side: string;
}

/** Every rung, described in order — computed once, as data, before rendering. */
function describeRungs(rungs: readonly LadderRung[], audienceSize: number): DescribedRung[] {
  const people = `${audienceSize} ${audienceSize === 1 ? "person" : "people"}`;
  const totalEmail = rungs.filter((rung) => rung.channel === "email").length;

  let whatsappCount = 0;
  let emailCount = 0;
  let reminderIndex = 0;

  return rungs.map((rung) => {
    if (rung.channel === "whatsapp") whatsappCount += 1;
    else emailCount += 1;

    if (rung.kind === "invitation") {
      return {
        rung,
        title: "WhatsApp message 1",
        note: `Automated 1:1 message to all ${people}.`,
        side: people,
      };
    }

    // Escalating wording per W1's approved mockup: first reminder differs from later ones.
    const note =
      reminderIndex === 0
        ? "Only to people who have not answered."
        : "Only to people who still have not answered.";
    const side = reminderIndex === 0 ? "Unanswered" : "Still unanswered";
    const title =
      rung.channel === "whatsapp"
        ? `WhatsApp message ${whatsappCount}`
        : totalEmail > 1
          ? `Email ${emailCount}`
          : "Email";
    reminderIndex += 1;

    return { rung, title, note, side };
  });
}

/** One row of the plan, in the plan's own anatomy: when, what, detail, who. */
interface PlanRow {
  readonly key: string;
  readonly at: Date;
  readonly title: string;
  readonly note: string;
  readonly side: string;
}

/**
 * The rows under the disclosure — every rung, the escalation, and (LAN-508,
 * W1-03) each event message, in time order. A row at the same moment as
 * another keeps its place after it.
 */
function PlanRows({
  display,
  audienceSize,
  everyoneSize,
}: {
  display: DisplayPlan;
  audienceSize: number;
  /** Everybody invited, recruits included: who an event message to everyone reaches. */
  everyoneSize: number;
}) {
  const rows: PlanRow[] = [
    ...describeRungs(display.rungs, audienceSize).map((row) => ({
      key: `rung-${row.rung.rung}`,
      at: row.rung.at,
      title: row.title,
      note: row.note,
      side: row.side,
    })),
    ...(display.escalationAt
      ? [
          {
            key: "escalation",
            at: display.escalationAt,
            title: "Follow-up escalation",
            note: "Send the event and unanswered count to the President.",
            side: "President",
          },
        ]
      : []),
    ...display.eventMessages.map((message, index) => ({
      key: `event-message-${index}`,
      at: message.at,
      title: "Event message",
      note: message.detail,
      side:
        message.recipients === "yes"
          ? "Said Yes"
          : `${everyoneSize} ${everyoneSize === 1 ? "person" : "people"}`,
    })),
  ]
    .map((row, order) => ({ row, order }))
    .sort((a, b) => a.row.at.getTime() - b.row.at.getTime() || a.order - b.order)
    .map(({ row }) => row);

  return (
    <Stack
      component="ol"
      spacing={0}
      sx={{ listStyle: "none", p: 0, m: 0 }}
      data-testid="plan-rows"
    >
      {rows.map((row, index) => (
        <Box
          component="li"
          key={row.key}
          data-testid="plan-row"
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 1fr) auto" },
            gap: 1,
            py: 1.25,
            ...(index < rows.length - 1 ? { borderBottom: 1, borderColor: "divider" } : {}),
            alignItems: "start",
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary">
              {formatPlanWhen(row.at)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {row.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {row.note}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {row.side}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

/**
 * REQ-approval-shows-both-ladders. Recruit rows: never an escalation
 * (REQ-two-ladders) and never "still unanswered" (REQ-never-harsh).
 */
function RecruitPlanRows({
  recruit,
  recruitAudienceSize,
}: {
  recruit: DisplayRecruitPlan;
  recruitAudienceSize: number;
}) {
  const people = `${recruitAudienceSize} ${recruitAudienceSize === 1 ? "recruit" : "recruits"}`;

  return (
    <Stack
      component="ol"
      spacing={0}
      sx={{ listStyle: "none", p: 0, m: 0 }}
      data-testid="recruit-plan-rows"
    >
      {recruit.rungs.map((rung) => (
        <Box
          component="li"
          key={rung.rung}
          data-testid="plan-row"
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 1fr) auto" },
            gap: 1,
            py: 1.25,
            borderBottom: 1,
            borderColor: "divider",
            alignItems: "start",
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary">
              {formatPlanWhen(rung.at)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {rung.kind === "invitation" ? "WhatsApp message 1" : "WhatsApp message 2"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {rung.kind === "invitation"
                ? `Automated 1:1 message to all ${people}.`
                : "The one follow-up. Only to recruits who have not answered, then silence."}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {rung.kind === "invitation" ? people : "Unanswered"}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

/** The expandable disclosure itself — open by default, per the approved mockup. */
export function MessagingPlanDisclosure({
  display,
  audienceSize,
  recruitAudienceSize,
  approved,
}: {
  display: DisplayPlan;
  /** Non-recruit audience when `display.recruit` present; otherwise the whole confirmed audience (pre-LAN-203 behaviour unchanged). */
  audienceSize: number;
  /** The recruit audience size. Required exactly when `display.recruit` is not null. */
  recruitAudienceSize?: number;
  approved: boolean;
}) {
  const steps =
    display.rungs.length +
    (display.escalationAt ? 1 : 0) +
    (display.recruit?.rungs.length ?? 0) +
    display.eventMessages.length;

  return (
    <Section
      title={`${MESSAGING_PLAN_HEADLINE} · ${describePlanStepCount(steps)}${approved ? " · approved" : ""}`}
      collapsible
      defaultOpen={!approved}
      testId="messaging-plan-disclosure"
    >
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {`${approved ? PLAN_FROZEN_AT_APPROVAL : PLAN_COMMITS_ON_APPROVAL} ${PLAN_LIGHTS_OUT}`}
        </Typography>
        {display.lateApproval ? (
          <Notice severity="warning" testId="plan-late-approval">
            {PLAN_LATE_APPROVAL}
          </Notice>
        ) : display.dispatchesImmediately ? (
          <Notice severity="info" testId="plan-dispatches-immediately">
            {PLAN_DISPATCHES_IMMEDIATELY}
          </Notice>
        ) : null}
        {/* REQ-approval-shows-both-ladders: heading pair appears only once there is a second ladder. */}
        {display.recruit ? (
          <Typography
            variant="overline"
            color="text.secondary"
            component="p"
            sx={{ mb: -1 }}
            data-testid="plan-audience-heading"
          >
            Regular players
          </Typography>
        ) : null}
        <PlanRows
          display={display}
          audienceSize={audienceSize}
          everyoneSize={audienceSize + (recruitAudienceSize ?? 0)}
        />
        {display.recruit ? (
          <>
            {display.recruit.dispatchesImmediately && !display.lateApproval ? (
              <Notice severity="info" testId="plan-recruit-dispatches-immediately">
                The recruit invitation goes out now — the event is closer than the Recruits
                group&apos;s own lead.
              </Notice>
            ) : null}
            <Typography
              variant="overline"
              color="text.secondary"
              component="p"
              sx={{ mb: -1 }}
              data-testid="plan-audience-heading"
            >
              Recruits
            </Typography>
            <RecruitPlanRows
              recruit={display.recruit}
              recruitAudienceSize={recruitAudienceSize ?? 0}
            />
          </>
        ) : null}
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Recovery
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {PLAN_RECOVERY_NOTE}
          </Typography>
        </Box>
      </Stack>
    </Section>
  );
}

/**
 * "1 user has an error." — W1's pre-approval WhatsApp check, D8. Count
 * first, name only on request (`docs/ux/standards.md` refusal rules). No
 * manual-send control here — W6 owns recovery. LAN-423: `unreachable` is
 * empty for a seat without Contact & emergency, which sees the count alone.
 */
export function WhatsAppErrorsAlert({
  count,
  unreachable,
}: {
  count: number;
  unreachable: readonly UnreachableAudienceMember[];
}) {
  if (count === 0) return null;

  return (
    <Stack spacing={1} data-testid="whatsapp-errors">
      <Notice severity="error">{describeWhatsAppErrorCount(count)}</Notice>
      {unreachable.length === 0 ? null : <WhatsAppErrorNames unreachable={unreachable} />}
    </Stack>
  );
}

function WhatsAppErrorNames({
  unreachable,
}: {
  unreachable: readonly UnreachableAudienceMember[];
}) {
  return (
    <Section title={whatsAppErrorDisclosureLabel(unreachable.length)} collapsible>
      <Stack component="ul" spacing={0} sx={{ listStyle: "none", p: 0, m: 0 }}>
        {unreachable.map(({ member }) => (
          <Box
            component="li"
            key={member.id}
            data-testid="whatsapp-error-row"
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 1,
              py: 1,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {member.displayName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {WHATSAPP_ERROR_DETAIL}
              </Typography>
            </Box>
            <Typography variant="caption" color="error.main">
              Error
            </Typography>
          </Box>
        ))}
      </Stack>
    </Section>
  );
}
