"use client";

import { useActionState } from "react";
import { Notice } from "@/components/notice";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import { ActionBar } from "@/components/action-bar";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { status: "idle" };

/**
 * The recovery request form. The confirmation replaces the form, not sits
 * under it — no resend button, which would make the frequency limit easy to
 * probe. "Reset password" and "Cancel" while the form is on screen (Brian,
 * approved 15 August 2026); "Back to sign in" once answered — nothing left
 * in progress to cancel.
 *
 * Decision history: docs/operating-the-slice.md
 */
export default function ForgotPasswordForm({ signInHref }: { signInHref: string }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.status === "confirmed") {
    return (
      <Stack spacing={3}>
        <Notice severity="success">{state.message}</Notice>
        <Button href={signInHref} variant="contained">
          Back to sign in
        </Button>
      </Stack>
    );
  }

  return (
    <Box component="form" action={formAction}>
      <Stack spacing={2}>
        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="username"
          required
          error={state.status === "invalid"}
          helperText={state.status === "invalid" ? state.error : " "}
        />
        <ActionBar
          primary={
            <Button type="submit" variant="contained" disabled={pending}>
              {pending ? "Resetting…" : "Reset password"}
            </Button>
          }
          cancel={
            <Button href={signInHref} variant="outlined">
              Cancel
            </Button>
          }
        />
      </Stack>
    </Box>
  );
}
