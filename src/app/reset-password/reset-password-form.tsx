"use client";

import { useActionState } from "react";
import { Notice } from "@/components/notice";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import { ActionBar } from "@/components/action-bar";
import {
  FORGOT_PASSWORD_PATH,
  MINIMUM_PASSWORD_LENGTH,
  PASSWORD_POLICY_HINT,
} from "@/lib/auth/recovery";
import { completePasswordReset, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = { error: null };

/** The new-password form. `minLength` is a courtesy only — `validateNewPassword` is the control, Supabase applies its own rule a third time. Fields are uncontrolled: nothing echoes a password back. */
export default function ResetPasswordForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState(completePasswordReset, initialState);

  if (state.expired) {
    return (
      <Stack spacing={3}>
        <Notice severity="warning">{state.error}</Notice>
        <Button href={FORGOT_PASSWORD_PATH} variant="contained">
          Request a new link
        </Button>
      </Stack>
    );
  }

  return (
    <Box component="form" action={formAction}>
      <Stack spacing={2}>
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          slotProps={{ htmlInput: { minLength: MINIMUM_PASSWORD_LENGTH } }}
          helperText={PASSWORD_POLICY_HINT}
        />
        <Field
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          slotProps={{ htmlInput: { minLength: MINIMUM_PASSWORD_LENGTH } }}
        />
        {state.error ? <Notice severity="error">{state.error}</Notice> : null}
        <ActionBar
          primary={
            <Button type="submit" variant="contained" disabled={pending}>
              {pending ? "Saving…" : "Set new password"}
            </Button>
          }
        />
      </Stack>
    </Box>
  );
}
