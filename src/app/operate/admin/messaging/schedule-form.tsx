"use client";

/**
 * The whole editable messaging schedule form — the recruitment cycle and
 * onboarding chase rows live here; the per-event-type rows split into
 * `schedule-row.tsx` (LAN-300) to keep this file under the line budget.
 */
import { useActionState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import { Section } from "@/components/section";
import { ActionBar } from "@/components/action-bar";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import Typography from "@mui/material/Typography";
import type { RecruitmentCycleStep } from "@/lib/services/recruitment-cycle";
import type { OnboardingChaseSettings } from "@/lib/services/onboarding-chase";
import { EMPTY_ADMIN_ACTION_STATE } from "../action-state";
import {
  Outcome as AdminOutcome,
  OutcomeSlotProvider,
  useOutcomeSlot,
} from "@/components/outcome-slot";
import { updateOnboardingChaseSettingsAction, updateRecruitmentCycleStepsAction } from "./actions";
import { CYCLE_STEP_FIELDS, CYCLE_STEP_LABELS } from "./cycle-validation";
import { ONBOARDING_CHASE_FIELDS } from "./onboarding-chase-validation";
import {
  CYCLE_STEP_TIMING_UNIT,
  EVENT_MESSAGING_SECTION_HEADING,
  MESSAGING_SCHEDULE_FOOTER,
  ONBOARDING_CHASE_ROW_LABEL,
  ONBOARDING_CHASE_SAVE_LABEL,
  ONBOARDING_SECTION_HEADING,
  RECRUITMENT_SECTION_HEADING,
  type SchedulePreview,
} from "./presentation";
import { RecruitmentScheduleRow, ScheduleRow } from "./schedule-row";
import { useResultClearedByEditing } from "./use-result-cleared-by-editing";

/** One event type's row: its current values and its already-resolved preview. */
export interface ScheduleRowData {
  /** LAN-265. The row the SAVE posts, and the key every control is named by. */
  readonly templateId: string;
  /** The behavioural class, which decides whether the recruit fields appear. */
  readonly eventType: string;
  readonly label: string;
  /** Keyed by `SCHEDULE_FIELDS[].key`. */
  readonly values: Readonly<Record<string, number>>;
  /**
   * LAN-203. Keyed by `RECRUIT_SCHEDULE_FIELDS[].key`, populated only for
   * the Recruitment row — every other event type's two recruit columns are
   * `null` in the database, and this is `null` to match.
   */
  readonly recruitValues: Readonly<Record<string, number>> | null;
  readonly preview: SchedulePreview;
}

/**
 * The whole editable schedule, in three sections in this order: Recruitment
 * (the cycle that fires on capture), Onboarding (the two person-lifecycle
 * chases), then Event messaging (one row per event type, the Recruitment row
 * split into its two audiences). No QR code here — it lives on the recruit
 * board and its own page.
 *
 * Decision history: docs/ux/tickets/LAN-203-recruit-ladders-and-cycle.md.
 */
export default function MessagingScheduleForm({
  rows,
  cycleSteps,
  onboardingChase,
}: {
  rows: readonly ScheduleRowData[];
  cycleSteps: readonly RecruitmentCycleStep[];
  onboardingChase: OnboardingChaseSettings;
}) {
  const stepsByName = new Map(cycleSteps.map((step) => [step.step, step]));
  const welcome = stepsByName.get("welcome");
  const detailsReminder = stepsByName.get("details_reminder");
  const interestAsk = stepsByName.get("interest_ask");
  const interestReminder = stepsByName.get("interest_reminder");

  return (
    <OutcomeSlotProvider>
      <Stack spacing={5}>
        <Stack spacing={1.5} data-testid="recruitment-cycle-section">
          <Typography variant="h2" component="h2">
            {RECRUITMENT_SECTION_HEADING}
          </Typography>
          {welcome && detailsReminder ? (
            <CycleStepRow
              steps={[welcome, detailsReminder]}
              rowLabel={CYCLE_STEP_LABELS.welcome}
              saveLabel="SAVE WELCOME"
            />
          ) : null}
          {interestAsk && interestReminder ? (
            <CycleStepRow
              steps={[interestAsk, interestReminder]}
              rowLabel={CYCLE_STEP_LABELS.interest_ask}
              saveLabel="SAVE RECRUITMENT QUESTIONNAIRE"
            />
          ) : null}
        </Stack>

        {/* LAN-218, W11. Directly below Recruitment and above Event messaging
          — Brian's own placement, and the reason `W11-01` was reshot: the
          two person-lifecycle chases sit together, then the events. */}
        <Stack spacing={1.5} data-testid="onboarding-section">
          <Typography variant="h2" component="h2">
            {ONBOARDING_SECTION_HEADING}
          </Typography>
          <OnboardingChaseRow settings={onboardingChase} />
        </Stack>

        <Stack spacing={1.5} data-testid="event-messaging-section">
          <Typography variant="h2" component="h2">
            {EVENT_MESSAGING_SECTION_HEADING}
          </Typography>

          <Stack spacing={1.5}>
            {rows.map((row) =>
              row.eventType === "recruitment" ? (
                <RecruitmentScheduleRow key={row.templateId} row={row} />
              ) : (
                <ScheduleRow key={row.templateId} row={row} />
              ),
            )}
          </Stack>

          <Typography variant="body2" color="text.secondary">
            {MESSAGING_SCHEDULE_FOOTER}
          </Typography>
        </Stack>
      </Stack>
    </OutcomeSlotProvider>
  );
}

/**
 * One recruitment cycle row — always two `recruitment_cycle_steps` rows, one
 * form, one SAVE: Welcome covers `welcome` and its own `details_reminder`;
 * Recruitment questionnaire covers `interest_ask` and its own
 * `interest_reminder`. Two offset fields, two rows, one save — never two
 * cards, never two saves. No per-step on/off control: `enabled` still exists
 * on the row (no migration), this page just never draws or submits it.
 *
 * Decision history: docs/ux/tickets/LAN-203-recruit-ladders-and-cycle.md.
 */
function CycleStepRow({
  steps,
  rowLabel,
  saveLabel,
}: {
  steps: readonly RecruitmentCycleStep[];
  rowLabel: string;
  saveLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateRecruitmentCycleStepsAction,
    EMPTY_ADMIN_ACTION_STATE,
  );

  const slot = useOutcomeSlot(`cycle-${steps.map((step) => step.step).join("-")}`);
  const edited = useResultClearedByEditing(state);

  return (
    <Box
      component="form"
      action={formAction}
      onSubmit={slot.claim}
      onChange={edited.onChange}
      data-testid="cycle-step-row"
    >
      <Section headingLevel={3} title={rowLabel} titleTestId="cycle-step-row-label">
        <input type="hidden" name="steps" value={steps.map((step) => step.step).join(",")} />

        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "flex-end" }}>
            {steps.map((step) => {
              const bound = CYCLE_STEP_FIELDS.find((field) => field.step === step.step);
              if (!bound) return null;
              return (
                <Stack
                  key={step.step}
                  direction="row"
                  spacing={1.5}
                  sx={{ alignItems: "center" }}
                  data-field={step.step}
                >
                  <Field
                    name={`step_${step.step}_offsetHours`}
                    id={`${step.step}.offsetHours`}
                    label={bound.label}
                    type="number"
                    defaultValue={step.offsetHours}
                    sx={{ width: 220 }}
                    slotProps={{
                      htmlInput: { min: bound.min, max: bound.max, step: 1 },
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">{CYCLE_STEP_TIMING_UNIT}</InputAdornment>
                        ),
                      },
                    }}
                  />
                </Stack>
              );
            })}
          </Box>

          <ActionBar
            sticky={false}
            primary={
              <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
                {saveLabel}
              </Button>
            }
          />

          <AdminOutcome state={state} showing={slot.showing && edited.showing} />
        </Stack>
      </Section>
    </Box>
  );
}

