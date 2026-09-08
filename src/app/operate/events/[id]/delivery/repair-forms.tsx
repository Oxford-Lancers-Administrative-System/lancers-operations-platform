"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/notice";
import { ActionBar } from "@/components/action-bar";
import { useOutcomeSlot } from "@/components/outcome-slot";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import { EMPTY_TRANSITION_STATE } from "../../form-state";
import { retryDeliveryAction, revokeAndReissueAction } from "./actions";
import { RETRY_DELIVERY, REVOKE_AND_REISSUE } from "./presentation";

/**
 * UX-52's two controls.
 *
 * Both are real `form`s posting to Server Actions rather than links or fetches,
 * for the same reason the event transitions are: the action re-resolves the
 * operator from the verified session and re-checks the job's current state
 * inside the transaction, so a button rendered a minute ago against a failed
 * job that has since been retried produces a refusal rather than a second send.
 *
 * `pending` disables each button while it is in flight, which is § 9's Loading
 * requirement — "duplicate actions disabled" — and is also the cheap half of
 * not sending twice. The expensive half is in the service, where the claim is
 * guarded.
 */

export function RetryDeliveryForm({
  eventId,
  jobId,
  disabled,
  disabledReason,
}: {
  eventId: string;
  jobId: string;
  disabled: boolean;
  disabledReason: string;
}) {
  const [state, formAction, pending] = useActionState(retryDeliveryAction, EMPTY_TRANSITION_STATE);

  const slot = useOutcomeSlot("retry");
  return (
    <Box component="form" action={formAction} onSubmit={slot.claim} data-testid="retry-form">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="jobId" value={jobId} />
      <Stack spacing={1}>
        <Button
          type="submit"
          variant="contained"
          disabled={disabled || pending}
          fullWidth
          sx={{ minHeight: 44 }}
        >
          {pending ? "Retrying…" : RETRY_DELIVERY}
        </Button>
        {disabled ? (
          <Box
            component="p"
            sx={{ m: 0, fontSize: 14, color: "text.secondary" }}
            data-testid="retry-unavailable"
          >
            {disabledReason}
          </Box>
        ) : null}
        {state.error && slot.showing ? (
          <Notice variant="refusal" testId="retry-error">
            {state.error}
          </Notice>
        ) : null}
      </Stack>
    </Box>
  );
}

/**
 * Revoke and reissue, behind a disclosure.
 *
 * The reason is mandatory and the field is not shown until the operator asks
 * for the action — an always-visible text box beside a destructive control is
 * the shape people click through by habit, and this control invalidates a link
 * somebody may be holding.
 */
export function RevokeAndReissueForm({
  eventId,
  invitationId,
  disabled,
}: {
  eventId: string;
  invitationId: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    revokeAndReissueAction,
    EMPTY_TRANSITION_STATE,
  );
  const [open, setOpen] = useState(false);
  const slot = useOutcomeSlot("reissue");

  if (!open) {
    return (
      <Button
        variant="outlined"
        onClick={() => {
          slot.claim();
          setOpen(true);
        }}
        disabled={disabled}
        fullWidth
        sx={{ minHeight: 44 }}
      >
        {REVOKE_AND_REISSUE}
      </Button>
    );
  }

  return (
    <Box component="form" action={formAction} onSubmit={slot.claim} data-testid="reissue-form">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <Stack spacing={2}>
        <Field
          label="Why is this link being withdrawn?"
          name="reason"
          multiline
          minRows={2}
          autoFocus
          helperText="The previous link stops working immediately. A new one is sent in its place."
        />
        {state.error && slot.showing ? (
          <Notice variant="refusal" testId="reissue-error">
            {state.error}
          </Notice>
        ) : null}
        <ActionBar
          primary={
            <Button type="submit" variant="contained" disabled={pending}>
              {pending ? "Reissuing…" : REVOKE_AND_REISSUE}
            </Button>
          }
          cancel={
            <Button variant="text" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
          }
        />
      </Stack>
    </Box>
  );
}
