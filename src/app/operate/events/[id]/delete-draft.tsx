"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/notice";
import { useOutcomeSlot } from "@/components/outcome-slot";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { Section } from "@/components/section";
import { ActionBar } from "@/components/action-bar";
import Typography from "@mui/material/Typography";
import { deleteEventDraftAction } from "../actions";
import { EMPTY_TRANSITION_STATE } from "../form-state";
import {
  DELETE_DRAFT_ACTION,
  DELETE_DRAFT_DETAIL,
  DELETE_DRAFT_DIALOG_DETAIL,
  DELETE_DRAFT_DIALOG_TITLE,
  DELETE_DRAFT_HEADLINE,
  DELETE_DRAFT_KEEP,
} from "../presentation";

/**
 * Deleting a draft, from the draft's own page — REQ-delete-draft, D29
 * (Brian, 2026-08-21). Names the event, says it can't come back, says
 * nobody will be told. Says nothing about approved events (Brian: not
 * called out where it doesn't apply). The dialog is a courtesy — the
 * service refuses anything that isn't a draft either way.
 * Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE
 */
export default function DeleteDraft({ eventId, name }: { eventId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const slot = useOutcomeSlot("delete-draft");
  const [state, formAction, pending] = useActionState(
    deleteEventDraftAction,
    EMPTY_TRANSITION_STATE,
  );

  return (
    <Section
      title={DELETE_DRAFT_HEADLINE}
      description={DELETE_DRAFT_DETAIL}
      testId="delete-draft-panel"
    >
      <ActionBar
        primary={
          <Button
            variant="outlined"
            color="error"
            onClick={() => setOpen(true)}
            disabled={pending}
            data-testid="open-delete-draft"
            sx={{ minHeight: 44 }}
          >
            {DELETE_DRAFT_ACTION}
          </Button>
        }
      />

      {slot.showing && state.error ? (
        <Notice severity="error" testId="delete-draft-error">
          {state.error}
        </Notice>
      ) : null}

      <Dialog
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        aria-labelledby="delete-draft-title"
        data-testid="delete-draft-dialog"
      >
        <DialogTitle id="delete-draft-title">{DELETE_DRAFT_DIALOG_TITLE}</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Typography variant="body2" sx={{ fontWeight: 700 }} data-testid="delete-draft-name">
              {name}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {DELETE_DRAFT_DIALOG_DETAIL}
            </Typography>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={pending} sx={{ minHeight: 44 }}>
            {DELETE_DRAFT_KEEP}
          </Button>
          <Box component="form" action={formAction} onSubmit={slot.claim}>
            <input type="hidden" name="eventId" value={eventId} />
            <Button
              type="submit"
              variant="contained"
              color="error"
              disabled={pending}
              data-testid="confirm-delete-draft"
              sx={{ minHeight: 44 }}
            >
              {pending ? "Deleting…" : DELETE_DRAFT_ACTION}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Section>
  );
}