/**
 * The Onboarding section's one row: one form, three narrow fields and one
 * SAVE — how many times, how often, and the first delay, and nothing else.
 * No give-up value, no quiet hours, no per-item owner, no escalation-office
 * field: `OD7-cadence-is-the-config`'s own boundary, nothing here draws them.
 *
 * Decision history: docs/ux/tickets/LAN-218-chase-and-queue.md.
 */
function OnboardingChaseRow({ settings }: { settings: OnboardingChaseSettings }) {
  const [state, formAction, pending] = useActionState(
    updateOnboardingChaseSettingsAction,
    EMPTY_ADMIN_ACTION_STATE,
  );

  const slot = useOutcomeSlot("onboarding");
  const edited = useResultClearedByEditing(state);

  return (
    <Box
      component="form"
      action={formAction}
      onSubmit={slot.claim}
      onChange={edited.onChange}
      data-testid="onboarding-chase-row"
    >
      <Section
        headingLevel={3}
        title={ONBOARDING_CHASE_ROW_LABEL}
        titleTestId="onboarding-chase-row-label"
      >
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "flex-end" }}>
            {ONBOARDING_CHASE_FIELDS.map((field) => (
              <Box key={field.key} data-field={field.key} sx={{ minWidth: 0 }}>
                <Field
                  name={field.key}
                  id={`onboarding.${field.key}`}
                  label={field.label}
                  type="number"
                  defaultValue={settings[field.key]}
                  sx={{ width: 220 }}
                  slotProps={{
                    htmlInput: { min: field.min, max: field.max, step: 1 },
                    input: field.unit
                      ? {
                          endAdornment: (
                            <InputAdornment position="end">{field.unit}</InputAdornment>
                          ),
                        }
                      : undefined,
                  }}
                />
              </Box>
            ))}
          </Box>

          <ActionBar
            sticky={false}
            primary={
              <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
                {ONBOARDING_CHASE_SAVE_LABEL}
              </Button>
            }
          />

          <AdminOutcome state={state} showing={slot.showing && edited.showing} />
        </Stack>
      </Section>
    </Box>
  );
}
