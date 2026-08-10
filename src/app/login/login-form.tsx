"use client";

import { useActionState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export default function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <Box component="form" action={formAction}>
      <Stack spacing={2}>
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <TextField
          label="Email"
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
        <Button type="submit" variant="contained" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </Stack>
    </Box>
  );
}
