"use client";

import { useActionState, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { EMPTY_ADMIN_ACTION_STATE } from "../action-state";
import AdminOutcome from "../outcome";
import { updateMessagingSchedulesAction } from "./actions";
import {
  HIDE_EXAMPLE,
  MESSAGING_SCHEDULE_FOOTER,
  MESSAGING_SCHEDULE_RULE_DETAIL,
  MESSAGING_SCHEDULE_RULE_HEADLINE,
  SAVE_CHANGES,
  SHOW_EXAMPLE,
  type SchedulePreview,
} from "./presentation";
import { SCHEDULE_FIELDS, scheduleFieldName } from "./validation";

/** One event type's row: its current values and its already-resolved preview. */
export interface ScheduleRowData {
  readonly eventType: string;
  readonly label: string;
  /** Keyed by `SCHEDULE_FIELDS[].key`. */
  readonly values: Readonly<Record<string, number>>;
  readonly preview: SchedulePreview;
}

/**
 * The whole editable schedule — one form, one save. W7, LAN-171.
 *
 * ## Why one grid, not a table and a card list
 *
 * `docs/ux/standards.md`'s phone rule and every other Administration list
 * satisfy it by rendering two markups — a `Table` hidden below `md`, a `Stack`
 * of `Card`s hidden above it (see `../roles/page.tsx`). That duplicates safely
 * for read-only content. It cannot duplicate here: a form field's `name`
 * appears in `FormData` however many elements carry it, so two copies of the
 * same six inputs per row would either collide or double-submit. Each row is
 * instead **one** CSS grid that reflows — a wide row at `md` and up, one
 * column at `xs` — so there is exactly one set of inputs, and the phone
 * reader sees "one card per event type" (`REQ-phone-is-cards`) because a
 * bordered `Paper` stacked to one column already looks like one.
 *
 * ## One save for seven rows
 *
 * `/operate/admin/roles` reads one action per decision because each is its
 * own irreversible fact. This page edits reference data, and the approved
 * `W7-02` mockup draws exactly one **Save changes** button over the whole
 * table — editing the club's schedule is one act, whichever rows changed to
 * produce it. `updateMessagingSchedulesAction` only writes the rows that
 * actually changed, so a fresh audit row means a fresh decision and not a
 * restatement of six the operator never touched.
 */
export default function MessagingScheduleForm({ rows }: { rows: readonly ScheduleRowData[] }) {
  const [state, formAction, pending] = useActionState(
    updateMessagingSchedulesAction,
    EMPTY_ADMIN_ACTION_STATE,
  );

  return (
    <Box component="form" action={formAction} data-testid="messaging-schedule-form">
      <Stack spacing={2}>
        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
            {SAVE_CHANGES}
          </Button>
        </Stack>

        <AdminOutcome state={state} />

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
    </Box>
  );
}

/** One event type — its six editable fields, and its worked example behind a toggle. */
function ScheduleRow({
  row,
  defaultOpen = false,
}: {
  row: ScheduleRowData;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="schedule-row">
      <Box
        sx={{
          display: "grid",
          gap: 2,
          alignItems: "center",
          gridTemplateColumns: { xs: "1fr", md: "150px repeat(6, minmax(0, 1fr))" },
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }} data-testid="schedule-row-label">
          {row.label}
        </Typography>
        {SCHEDULE_FIELDS.map((field) => (
          <TextField
            key={field.key}
            name={scheduleFieldName(row.eventType, field.key)}
            label={field.label}
            type="number"
            size="small"
            defaultValue={row.values[field.key]}
            slotProps={{ htmlInput: { min: field.min, max: field.max, step: 1 } }}
            fullWidth
          />
        ))}
      </Box>

      <Box sx={{ mt: 1 }}>
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
        <Box sx={{ pt: 1 }} data-testid="schedule-row-preview">
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
    </Paper>
  );
}
