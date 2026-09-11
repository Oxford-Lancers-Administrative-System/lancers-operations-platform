"use client";

/**
 * One event type's editable row, in its two shapes: the six-field regular
 * row, and the Recruitment row with its extra recruit-audience group. Split
 * from `schedule-form.tsx` (LAN-300).
 */
import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import InputAdornment from "@mui/material/InputAdornment";
import { Section } from "@/components/section";
import { ActionBar } from "@/components/action-bar";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import Typography from "@mui/material/Typography";
import { EMPTY_ADMIN_ACTION_STATE } from "../action-state";
import { Outcome as AdminOutcome, useOutcomeSlot } from "@/components/outcome-slot";
import { updateOneMessagingScheduleAction } from "./actions";
import {
  HIDE_EXAMPLE,
  REGULAR_PLAYERS_GROUP_HEADING,
  RECRUITS_GROUP_HEADING,
  saveRowButtonLabel,
  SHOW_EXAMPLE,
} from "./presentation";
import { RECRUIT_SCHEDULE_FIELDS, SCHEDULE_FIELDS, type FieldBoundsShape } from "./validation";
import type { ScheduleRowData } from "./schedule-form";
import { useResultClearedByEditing } from "./use-result-cleared-by-editing";

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

/** One field: its label, its narrow input, and its unit — the event page's own field idiom. */
function ScheduleField({
  fieldPrefix,
  field,
  defaultValue,
}: {
  /** The row's template id, which makes every control's `id` unique on the page. */
  fieldPrefix: string;
  field: FieldBoundsShape;
  defaultValue: number;
}) {
  return (
    <Box data-field={field.key} sx={{ minWidth: 0 }}>
      <Field
        name={field.key}
        id={`${fieldPrefix}.${field.key}`}
        label={field.label}
        type="number"
        defaultValue={defaultValue}
        helperText={field.helperText}
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
export function ScheduleRow({ row }: { row: ScheduleRowData }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateOneMessagingScheduleAction,
    EMPTY_ADMIN_ACTION_STATE,
  );

  const slot = useOutcomeSlot(`event-${row.templateId}`);
  const edited = useResultClearedByEditing(state);

  return (
    <Box
      component="form"
      action={formAction}
      onSubmit={slot.claim}
      onChange={edited.onChange}
      data-testid="schedule-row"
    >
      <Section headingLevel={3} title={row.label} titleTestId="schedule-row-label">
        <input type="hidden" name="templateId" value={row.templateId} />

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
                fieldPrefix={row.templateId}
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
                fieldPrefix={row.templateId}
                field={field}
                defaultValue={row.values[field.key]}
              />
            ))}
          </Box>

          <ActionBar
            sticky={false}
            primary={
              <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
                {saveRowButtonLabel(row.label)}
              </Button>
            }
          />

          <AdminOutcome state={state} showing={slot.showing && edited.showing} />

          <Box>
            <Button
              variant="text"
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
      </Section>
    </Box>
  );
}

/**
 * The Recruitment event row, split into its two audiences. The row keeps its
 * identity: one row per `event_type`, one SAVE per row — the six fields
 * above stay Regular players' own, unchanged, and the two Recruits fields
 * append into the same form and the same submit. No President field for
 * Recruits: recruits are never escalated (`REQ-two-ladders`, `REQ-never-harsh`).
 *
 * Decision history: docs/ux/tickets/LAN-203-recruit-ladders-and-cycle.md.
 */
export function RecruitmentScheduleRow({ row }: { row: ScheduleRowData }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateOneMessagingScheduleAction,
    EMPTY_ADMIN_ACTION_STATE,
  );

  const slot = useOutcomeSlot(`event-${row.templateId}`);
  const edited = useResultClearedByEditing(state);

  return (
    <Box
      component="form"
      action={formAction}
      onSubmit={slot.claim}
      onChange={edited.onChange}
      data-testid="schedule-row"
    >
      <Section headingLevel={3} title={row.label} titleTestId="schedule-row-label">
        <input type="hidden" name="templateId" value={row.templateId} />

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
                fieldPrefix={row.templateId}
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
                fieldPrefix={row.templateId}
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
                  fieldPrefix={row.templateId}
                  field={field}
                  defaultValue={row.recruitValues?.[field.key] ?? 0}
                />
              </Box>
            ))}
          </Box>

          <ActionBar
            sticky={false}
            primary={
              <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
                {saveRowButtonLabel(row.label)}
              </Button>
            }
          />

          <AdminOutcome state={state} showing={slot.showing && edited.showing} />

          <Box>
            <Button
              variant="text"
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
      </Section>
    </Box>
  );
}
