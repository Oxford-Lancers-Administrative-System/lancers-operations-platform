"use client";

import { useActionState, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { abandonEventDraftAction } from "./actions";
import { EMPTY_TRANSITION_STATE } from "./form-state";

/**
 * The one status change an operator can make from the event detail.
 *
 * There were three. "Submit for approval" and "Withdraw submission" both went
 * on 12 August 2026: they modelled a proposer asking a gatekeeper, and this
 * club has no such relationship — only calendar operators create events at all.
 * A saved event is a draft, and approval takes it from there.
 *
 * Each is a real `form` posting to a server action, not a link and not a
 * fetch. That matters beyond style: the action re-resolves the operator from
 * the verified session and re-checks the event's current status inside the
 * transaction, so a button rendered a minute ago against a draft that has since
 * been submitted produces a refusal rather than a second transition.
 *
 * A refusal is shown where the operator was working, next to the button they
 * pressed, and the event is re-read on the next render — nothing here caches a
 * status and nothing decides from one.
 */

/**
 * `draft → withdrawn` — the candidate the owner abandons.
 *
 * Deliberately a different word from "Withdraw submission" above, and a
 * different outcome: this one ends the event. The reason field is not a
 * courtesy — `events_negative_decisions_are_explained` refuses a withdrawal
 * that does not say why, so the form asks for it before the database has to.
 *
 * The reason is behind a disclosure rather than sitting open on the page: an
 * always-visible text box beside a destructive action is the shape people
 * click through by habit.
 */
export function AbandonDraftForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(
    abandonEventDraftAction,
    EMPTY_TRANSITION_STATE,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="text" color="error" onClick={() => setOpen(true)} fullWidth>
        Abandon draft
      </Button>
    );
  }

  return (
    <Box component="form" action={formAction} data-testid="abandon-form">
      <input type="hidden" name="eventId" value={eventId} />
      <Stack spacing={2}>
        <TextField
          label="Why is this draft being abandoned?"
          name="reason"
          multiline
          minRows={2}
          fullWidth
          autoFocus
        />
        {state.error ? (
          <Alert severity="error" data-testid="abandon-error">
            {state.error}
          </Alert>
        ) : null}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button type="submit" variant="contained" color="error" disabled={pending}>
            {pending ? "Abandoning…" : "Abandon draft"}
          </Button>
          <Button variant="outlined" onClick={() => setOpen(false)} disabled={pending}>
            Keep the draft
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
