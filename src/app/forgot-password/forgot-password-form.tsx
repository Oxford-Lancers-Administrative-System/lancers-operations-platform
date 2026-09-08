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
 * The recovery request form.
 *
 * The confirmation replaces the form rather than sitting under it. That is a
 * usability choice — the next action is in the inbox, not on this page — and it
 * also removes the resend button, which is the control that would otherwise
 * make the per-address frequency limit easy to probe. Someone who genuinely
 * needs a second email reloads the page, which is one deliberate step.
 *
 * The two states name their secondary action differently, on purpose. While the
 * form is on screen the pair is **Reset password** and **Cancel** — Brian's
 * wording, approved on 15 August 2026 — because there is something in progress
 * to abandon. Once the request has been answered there is not: the only thing
 * left is to go back, so the confirmation says **Back to sign in**. Offering to
 * cancel something that has already happened would be a lie about what the
 * button does.
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
