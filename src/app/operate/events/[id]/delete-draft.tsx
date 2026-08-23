"use client";

import { useActionState, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
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
 * Deleting a draft, from the draft's own page — REQ-delete-draft, D29.
 *
 * ## Why it is here and not on the form
 *
 * Brian, 2026-08-21: "there should be a Delete Event button ... I don't know
 * where that button exists on this event." A saved draft has a page, and that
 * page is where an operator edits it, chooses its audience, or decides it should
 * not exist. There is nothing to delete on the create form.
 *
 * ## The confirmation names the event and says one thing
 *
 * It names what is about to go, says it cannot come back, and says nobody will
 * be told — because nobody was told in the first place, which is the whole
 * reason a draft may be deleted at all.
 *
 * What it deliberately does **not** say is that an approved event cannot be
 * deleted. Brian, again: "That warning should pop up if you try to delete an
 * approved event ... I don't think it needs to be called out there
 * specifically." A rule stated where it does not apply is a rule the reader has
 * to work out is not about them.
 *
 * ## The dialog is a courtesy; the service is the guard
 *
 * This whole component could be skipped by posting to the action directly, and
 * `deleteEventDraft` would still refuse anything that is not a draft. The
 * confirmation exists so a person does not do it by accident, not so the rule
 * holds.
 */
export default function DeleteDraft({ eventId, name }: { eventId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteEventDraftAction,
    EMPTY_TRANSITION_STATE,
  );

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="delete-draft-panel">
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary" component="p">
            {DELETE_DRAFT_HEADLINE}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {DELETE_DRAFT_DETAIL}
          </Typography>
        </Box>
        <Box>
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
        </Box>
      </Stack>

      {state.error ? (
        <Alert severity="error" sx={{ mt: 2 }} data-testid="delete-draft-error">
          {state.error}
        </Alert>
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
          <Box component="form" action={formAction}>
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
    </Paper>
  );
}
