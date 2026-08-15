"use client";

import { useActionState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { FORGOT_PASSWORD_PATH } from "@/lib/auth/recovery";
import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

/**
 * UX-01's form. The two actions are the ones the wireframe shows, in that
 * order, and side by side on a desktop viewport; on a phone they stack full
 * width so neither becomes a thumb-sized target beside the other.
 *
 * `redirectTo` reaches "Forgot password?" as a query parameter because it has
 * already been through `safeRelativeDestination` on the server — it is passed
 * along, never re-derived from anything the browser supplies here.
 */
export default function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const forgotPasswordHref = `${FORGOT_PASSWORD_PATH}?redirectTo=${encodeURIComponent(redirectTo)}`;

  return (
    <Box component="form" action={formAction}>
      <Stack spacing={2}>
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <TextField
          label="Email address"
          name="email"
          type="email"
          autoComplete="username"
          required
          fullWidth
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          fullWidth
        />
        {state.error ? <Alert severity="error">{state.error}</Alert> : null}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <Button href={forgotPasswordHref} variant="outlined">
            Forgot password?
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
