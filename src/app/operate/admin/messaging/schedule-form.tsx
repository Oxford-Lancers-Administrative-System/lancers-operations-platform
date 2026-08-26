"use client";

import { useActionState, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { EMPTY_ADMIN_ACTION_STATE } from "../action-state";
import AdminOutcome from "../outcome";
import { updateOneMessagingScheduleAction } from "./actions";
import {
  HIDE_EXAMPLE,
  MESSAGING_SCHEDULE_FOOTER,
  MESSAGING_SCHEDULE_RULE_DETAIL,
  MESSAGING_SCHEDULE_RULE_HEADLINE,
  saveRowButtonLabel,
  SHOW_EXAMPLE,
  type SchedulePreview,
} from "./presentation";
import { SCHEDULE_FIELDS, type ScheduleFieldBounds } from "./validation";

/** One event type's row: its current values and its already-resolved preview. */
export interface ScheduleRowData {
  readonly eventType: string;
  readonly label: string;
  /** Keyed by `SCHEDULE_FIELDS[].key`. */
  readonly values: Readonly<Record<string, number>>;
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
const TIMING_FIELDS: readonly ScheduleFieldBounds[] = SCHEDULE_FIELDS.slice(0, 3);
const LADDER_FIELDS: readonly ScheduleFieldBounds[] = SCHEDULE_FIELDS.slice(3, 6);

/**
 * The whole editable schedule — seven independent rows, each with its own
 * save. W7, LAN-171, round 2 (OWNER-LAN171-04).
 *
 * ## One save per row, not one for the page
 *
 * Round 1 shipped a single "Save changes" button over the whole table, on the
 * approved `W7-02` mockup's own drawing. Brian reversed that once he saw it
 * live: "I think there should be a save button per event. Having one group
 * save at the top doesn't really make a lot of sense." Each `ScheduleRow`
 * below is therefore its own `<form>`, posting to its own
 * `updateOneMessagingScheduleAction` call with its own `useActionState` — a
 * hook per row is legal exactly because each row is its own component
 * instance, not a loop body sharing one call.
 *
 * ## Why one grid, not a table and a card list
 *
 * `docs/ux/standards.md`'s phone rule and every other Administration list
 * satisfy it by rendering two markups — a `Table` hidden below `md`, a `Stack`
 * of `Card`s hidden above it (see `../roles/page.tsx`). That duplicates safely
 * for read-only content. It cannot duplicate here: a form field's `name`
 * appears in `FormData` however many elements carry it, so two copies of the
 * same six inputs per row would either collide or double-submit. Each row is
 * instead **one** CSS grid that reflows — two three-field rows at `sm` and
 * up, one column at `xs` — so there is exactly one set of inputs, and the
 * phone reader sees "one card per event type" (`REQ-phone-is-cards`) because
 * a bordered `Paper` stacked to one column already looks like one.
 */
export default function MessagingScheduleForm({ rows }: { rows: readonly ScheduleRowData[] }) {
  return (
    <Stack spacing={2}>
      <Alert severity="info" data-testid="schedule-rule">
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {MESSAGING_SCHEDULE_RULE_HEADLINE}
        </Typography>
        <Typography variant="body2">{MESSAGING_SCHEDULE_RULE_DETAIL}</Typography>
      </Alert>

      <Stack spacing={1.5}>
        {rows.map((row, index) => (
          <ScheduleRow
            key={row.eventType}
            row={row}
            // Practice, first in the table, opens by default so a reader
            // sees a worked example without hunting for one — the same
            // reasoning `guide-faq.tsx` gives its own first entry. A row
            // whose own configuration already produces the gap warning
            // opens too, regardless of position: the preview's whole job
            // is to make a wrong value visible, which it cannot do closed.
            defaultOpen={index === 0 || row.preview.warning !== null}
          />
        ))}
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {MESSAGING_SCHEDULE_FOOTER}
      </Typography>
    </Stack>
  );
}

/** One field: its label, its narrow input, and its unit — the event page's own field idiom. */
function ScheduleField({
  eventType,
  field,
  defaultValue,
}: {
  eventType: string;
  field: ScheduleFieldBounds;
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

/** One event type — its own form, its six editable fields, and its own save. */
function ScheduleRow({
  row,
  defaultOpen = false,
}: {
  row: ScheduleRowData;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
            {row.preview.warning ? (
              <Alert severity="warning" sx={{ mt: 1.5 }} data-testid="schedule-row-warning">
                {row.preview.warning}
              </Alert>
            ) : null}
          </Box>
        </Collapse>
      </Stack>
    </Paper>
  );
}
