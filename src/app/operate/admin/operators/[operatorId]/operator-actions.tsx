"use client";

import { useActionState, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { OperatorAccountState } from "@/lib/services/operator-account-state";
import {
  correctInvitationAction,
  deactivateOperatorAction,
  resendInvitationAction,
  restoreOperatorAction,
  startEmailRehomeAction,
} from "../../actions";
import { EMPTY_ADMIN_ACTION_STATE, type AdminActionState } from "../../action-state";
import type { PermittedAccountActions } from "../../permissions";

/**
 * The account actions on one operator's record — LAN-133.
 *
 * `DEC-administration-language-and-states` names them, and these are those
 * names: **Deactivate operator access**, **Restore operator access**, and the
 * invitation pair. Nothing here is called "disable", "revoke", "suspend" or
 * "reset", and nothing here mentions a durable Person, effective access or an
 * access log.
 *
 * ## Which of them appear
 *
 * Two independent questions, and both have to say yes:
 *
 *   * **Does the account's state make it meaningful?** Resend is offered "while
 *     pending or failed", which is `resendAvailable` on the state definition
 *     rather than a list of states written here. Restore is offered only to a
 *     deactivated account and Deactivate only to one that is not.
 *   * **May this administrator do it to this person?** `permitted` is
 *     `canAdministerTarget`'s answer, computed on the server against seats read
 *     from the database. A President opening the General Manager's record sees
 *     no Deactivate button, because `REQ-final-admin-protection` makes that
 *     refusal a fact about the club rather than a message about a click.
 *
 * Neither question is authorization. Every button posts to a server action that
 * asks the whole question again, against the same target, inside the
 * transaction that writes.
 *
 * ## Why each action opens a panel rather than firing
 *
 * `DEC-single-actor` settles that these are single-actor and immediate — "there
 * is no second-confirmation workflow" — so a confirmation dialog would be
 * inventing a step the decision removed. But three of the four need something
 * typed: a required reason for deactivation, a corrected address, a replacement
 * address and a reason. The panel is where that goes, and Resend, which needs
 * nothing, submits from its own button with no panel at all.
 */
export default function OperatorActions({
  operatorAccountId,
  state,
  resendAvailable,
  loginEmail,
  permitted,
}: {
  operatorAccountId: string;
  state: OperatorAccountState;
  resendAvailable: boolean;
  loginEmail: string | null;
  permitted: PermittedAccountActions;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (panel: string) => setOpen((current) => (current === panel ? null : panel));

  const canRehome = state === "active" || state === "email_change_pending";
  const offered = {
    resend: resendAvailable && permitted.resend,
    correct: resendAvailable && permitted.correct,
    recover: canRehome && permitted.recoverEmail,
    deactivate: state !== "deactivated" && permitted.deactivate,
    restore: state === "deactivated" && permitted.restore,
  };

  const anything = Object.values(offered).some(Boolean);
  if (!anything) {
    return (
      <Typography variant="body2" color="text.secondary" data-testid="no-account-actions">
        There is nothing you can change on this operator&rsquo;s account.
      </Typography>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
        {offered.resend ? <ResendButton operatorAccountId={operatorAccountId} /> : null}
        {offered.correct ? (
          <Button onClick={() => toggle("correct")} sx={{ minHeight: 44 }}>
            Correct email and resend
          </Button>
        ) : null}
        {offered.recover ? (
          <Button onClick={() => toggle("recover")} sx={{ minHeight: 44 }}>
            Recover email access
          </Button>
        ) : null}
        {offered.deactivate ? (
          <Button color="error" onClick={() => toggle("deactivate")} sx={{ minHeight: 44 }}>
            Deactivate operator access
          </Button>
        ) : null}
        {offered.restore ? (
          <Button variant="contained" onClick={() => toggle("restore")} sx={{ minHeight: 44 }}>
            Restore operator access
          </Button>
        ) : null}
      </Stack>

      {open === "correct" ? (
        <ActionPanel
          title="Correct the address and send the invitation again"
          explanation="The invitation stays attached to this same account. Nothing is duplicated, and the address it was originally sent to is kept in the record."
          action={correctInvitationAction}
          submitLabel="Correct and resend"
          testId="correct-panel"
        >
          <input type="hidden" name="operatorAccountId" value={operatorAccountId} />
          <TextField
            name="email"
            type="email"
            label="Corrected email"
            defaultValue={loginEmail ?? ""}
            required
            fullWidth
          />
        </ActionPanel>
      ) : null}

      {open === "recover" ? (
        <ActionPanel
          title="Recover email access"
          explanation="Use this only when the sign-in address is lost or compromised. The old address stops working immediately, a verification link goes to the replacement, and this account stays in Email change pending until it is followed. Roles, history and the person's record are unchanged."
          action={startEmailRehomeAction}
          submitLabel="Send verification"
          testId="recover-panel"
        >
          <input type="hidden" name="operatorAccountId" value={operatorAccountId} />
          <TextField
            name="email"
            type="email"
            label="Replacement email"
            required
            fullWidth
            helperText="An address nobody else signs in with."
          />
          <TextField name="reason" label="Reason" required fullWidth multiline minRows={2} />
        </ActionPanel>
      ) : null}

      {open === "deactivate" ? (
        <ActionPanel
          title="Deactivate operator access"
          explanation="Sign-in stops immediately. The roles this person holds are not ended, no seat becomes vacant, and nothing is deleted."
          action={deactivateOperatorAction}
          submitLabel="Deactivate operator access"
          submitColor="error"
          testId="deactivate-panel"
        >
          <input type="hidden" name="operatorAccountId" value={operatorAccountId} />
          <TextField name="reason" label="Reason" required fullWidth multiline minRows={2} />
        </ActionPanel>
      ) : null}

      {open === "restore" ? (
        <ActionPanel
          title="Restore operator access"
          explanation="The same account works again. Only the roles still in effect come back with it — a seat that ended while access was off stays ended."
          action={restoreOperatorAction}
          submitLabel="Restore operator access"
          testId="restore-panel"
        >
          <input type="hidden" name="operatorAccountId" value={operatorAccountId} />
          <TextField
            name="reason"
            label="Reason (optional)"
            fullWidth
            multiline
            minRows={2}
            helperText="Coming back needs no excuse; record one if it helps the next reader."
          />
        </ActionPanel>
      ) : null}
    </Stack>
  );
}

/** Resend needs no fields, so it is its own one-button form. */
function ResendButton({ operatorAccountId }: { operatorAccountId: string }) {
  const [state, formAction, pending] = useActionState(
    resendInvitationAction,
    EMPTY_ADMIN_ACTION_STATE,
  );

  return (
    <Box>
      <Box component="form" action={formAction}>
        <input type="hidden" name="operatorAccountId" value={operatorAccountId} />
        <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
          Resend invitation
        </Button>
      </Box>
      <Outcome state={state} />
    </Box>
  );
}

/** One action, its explanation, its fields and its result. */
function ActionPanel({
  title,
  explanation,
  action,
  submitLabel,
  submitColor,
  testId,
  children,
}: {
  title: string;
  explanation: string;
  action: (previous: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  submitLabel: string;
  submitColor?: "error";
  testId: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_ADMIN_ACTION_STATE);

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid={testId}>
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {explanation}
      </Typography>
      <Box component="form" action={formAction}>
        <Stack spacing={2}>
          {children}
          <Box>
            <Button
              type="submit"
              variant="contained"
              color={submitColor}
              disabled={pending}
              sx={{ minHeight: 44 }}
            >
              {submitLabel}
            </Button>
          </Box>
        </Stack>
      </Box>
      <Outcome state={state} />
    </Paper>
  );
}

/**
 * What came back.
 *
 * An error is the service's own sentence; a notice is the screen's
 * confirmation. A refusal never reaches here — `actions.ts` rethrows
 * `NotPermitted` rather than turning it into red text beside a button.
 */
function Outcome({ state }: { state: AdminActionState }) {
  if (state.error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        {state.error}
      </Alert>
    );
  }
  if (state.notice) {
    return (
      <Alert severity="success" sx={{ mt: 2 }}>
        {state.notice}
      </Alert>
    );
  }
  return null;
}
