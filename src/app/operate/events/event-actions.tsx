"use client";

import { useActionState } from "react";
import { Notice } from "@/components/notice";
import { ActionBar } from "@/components/action-bar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { approveEventAction } from "./actions";
import { EMPTY_TRANSITION_STATE } from "./form-state";

/**
 * The one status change an operator can make from the event detail: approval.
 *
 * There were five. "Submit for approval" and "Withdraw submission" went on
 * 12 August 2026, because they modelled a proposer asking a gatekeeper and this
 * club has no such relationship — only calendar operators create events at all.
 *
 * LAN-151 removed three more. **Mark occurred**, **Mark not held** and
 * **Correct this to not held** went with the occurrence assertion itself
 * (D30): nothing asserts that an event happened, and the date passing without a
 * cancellation is the whole of it. **Abandon draft** went with the `withdrawn`
 * status it produced — an abandoned draft is deleted (D29), and that path is
 * this mission's W4 work package rather than this file's.
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
 * The approve button, and only the button.
 *
 * A client component because it needs `useActionState` for the pending state and
 * the refusal, and nothing else on the confirmation screen does — the audience,
 * the count and the deadline are all server-rendered from stored rows. Keeping
 * the client boundary this small is what stops the confirmation screen holding a
 * private copy of the audience that could disagree with the database.
 *
 * It posts the event id and nothing else. The audience was saved before this
 * screen rendered, so there is no list to send, and therefore no list a browser
 * could alter between confirming and approving.
 */
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
