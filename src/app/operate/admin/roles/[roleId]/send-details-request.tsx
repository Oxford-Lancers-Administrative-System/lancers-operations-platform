"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import {
  Outcome as AdminOutcome,
  OutcomeSlotProvider,
  useOutcomeSlot,
} from "@/components/outcome-slot";
import { sendDetailsRequestAction } from "../../actions";
import { EMPTY_ADMIN_ACTION_STATE } from "../../action-state";

/**
 * Send details request on a holder line — LAN-459. For a holder the club has
 * only a phone number for: one press sends the WhatsApp details request again,
 * with a fresh link. The app's standard outlined button, as Send invitation.
 */
export default function SendDetailsRequest({
  roleId,
  personId,
}: {
  roleId: string;
  personId: string;
}) {
  return (
    <OutcomeSlotProvider>
      <SendDetailsRequestForm roleId={roleId} personId={personId} />
    </OutcomeSlotProvider>
  );
}

function SendDetailsRequestForm({ roleId, personId }: { roleId: string; personId: string }) {
  const [state, formAction, pending] = useActionState(
    sendDetailsRequestAction,
    EMPTY_ADMIN_ACTION_STATE,
  );
  const slot = useOutcomeSlot(`send-details-request-${personId}`);

  return (
    <Box sx={{ mt: 1 }} data-testid="holder-send-details-request">
      {state.notice ? null : (
        <Box component="form" action={formAction} onSubmit={slot.claim}>
          <input type="hidden" name="roleId" value={roleId} />
          <input type="hidden" name="personId" value={personId} />
          <Button type="submit" variant="outlined" disabled={pending} sx={{ minHeight: 36 }}>
            Send details request
          </Button>
        </Box>
      )}
      <AdminOutcome state={state} showing={slot.showing} />
    </Box>
  );
}
