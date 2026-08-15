"use client";

import { useActionState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { status: "idle" };

/**
 * The recovery request form.
 *
 * The confirmation replaces the form rather than sitting under it. That is a
 * usability choice — the next action is in the inbox, not on this page — and it
 * also removes the resend button, which is the control that would otherwise
 * make the per-address frequency limit easy to probe. Someone who genuinely
 * needs a second email reloads the page, which is one deliberate step.
 */
export default function ForgotPasswordForm({ signInHref }: { signInHref: string }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.status === "confirmed") {
    return (
      <Stack spacing={3}>
        <Alert severity="success">{state.message}</Alert>
        <Button href={signInHref} variant="contained">
          Back to sign in
        </Button>
      </Stack>
    );
  }

  return (
    <Box component="form" action={formAction}>
      <Stack spacing={2}>
        <TextField
          label="Email address"
          name="email"
          type="email"
          autoComplete="username"
          required
          fullWidth
          error={state.status === "invalid"}
          helperText={state.status === "invalid" ? state.error : " "}
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? "Sending…" : "Send reset instructions"}
          </Button>
          <Button href={signInHref} variant="outlined">
            Back to sign in
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
