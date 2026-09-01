import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
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
  PLAN_NO_QUIET_HOURS,
  PLAN_RECOVERY_NOTE,
  WHATSAPP_ERROR_DETAIL,
  whatsAppErrorDisclosureLabel,
} from "../presentation";
import type { UnreachableAudienceMember } from "@/lib/services/event-approval";

/**
 * The messaging plan disclosure — W1, LAN-171.
 *
 * The event page's own account of what a plan looks like, in the club's
 * language rather than in job records: which rung happens when, on which
 * channel, and for whom. Reading this creates nothing and sends nothing — it
 * is a projection, exactly as `messaging-schedule.ts` documents, and both
 * shapes it accepts below are values already resolved by that module.
 *
 * ## Two callers, one renderer
 *
 * Before approval the page has a live {@link MessagingPlan} — recomputed
 * against "now" on every read, so an approver reading it twice an hour apart
 * may see the invitation move. After approval the plan is frozen in
 * `event_messaging_plans`, which stores the counts and the anchor but not each
 * rung's own instant — so {@link buildLadder} replays the same arithmetic
 * `scheduleEventLadderIn` used to create the real jobs, against the frozen
 * values, rather than a second copy of it living here.
 *
 * `toDisplayPlan` is the seam: both shapes normalise to the handful of fields
 * this component actually draws, and the component itself never learns which
 * caller it came from.
 */
/**
 * REQ-approval-shows-both-ladders. `null` on every event but Recruitment's
 * own — see {@link RecruitMessagingLadder}. One invitation and at most one
 * follow-up, never an escalation: the rungs are built directly here rather
 * than through {@link buildLadder}, which exists for the player ladder's
 * WhatsApp/email split and rung-count arithmetic, neither of which the
 * recruit ladder has.
 */
interface DisplayRecruitPlan {
  readonly rungs: readonly LadderRung[];
  readonly dispatchesImmediately: boolean;
}

