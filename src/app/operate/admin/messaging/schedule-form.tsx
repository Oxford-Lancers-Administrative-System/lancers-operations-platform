"use client";

import { useActionState, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { RecruitmentCycleStep } from "@/lib/services/recruitment-cycle";
import { EMPTY_ADMIN_ACTION_STATE } from "../action-state";
import AdminOutcome from "../outcome";
import { updateOneMessagingScheduleAction, updateRecruitmentCycleStepsAction } from "./actions";
import { CYCLE_STEP_FIELDS, CYCLE_STEP_LABELS } from "./cycle-validation";
import {
  CYCLE_STEP_ENABLED_LABEL,
  CYCLE_STEP_TIMING_UNIT,
  EVENT_MESSAGING_SECTION_HEADING,
  EVENT_MESSAGING_SECTION_INTRO,
  HIDE_EXAMPLE,
  MESSAGING_SCHEDULE_FOOTER,
  MESSAGING_SCHEDULE_RULE_DETAIL,
  MESSAGING_SCHEDULE_RULE_HEADLINE,
  ONBOARDING_SECTION_HEADING,
  ONBOARDING_SECTION_NOTE,
  RECRUITMENT_SECTION_HEADING,
  RECRUITMENT_SECTION_INTRO,
  RECRUITS_GROUP_HEADING,
  REGULAR_PLAYERS_GROUP_HEADING,
  saveRowButtonLabel,
  SHOW_EXAMPLE,
  type SchedulePreview,
} from "./presentation";
import { RECRUIT_SCHEDULE_FIELDS, SCHEDULE_FIELDS, type FieldBoundsShape } from "./validation";

/** One event type's row: its current values and its already-resolved preview. */
export interface ScheduleRowData {
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
 * The two field groups Brian's own round-2 mockup draws for one row:
 *
 * ```
 *   RSVP by      First inv.   Cadence
 *   [ 2 ] days   [ 5 ] days   [ 24 ] h
 *
 *   WhatsApp     Email        President
 *   [ 2 ]        [ 1 ]        [ 12 ] h
 * ```
 *
 * `SCHEDULE_FIELDS` is already declared in exactly this order, so the groups
 * are a slice rather than a second list that could drift from it.
 */
const TIMING_FIELDS: readonly FieldBoundsShape[] = SCHEDULE_FIELDS.slice(0, 3);
const LADDER_FIELDS: readonly FieldBoundsShape[] = SCHEDULE_FIELDS.slice(3, 6);

/**
 * The whole editable schedule — three sections (W10, Brian 2026-08-31):
 * **Recruitment**, the cycle that fires on capture; **Event messaging**, the
 * seven event types this page has always carried, with the Recruitment
 * row's own body now split into its two audiences
 * (`DEC-split-on-the-schedule`); and **Onboarding**, a heading with nothing
 * built behind it yet, so the page already has the shape Mission 7 needs.
 *
 * Recruitment sits first — "what fires when somebody is captured" is a
 * different question from "what an event sends", and it is the question W10
 * puts first. The QR code is deliberately not here at all: it lives on the
 * recruit board (W1) and its own page (W1-04) — "This workflow is the cycle
 * and nothing else."
 */
export default function MessagingScheduleForm({
  rows,
  cycleSteps,
}: {
  rows: readonly ScheduleRowData[];
  cycleSteps: readonly RecruitmentCycleStep[];
}) {
  const stepsByName = new Map(cycleSteps.map((step) => [step.step, step]));
  const welcome = stepsByName.get("welcome");
  const detailsReminder = stepsByName.get("details_reminder");
  const interestAsk = stepsByName.get("interest_ask");
  const interestReminder = stepsByName.get("interest_reminder");

  return (
    <Stack spacing={5}>
      <Stack spacing={1.5} data-testid="recruitment-cycle-section">
        <SectionHeading title={RECRUITMENT_SECTION_HEADING} note={RECRUITMENT_SECTION_INTRO} />
        {welcome ? (
          <CycleStepRow
            steps={[welcome]}
            rowLabel={CYCLE_STEP_LABELS.welcome}
            saveLabel="SAVE WELCOME"
          />
        ) : null}
        {detailsReminder ? (
          <CycleStepRow
            steps={[detailsReminder]}
            rowLabel={CYCLE_STEP_LABELS.details_reminder}
            saveLabel="SAVE DETAILS REMINDER"
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

      <Stack spacing={1.5} data-testid="event-messaging-section">
        <SectionHeading
          title={EVENT_MESSAGING_SECTION_HEADING}
          note={EVENT_MESSAGING_SECTION_INTRO}
        />

        <Alert severity="info" data-testid="schedule-rule">
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {MESSAGING_SCHEDULE_RULE_HEADLINE}
          </Typography>
          <Typography variant="body2">{MESSAGING_SCHEDULE_RULE_DETAIL}</Typography>
        </Alert>

        <Stack spacing={1.5}>
          {rows.map((row) =>
            row.eventType === "recruitment" ? (
              <RecruitmentScheduleRow key={row.eventType} row={row} />
            ) : (
              <ScheduleRow key={row.eventType} row={row} />
            ),
          )}
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {MESSAGING_SCHEDULE_FOOTER}
        </Typography>
      </Stack>

      <Stack spacing={1} data-testid="onboarding-section">
        <SectionHeading title={ONBOARDING_SECTION_HEADING} note={null} />
        <Typography variant="body2" color="text.secondary">
          {ONBOARDING_SECTION_NOTE}
        </Typography>
      </Stack>
    </Stack>
  );
}

/** A section's own heading, in the page's type — the same cloned-`h1` shape the mockup draws. */
function SectionHeading({ title, note }: { title: string; note: string | null }) {
  return (
    <Box>
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700, fontSize: 19 }}>
        {title}
      </Typography>
      {note ? (
        <Typography variant="body2" color="text.secondary">
          {note}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * One recruitment cycle row — one, or two, `recruitment_cycle_steps` rows,
 * one form, one SAVE. `steps.length === 2` exactly for "Recruitment
 * questionnaire", which covers the ask and its own reminder.
 *
 * Not the shipped `schedule-row-toggle` — that name belongs to the "Show an
 * example" disclosure, unrelated to this switch. W10's own gap: the shipped
 * page has no precedent for "whether a step runs at all," so this control is
 * this package's own, drawn once here.
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

  return (
    <Paper
      component="form"
      action={formAction}
      variant="outlined"
      sx={{ p: 2 }}
      data-testid="cycle-step-row"
    >
      <input type="hidden" name="steps" value={steps.map((step) => step.step).join(",")} />

      <Typography variant="subtitle2" sx={{ fontWeight: 700 }} data-testid="cycle-step-row-label">
        {rowLabel}
      </Typography>

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
                <FormControlLabel
                  control={
                    <Switch name={`step_${step.step}_enabled`} defaultChecked={step.enabled} />
                  }
                  label={steps.length > 1 ? CYCLE_STEP_LABELS[step.step] : CYCLE_STEP_ENABLED_LABEL}
                  sx={{ whiteSpace: "nowrap" }}
                />
                <TextField
                  name={`step_${step.step}_offsetHours`}
                  id={`${step.step}.offsetHours`}
                  label={bound.label}
                  type="number"
                  size="small"
                  defaultValue={step.offsetHours}
                  sx={{ width: 180 }}
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

        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
            {saveLabel}
          </Button>
        </Stack>

        <AdminOutcome state={state} />
      </Stack>
    </Paper>
  );
}

/** One field: its label, its narrow input, and its unit — the event page's own field idiom. */
function ScheduleField({
  eventType,
  field,
  defaultValue,
}: {
  eventType: string;
  field: FieldBoundsShape;
  defaultValue: number;
}) {
  return (
    <Box data-field={field.key} sx={{ minWidth: 0 }}>
      <TextField
        name={field.key}
        id={`${eventType}.${field.key}`}
        label={field.label}
        type="number"
        size="small"
        defaultValue={defaultValue}
        helperText={field.helperText}
        fullWidth
        slotProps={{
          htmlInput: { min: field.min, max: field.max, step: 1 },
          input: field.unit
            ? { endAdornment: <InputAdornment position="end">{field.unit}</InputAdornment> }
            : undefined,
        }}
      />
    </Box>
  );
}

/**
 * One event type — its own form, its six editable fields, and its own save.
 *
 * The worked example always starts closed (OWNER-LAN171-09) — there is no
 * `defaultOpen` prop to override that, on any row.
 */
function ScheduleRow({ row }: { row: ScheduleRowData }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateOneMessagingScheduleAction,
    EMPTY_ADMIN_ACTION_STATE,
  );

  return (
    <Paper
      component="form"
      action={formAction}
      variant="outlined"
      sx={{ p: 2 }}
      data-testid="schedule-row"
    >
      <input type="hidden" name="eventType" value={row.eventType} />

      {/*
        Q-23: the row heading is a style question, not structure — the
        mockup's own rendering does not govern it, the shipped application
        does. `../roles/page.tsx` and `../operators/page.tsx` both draw
        their per-card entity-name heading as `subtitle2`/700, not the
        all-caps `overline` this card carried before that check (chosen on
        the strength of the dispatch's own capitalised ASCII art) nor the
        `subtitle1` a first pass at fixing it picked by eye from a mockup
        screenshot rather than the real component.
      */}
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }} data-testid="schedule-row-label">
        {row.label}
      </Typography>

      <Stack spacing={2} sx={{ mt: 0.5 }}>
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
          }}
        >
          {TIMING_FIELDS.map((field) => (
            <ScheduleField
              key={field.key}
              eventType={row.eventType}
              field={field}
              defaultValue={row.values[field.key]}
            />
          ))}
        </Box>

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
          }}
        >
          {LADDER_FIELDS.map((field) => (
            <ScheduleField
              key={field.key}
              eventType={row.eventType}
              field={field}
              defaultValue={row.values[field.key]}
            />
          ))}
        </Box>

        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
            {saveRowButtonLabel(row.label)}
          </Button>
        </Stack>

        <AdminOutcome state={state} />

        <Box>
          <Button
            variant="text"
            size="small"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            sx={{ textTransform: "none", px: 0, minHeight: 36 }}
            data-testid="schedule-row-toggle"
          >
            {open ? HIDE_EXAMPLE : SHOW_EXAMPLE}
          </Button>
        </Box>

        <Collapse in={open} unmountOnExit mountOnEnter>
          <Box data-testid="schedule-row-preview">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {`Example — ${row.preview.introDetail}`}
            </Typography>
            <Stack component="ol" spacing={0.75} sx={{ listStyle: "none", p: 0, m: 0 }}>
              {row.preview.steps.map((step) => (
                <Box component="li" key={step.label}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {step.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {step.note ? `${step.when} · ${step.note}` : step.when}
                  </Typography>
                </Box>
              ))}
            </Stack>
            {/*
              OWNER-LAN171-07, round 3: the gap-before-the-deadline callout is
              deliberately not rendered here. Brian: "get rid of this
              callout. The last reminder lands 1 day before the deadline it
              is chasing. Nobody is contacted in the 1 day that actually
              matter. I don't know why that's there. That's confusing." Under
              the corrected ladder arithmetic (Q-19) it fires on the shipped
              defaults, so a warning that should flag a misconfigured
              schedule instead fires on the normal case and trains an
              operator to ignore it. `row.preview.warning` itself is still
              computed by `buildSchedulePreview` and still proved by
              `presentation.test.ts` and R3-B1 in
              `messaging-schedule.test.ts` — only this surface stopped
              drawing it.
            */}
          </Box>
        </Collapse>
      </Stack>
    </Paper>
  );
}

