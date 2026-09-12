"use client";

import { useActionState, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { Section } from "@/components/section";
import { ActionBar } from "@/components/action-bar";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
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
import { Outcome as AdminOutcome, useOutcomeSlot } from "@/components/outcome-slot";
import type { PermittedAccountActions } from "../../permissions";

/**
 * The account actions on one operator's record — LAN-133. Names from
 * `DEC-administration-language-and-states`: **Deactivate operator access**,
 * **Restore operator access**, and the invitation pair. Shown only when the
 * account state makes them meaningful (`resendAvailable`, current state) AND
 * `permitted` (server-computed `canAdministerTarget`) allows them — neither
 * check is authorization; every button re-checks server-side on submit.
 * `DEC-single-actor`: a panel, not a confirmation dialog, for the three that
 * need typed input; Resend submits directly.
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
          pendingLabel="Sending…"
          testId="correct-panel"
        >
          <input type="hidden" name="operatorAccountId" value={operatorAccountId} />
          <Field
            name="email"
            type="email"
            label="Corrected email"
            defaultValue={loginEmail ?? ""}
            required
          />
        </ActionPanel>
      ) : null}

      {open === "recover" ? (
        <ActionPanel
          title="Recover email access"
          explanation="Use this only when the sign-in address is lost or compromised. The old address stops working immediately, a verification link goes to the replacement, and this account stays in Email change pending until it is followed. Roles, history and the person's record are unchanged."
          action={startEmailRehomeAction}
          submitLabel="Send verification"
          pendingLabel="Sending verification…"
          testId="recover-panel"
        >
          <input type="hidden" name="operatorAccountId" value={operatorAccountId} />
          <Field
            name="email"
            type="email"
            label="Replacement email"
            required

            helperText="An address nobody else signs in with."
          />
          <Field name="reason" label="Reason" required multiline minRows={2} />
        </ActionPanel>
      ) : null}

      {open === "deactivate" ? (
        <ActionPanel
          title="Deactivate operator access"
          explanation="Sign-in stops immediately. The roles this person holds are not ended, no seat becomes vacant, and nothing is deleted."
          action={deactivateOperatorAction}
          submitLabel="Deactivate operator access"
          pendingLabel="Deactivating…"
          submitColor="error"
          testId="deactivate-panel"
        >
          <input type="hidden" name="operatorAccountId" value={operatorAccountId} />
          <Field name="reason" label="Reason" required multiline minRows={2} />
        </ActionPanel>
      ) : null}

      {open === "restore" ? (
        <ActionPanel
          title="Restore operator access"
          explanation="The same account works again. Only the roles still in effect come back with it — a seat that ended while access was off stays ended."
          action={restoreOperatorAction}
          submitLabel="Restore operator access"
          pendingLabel="Restoring…"
          testId="restore-panel"
        >
          <input type="hidden" name="operatorAccountId" value={operatorAccountId} />
          <Field
            name="reason"
            label="Reason (optional)"

            multiline
            minRows={2}
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
  const slot = useOutcomeSlot("resend");

  return (
    <Box>
      <Box component="form" action={formAction} onSubmit={slot.claim}>
        <input type="hidden" name="operatorAccountId" value={operatorAccountId} />
        <Button
          type="submit"
          variant="contained"
          disabled={pending}
          aria-busy={pending}
          sx={{ minHeight: 44 }}
        >
          {pending ? "Sending…" : "Resend invitation"}
        </Button>
      </Box>
      <AdminOutcome state={state} showing={slot.showing} />
    </Box>
  );
}

/**
 * One action, its explanation, its fields and its result.
 *
 * LAN-321. `pendingLabel` is not decoration. These four actions each make one
 * or two calls to the Supabase Auth admin API and then wait on SMTP, so the
 * gap between pressing the button and reading the outcome is measured in
 * seconds, not milliseconds. A button that only greys out for that long is
 * indistinguishable from a button that is refusing to work, which is how Clint
 * read it — he reloaded the page, and the verification email had already gone.
 * Reloading a screen whose action is still in flight is the one thing an
 * operator must not be tempted into here, because it hides the outcome the
 * action is about to render.
 *
 * The label is what carries the state, as it does on every other form in this
 * application (`event-form.tsx`, `cancel-form.tsx`, `reset-password-form.tsx`
 * and a dozen more all read `{pending ? "…ing…" : LABEL}`). `aria-busy` says
 * the same thing to a screen reader, which a greyed-out button does not.
 */
function ActionPanel({
  title,
  explanation,
  action,
  submitLabel,
  pendingLabel,
  submitColor,
  testId,
  children,
}: {
  title: string;
  explanation: string;
  action: (previous: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  submitLabel: string;
  /** What the button reads while the action is in flight. */
  pendingLabel: string;
  submitColor?: "error";
  testId: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_ADMIN_ACTION_STATE);
  const slot = useOutcomeSlot(testId);

  return (
    <Box data-testid={testId}>
      <Section title={title} description={explanation}>
        <Box component="form" action={formAction} onSubmit={slot.claim}>
          <Stack spacing={2}>
            {children}
            <ActionBar
              primary={
                <Button
                  type="submit"
                  variant="contained"
                  color={submitColor}
                  disabled={pending}
                  aria-busy={pending}
                  sx={{ minHeight: 44 }}
                >
                  {pending ? pendingLabel : submitLabel}
                </Button>
              }
            />
          </Stack>
        </Box>
        {/*
          The outcome renders here, from the action's own returned state, on
          this same page — LAN-321. Nothing about it waits on a reload, and the
          `revalidatePath` the action runs refreshes the record's facts around
          it without disturbing it.
        */}
        <AdminOutcome state={state} showing={slot.showing} />
      </Section>
    </Box>
  );
}