interface DisplayPlan {
  readonly rungs: readonly LadderRung[];
  readonly escalationAt: Date | null;
  readonly dispatchesImmediately: boolean;
  readonly lateApproval: boolean;
  readonly recruit: DisplayRecruitPlan | null;
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

export function planForDisplay(plan: MessagingPlan): DisplayPlan {
  return {
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

export function frozenPlanForDisplay(frozen: FrozenMessagingPlan): DisplayPlan {
  const scheduled = frozen.whatsappRemindersScheduled + frozen.emailRemindersScheduled;
  return {
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

/**
 * Every rung, described in order — a plain pass over the array rather than a
 * mutation performed inside the JSX that renders it, so the description is
 * computed once, as data, before anything is drawn.
 */
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

    // The first reminder after the invitation reads "have not answered";
    // every one after that reads "still have not answered" — the escalating
    // wording W1's approved mockup uses once a chase is under way.
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

/** The rows under the disclosure — every rung, then the escalation. */
function PlanRows({ display, audienceSize }: { display: DisplayPlan; audienceSize: number }) {
  const described = describeRungs(display.rungs, audienceSize);

  return (
    <Stack
      component="ol"
      spacing={0}
      sx={{ listStyle: "none", p: 0, m: 0 }}
      data-testid="plan-rows"
    >
      {described.map((row) => (
        <Box
          component="li"
          key={row.rung.rung}
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
              {formatPlanWhen(row.rung.at)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {row.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {row.note}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={row.side}
            sx={{ justifySelf: { xs: "flex-start", sm: "flex-end" } }}
          />
        </Box>
      ))}
      {display.escalationAt ? (
        <Box
          component="li"
          data-testid="plan-row"
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 1fr) auto" },
            gap: 1,
            py: 1.25,
            alignItems: "start",
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary">
              {formatPlanWhen(display.escalationAt)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Follow-up escalation
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Send the event and unanswered count to the President.
            </Typography>
          </Box>
          <Chip
            size="small"
            color="warning"
            label="President"
            sx={{ justifySelf: { xs: "flex-start", sm: "flex-end" } }}
          />
        </Box>
      ) : null}
    </Stack>
  );
}

/**
 * REQ-approval-shows-both-ladders. The recruit ladder's own rows — never an
 * escalation row (recruits are never escalated, `REQ-two-ladders`), and
 * never a "still unanswered" second wording, because there is never a second
 * reminder to distinguish it from (`REQ-never-harsh`).
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
          <Chip
            size="small"
            label={rung.kind === "invitation" ? people : "Unanswered"}
            sx={{ justifySelf: { xs: "flex-start", sm: "flex-end" } }}
          />
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
  /**
   * When `display.recruit` is present, this is the non-recruit audience —
   * everyone the player ladder above actually reaches (players, coaches and
   * committee alike; recruits are never part of it). Otherwise the whole
   * confirmed audience, unchanged from before LAN-203.
   */
  audienceSize: number;
  /** The recruit audience size. Required exactly when `display.recruit` is not null. */
  recruitAudienceSize?: number;
  approved: boolean;
}) {
  const steps =
    display.rungs.length + (display.escalationAt ? 1 : 0) + (display.recruit?.rungs.length ?? 0);

  return (
    <Accordion
      // Open by default before approval — the approver is reading this to
      // decide whether to press Approve, exactly as the reviewed mockup
      // shows it. Once approved it is a settled fact rather than a decision
      // in progress, so the page defaults it closed and lets a reader who
      // wants it open it, the same restraint the rest of the event page
      // already shows a settled record.
      defaultExpanded={!approved}
      disableGutters
      elevation={0}
      data-testid="messaging-plan-disclosure"
      sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" } }}
    >
      <AccordionSummary aria-controls="messaging-plan-content" id="messaging-plan-header">
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
          {`${MESSAGING_PLAN_HEADLINE} · ${describePlanStepCount(steps)}${approved ? " · approved" : ""}`}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {`${approved ? PLAN_FROZEN_AT_APPROVAL : PLAN_COMMITS_ON_APPROVAL} ${PLAN_NO_QUIET_HOURS}`}
          </Typography>
          {display.lateApproval ? (
            <Alert severity="warning" data-testid="plan-late-approval">
              {PLAN_LATE_APPROVAL}
            </Alert>
          ) : display.dispatchesImmediately ? (
            <Alert severity="info" data-testid="plan-dispatches-immediately">
              {PLAN_DISPATCHES_IMMEDIATELY}
            </Alert>
          ) : null}
          {/*
            REQ-approval-shows-both-ladders. Grouped by audience, exactly what
            approval will send to each — the "Regular players"/"Recruits"
            heading pair only appears once there is a second ladder to tell
            apart from the first; every event without a recruit ladder renders
            exactly as it always has, with no heading at all.
          */}
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
          <PlanRows display={display} audienceSize={audienceSize} />
          {display.recruit ? (
            <>
              {display.recruit.dispatchesImmediately && !display.lateApproval ? (
                <Alert severity="info" data-testid="plan-recruit-dispatches-immediately">
                  The recruit invitation goes out now — the event is closer than the Recruits
                  group&apos;s own lead.
                </Alert>
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
              <RecruitPlanRows recruit={display.recruit} recruitAudienceSize={recruitAudienceSize ?? 0} />
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
      </AccordionDetails>
    </Accordion>
  );
}

/**
 * "1 user has an error." — W1's concise pre-approval WhatsApp check, D8.
 *
 * A count first, a name only on request: `docs/ux/standards.md`'s refusal
 * rules read the same way here as everywhere else in the application. There is
 * no manual-send control beside it — W1 offers none, and W6 owns correction
 * and recovery.
 */
export function WhatsAppErrorsAlert({
  unreachable,
}: {
  unreachable: readonly UnreachableAudienceMember[];
}) {
  if (unreachable.length === 0) return null;

  return (
    <Stack spacing={1} data-testid="whatsapp-errors">
      <Alert severity="error">{describeWhatsAppErrorCount(unreachable.length)}</Alert>
      <Accordion
        disableGutters
        elevation={0}
        sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" } }}
      >
        <AccordionSummary aria-controls="whatsapp-errors-content" id="whatsapp-errors-header">
          <Typography variant="body2">
            {whatsAppErrorDisclosureLabel(unreachable.length)}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
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
                <Chip size="small" color="error" label="Error" />
              </Box>
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}
