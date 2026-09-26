import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { isServiceError } from "@/lib/db";
import { operatorHasCapability } from "@/lib/auth/guards";
import { templatesAtLeast } from "@/lib/auth/grants";
import { readMessagingSafetyStatus } from "@/lib/services/messaging-safety";
import { listMessagingSchedulesWithPreview } from "@/lib/services/messaging-schedule";
import { listRecruitmentCycleSteps } from "@/lib/services/recruitment-cycle";
import { readOnboardingChaseSettings } from "@/lib/services/onboarding-chase";
import { Notice } from "@/components/notice";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import AdminPageHeading from "../page-heading";
import MessagingScheduleForm, { type ScheduleRowData } from "./schedule-form";
import MessagingSafetySection from "./safety-section";
import { PAUSED_BANNER, PAUSED_BANNER_LINK } from "./safety-presentation";
import {
  buildSchedulePreview,
  MESSAGING_SCHEDULE_INTRO,
  MESSAGING_SCHEDULE_TITLE,
} from "./presentation";
import { RECRUIT_SCHEDULE_FIELDS, SCHEDULE_FIELDS } from "./validation";

/** **Messaging schedule** — Administration's third destination, W7's settings page. LAN-171. Editable per template, never per event. */
export default async function MessagingSchedulePage() {
  // LAN-431: Manage on any template opens the page, and it lists only the templates managed.
  const gate = await gateShellPage("/operate/admin/messaging", {
    anyOf: "template",
    minimum: "manage",
  });
  if ("screen" in gate) return gate.screen;

  // The recruitment cycle, the onboarding chase and the safety section are not any template's:
  // they stay with `delivery_administration`, their existing capability.
  const mayAdministerDelivery = operatorHasCapability(gate.operator, "delivery_administration");
  const managed = new Set(templatesAtLeast(gate.operator.grants, "manage"));

  let rows: ScheduleRowData[];
  let cycleSteps: Awaited<ReturnType<typeof listRecruitmentCycleSteps>> | null;
  let onboardingChase: Awaited<ReturnType<typeof readOnboardingChaseSettings>> | null;
  let safety: Awaited<ReturnType<typeof readMessagingSafetyStatus>> | null;
  try {
    const [withPreview, steps, chase, safetyStatus] = await Promise.all([
      listMessagingSchedulesWithPreview(),
      mayAdministerDelivery ? listRecruitmentCycleSteps() : null,
      mayAdministerDelivery ? readOnboardingChaseSettings() : null,
      mayAdministerDelivery ? readMessagingSafetyStatus() : null,
    ]);
    cycleSteps = steps;
    onboardingChase = chase;
    safety = safetyStatus;
    rows = withPreview
      .filter(({ schedule }) => managed.has(schedule.templateId))
      .map(({ schedule, preview }) => {
        const values: Record<string, number> = {};
        for (const field of SCHEDULE_FIELDS) {
          values[field.key] = schedule[field.field];
        }
        // LAN-203, DEC-split-on-the-schedule: populated only for the Recruitment row.
        const recruitValues: Record<string, number> | null =
          schedule.eventType === "recruitment"
            ? Object.fromEntries(
                RECRUIT_SCHEDULE_FIELDS.map((field) => [field.key, schedule[field.field] ?? 0]),
              )
            : null;
        return {
          templateId: schedule.templateId,
          eventType: schedule.eventType,
          label: schedule.templateName,
          values,
          recruitValues,
          preview: buildSchedulePreview(preview, schedule),
        };
      });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title="Messaging schedule"
        message={error.message}
        testId="messaging-schedule-unavailable"
      />
    );
  }

  // LAN-394. Whether to *offer* the controls. Every action behind them guards
  // itself, and so does the service: this decides what is drawn, nothing more.
  const mayControl = operatorHasCapability(gate.operator, "messaging_safety_authority");
  const paused = safety !== null && (safety.pausedAt !== null || safety.emergencyStopped);

  return (
    <Stack spacing={3}>
      <AdminPageHeading title={MESSAGING_SCHEDULE_TITLE} subtitle={`${rows.length} templates`} />

      {/*
       * LAN-394. The controls live at the bottom, as decided, so a paused state
       * would otherwise be a scroll away on the one page that can end it. This
       * is a state and a link, at the top, and nothing else.
       */}
      {paused ? (
        <Notice severity="warning" testId="messaging-paused-banner">
          {PAUSED_BANNER}{" "}
          <Link href="/operate/admin/messaging#messaging-safety">{PAUSED_BANNER_LINK}</Link>
        </Notice>
      ) : null}

      <Typography variant="body2" color="text.secondary">
        {MESSAGING_SCHEDULE_INTRO}
      </Typography>

      <MessagingScheduleForm
        rows={rows}
        cycleSteps={cycleSteps}
        onboardingChase={onboardingChase}
      />

      {safety === null ? null : <MessagingSafetySection status={safety} mayControl={mayControl} />}
    </Stack>
  );
}
