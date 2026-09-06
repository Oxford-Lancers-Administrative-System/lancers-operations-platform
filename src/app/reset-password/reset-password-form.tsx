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

/**
 * The new-password form.
 *
 * `minLength` gives the browser's own immediate feedback, and the server action
 * applies the identical rule again from `validateNewPassword` — the attribute
 * is a courtesy that any client can drop, and only the second check is a
 * control. Supabase applies `minimum_password_length` a third time.
 *
 * Nothing echoes a password: the fields are uncontrolled, so a rejected attempt
 * clears them rather than round-tripping the value through the server and back
 * into the markup. The rest of the form state — the destination, the heading,
 * the message — survives, which is what "without losing safe form state" can
 * honestly mean for a field whose contents must not be safe to keep.
 */
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
