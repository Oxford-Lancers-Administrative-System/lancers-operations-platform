"use client";

import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Fact } from "@/components/fact";
import { Field } from "@/components/field";
import {
  Outcome as AdminOutcome,
  OutcomeSlotProvider,
  useOutcomeSlot,
} from "@/components/outcome-slot";
import { sendSeatInvitationAction } from "../../actions";
import { EMPTY_ADMIN_ACTION_STATE } from "../../action-state";

/**
 * Send invitation on a holder line with no operator account — LAN-434. For
 * holders seated before a seat always came with an account. One press opens
 * the pending account and sends the invitation to the recorded email; a holder
 * with none gets a required Login email field first.
 */
export default function SendInvitation({
  roleId,
  personId,
  recordedEmail,
}: {
  roleId: string;
  personId: string;
  /** Usable recorded email, or `null` when the form must ask for one. */
  recordedEmail: string | null;
}) {
  return (
    <OutcomeSlotProvider>
      <SendInvitationForm roleId={roleId} personId={personId} recordedEmail={recordedEmail} />
    </OutcomeSlotProvider>
  );
}

function SendInvitationForm({
  roleId,
  personId,
  recordedEmail,
}: {
  roleId: string;
  personId: string;
  recordedEmail: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    sendSeatInvitationAction,
    EMPTY_ADMIN_ACTION_STATE,
  );
  const [open, setOpen] = useState(false);
  const slot = useOutcomeSlot(`send-invitation-${personId}`);

  if (!open && !state.notice) {
    return (
      <Box sx={{ mt: 1 }}>
        <Button
          onClick={() => setOpen(true)}
          sx={{ minHeight: 44 }}
          data-testid="holder-send-invitation"
        >
          Send invitation
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 1 }} data-testid="holder-send-invitation-panel">
      {state.notice ? null : (
        <Box component="form" action={formAction} onSubmit={slot.claim}>
          <input type="hidden" name="roleId" value={roleId} />
          <input type="hidden" name="personId" value={personId} />
          <Stack spacing={2}>
            {recordedEmail ? (
              <Fact label="Invitation to" value={recordedEmail} />
            ) : (
              <Field name="loginEmail" type="email" label="Login email" required />
            )}
            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
                Send invitation
              </Button>
              <Button onClick={() => setOpen(false)} sx={{ minHeight: 44 }}>
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
      <AdminOutcome state={state} showing={slot.showing} />
    </Box>
  );
}
