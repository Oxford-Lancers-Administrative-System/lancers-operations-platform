import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { listMessagingSchedulesWithPreview } from "@/lib/services/messaging-schedule";
import { listRecruitmentCycleSteps } from "@/lib/services/recruitment-cycle";
import { readOnboardingChaseSettings } from "@/lib/services/onboarding-chase";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import AdminPageHeading from "../page-heading";
import MessagingScheduleForm, { type ScheduleRowData } from "./schedule-form";
import {
  buildSchedulePreview,
  MESSAGING_SCHEDULE_INTRO,
  MESSAGING_SCHEDULE_TITLE,
} from "./presentation";
import { RECRUIT_SCHEDULE_FIELDS, SCHEDULE_FIELDS } from "./validation";

/** **Messaging schedule** — Administration's third destination, W7's settings page. LAN-171. Editable per template, never per event. */
export default async function MessagingSchedulePage() {
  const gate = await gateShellPage("/operate/admin/messaging", "delivery_administration");
  if ("screen" in gate) return gate.screen;

  let rows: ScheduleRowData[];
  let cycleSteps: Awaited<ReturnType<typeof listRecruitmentCycleSteps>>;
  let onboardingChase: Awaited<ReturnType<typeof readOnboardingChaseSettings>>;
  try {
    const [withPreview, steps, chase] = await Promise.all([
      listMessagingSchedulesWithPreview(),
      listRecruitmentCycleSteps(),
      readOnboardingChaseSettings(),
    ]);
    cycleSteps = steps;
    onboardingChase = chase;
    rows = withPreview.map(({ schedule, preview }) => {
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

  return (
    <Stack spacing={3}>
      <AdminPageHeading title={MESSAGING_SCHEDULE_TITLE} subtitle={`${rows.length} templates`} />

      <Typography variant="body2" color="text.secondary">
        {MESSAGING_SCHEDULE_INTRO}
      </Typography>

      <MessagingScheduleForm
        rows={rows}
        cycleSteps={cycleSteps}
        onboardingChase={onboardingChase}
      />
    </Stack>
  );
}
