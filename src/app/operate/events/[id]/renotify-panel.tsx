"use client";

import { useActionState } from "react";
import { Notice } from "@/components/notice";
import { useOutcomeSlot } from "@/components/outcome-slot";
import { Section } from "@/components/section";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { renotifyEventAction } from "./change-actions";
import { EMPTY_TRANSITION_STATE } from "../form-state";
import {
  RENOTIFY_DETAIL,
  RENOTIFY_HEADING,
  renotifyLabel,
  renotifySends,
} from "./change-presentation";

/**
 * W5-04 — the recovery path, and the reason it exists.
 *
 * "Turning the notification off is one tick, and it is easy to get wrong at
 * half past seven on a Monday evening. Without this, a missed notification is
 * permanent and the only fix is WhatsApp. With it, the mistake costs one
 * button."
 *
 * A client component because it needs the pending state and the refusal, and
 * because nothing else on the event page does. It posts the event id and
 * nothing else — there is no audience to send, because the audience is whoever
 * the event already invited.
 */
export default function RenotifyPanel({
  eventId,
  recipients,
  notice,
}: {
  eventId: string;
  recipients: number;
  /** What went out to nobody, named — or `null` where the last change notified. */
  notice: string | null;
}) {
  const [state, formAction, pending] = useActionState(renotifyEventAction, EMPTY_TRANSITION_STATE);
  const slot = useOutcomeSlot("renotify");

  return (
    <Section title={RENOTIFY_HEADING} testId="renotify-panel">
      <Box component="form" action={formAction} onSubmit={slot.claim}>
        <input type="hidden" name="eventId" value={eventId} />
        <Stack spacing={2}>
          {notice ? (
            <Notice severity="warning" testId="silent-change-notice">
              {notice}
            </Notice>
          ) : null}

          {slot.showing && state.error ? (
            <Notice severity="error" testId="renotify-error">
              {state.error}
            </Notice>
          ) : null}

          <Typography variant="body2" color="text.secondary" data-testid="renotify-detail">
            {`${renotifySends(recipients)} ${RENOTIFY_DETAIL}`}
          </Typography>

          <Box>
            <Button
              type="submit"
              variant="contained"
              disabled={pending}
              sx={{ minHeight: 44 }}
              data-testid="renotify-button"
            >
              {pending ? "Sending…" : renotifyLabel(recipients)}
            </Button>
          </Box>
        </Stack>
      </Box>
    </Section>
  );
}
