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

/**
 * **Messaging schedule** — Administration's third destination, and W7's
 * settings page. LAN-171.
 *
 * ADR 0021 said Release One would carry no configuration-administration
 * surface at all. `docs/adr/0036-messaging-schedule-configuration.md` records
 * why Brian reversed that on 2026-08-25, and this page is the reversal: the
 * club's messaging policy, per event type, editable here rather than known
 * only to whoever last touched `response-deadline.ts`.
 *
 * ## What survives from ADR 0021, unchanged
 *
 * Editable **per template, never per event** — there is no event picker
 * anywhere on this page, because `public.messaging_schedules` has no event
 * column to point one at. The table is complete over `public.event_templates`
 * with no default arm: a template's row is created with it and deleted with it
 * (LAN-265), so this page only ever updates a row and never creates or deletes
 * one. A template the club created a minute ago is already here, carrying
 * `DEFAULT_MESSAGING_SCHEDULE`, which is the half of the decision that makes
 * creating a template worth anything.
 *
 * ## The worked example is real arithmetic, not a second copy of it
 *
 * `listMessagingSchedulesWithPreview` resolves each row's example through
 * `resolveMessagingPlanIn` — the same function `event-approval.ts` calls at
 * approval — so the dates a reader expands here are the dates the scheduler
 * would actually produce, never a hand-written illustration that can drift
 * from the real rule.
 */
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
      // LAN-203, DEC-split-on-the-schedule. Populated only for the
      // Recruitment row — every other event type's two recruit columns are
      // `null`, and `RecruitmentScheduleRow` is the only reader of this.
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
