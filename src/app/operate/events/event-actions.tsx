"use client";

import { useActionState } from "react";
import { Notice } from "@/components/notice";
import { ActionBar } from "@/components/action-bar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { approveEventAction } from "./actions";
import { EMPTY_TRANSITION_STATE } from "./form-state";

// The one status change from event detail: approval. Five others were
// retired (D30, D29, relocations.md); a real form to a server action.

/** The approve button alone — a client component only for `useActionState`; posts the event id and nothing else (audience was saved earlier). */
export function ApproveEventForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(approveEventAction, EMPTY_TRANSITION_STATE);

  return (
    <Box component="form" action={formAction} data-testid="approve-form">
      <Stack spacing={2}>
        <input type="hidden" name="eventId" value={eventId} />
        {state.error ? (
          <Notice variant="refusal" testId="approval-error">
            {state.error}
          </Notice>
        ) : null}
        <ActionBar
          primary={
            <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
              {pending ? "Approving…" : "Approve event"}
            </Button>
          }
          cancel={
            <Button
              variant="outlined"
              href={`/operate/events/${eventId}?step=audience`}
              disabled={pending}
              sx={{ minHeight: 44 }}
            >
              Back to audience
            </Button>
          }
        />
      </Stack>
    </Box>
  );
}