/**
 * The Recruitment event row, split into its two audiences —
 * `DEC-split-on-the-schedule`, LAN-203. The row keeps its identity: one row
 * per `event_type`, one SAVE per row, both laws of this page — the six
 * fields above stay Regular players' own, unchanged, and the two Recruits
 * fields are appended into the same form and the same submit.
 *
 * Brian, 2026-08-31: "on the recruit event, instead, you're going to have
 * two sections: one for regular players, one for recruits." No President
 * field for Recruits — there is no escalation to configure, because
 * recruits are never escalated (`REQ-two-ladders`, `REQ-never-harsh`).
 */
function RecruitmentScheduleRow({ row }: { row: ScheduleRowData }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateOneMessagingScheduleAction,
    EMPTY_ADMIN_ACTION_STATE,
  );

  return (
    <Paper
      component="form"
      action={formAction}
      variant="outlined"
      sx={{ p: 2 }}
      data-testid="schedule-row"
    >
      <input type="hidden" name="eventType" value={row.eventType} />

      <Typography variant="subtitle2" sx={{ fontWeight: 700 }} data-testid="schedule-row-label">
        {row.label}
      </Typography>

      <Stack spacing={2} sx={{ mt: 0.5 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: "text.secondary" }}
          data-testid="audience-group-heading"
        >
          {REGULAR_PLAYERS_GROUP_HEADING}
        </Typography>

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
          }}
        >
          {TIMING_FIELDS.map((field) => (
            <ScheduleField
              key={field.key}
              eventType={row.eventType}
              field={field}
              defaultValue={row.values[field.key]}
            />
          ))}
        </Box>

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
          }}
        >
          {LADDER_FIELDS.map((field) => (
            <ScheduleField
              key={field.key}
              eventType={row.eventType}
              field={field}
              defaultValue={row.values[field.key]}
            />
          ))}
        </Box>

        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: "text.secondary" }}
          data-testid="audience-group-heading"
        >
          {RECRUITS_GROUP_HEADING}
        </Typography>

        <Box
          sx={{
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          {RECRUIT_SCHEDULE_FIELDS.map((field) => (
            <Box key={field.key} sx={{ minWidth: 200, flex: "0 1 240px" }}>
              <ScheduleField
                eventType={row.eventType}
                field={field}
                defaultValue={row.recruitValues?.[field.key] ?? 0}
              />
            </Box>
          ))}
        </Box>

        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
            {saveRowButtonLabel(row.label)}
          </Button>
        </Stack>

        <AdminOutcome state={state} />

        <Box>
          <Button
            variant="text"
            size="small"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            sx={{ textTransform: "none", px: 0, minHeight: 36 }}
            data-testid="schedule-row-toggle"
          >
            {open ? HIDE_EXAMPLE : SHOW_EXAMPLE}
          </Button>
        </Box>

        <Collapse in={open} unmountOnExit mountOnEnter>
          <Box data-testid="schedule-row-preview">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {`Example — ${row.preview.introDetail}`}
            </Typography>
            <Stack component="ol" spacing={0.75} sx={{ listStyle: "none", p: 0, m: 0 }}>
              {row.preview.steps.map((step) => (
                <Box component="li" key={step.label}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {step.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {step.note ? `${step.when} · ${step.note}` : step.when}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </Collapse>
      </Stack>
    </Paper>
  );
}
