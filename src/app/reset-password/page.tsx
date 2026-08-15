import type { Metadata } from "next";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import AuthShell from "../auth-shell";
import { safeRelativeDestination } from "@/lib/auth/destination";
import {
  FORGOT_PASSWORD_PATH,
  INVALID_RECOVERY_LINK_MESSAGE,
  isRecoveryAuthenticatedSession,
} from "@/lib/auth/recovery";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordForm from "./reset-password-form";

/**
 * `/reset-password` — LAN-125.
 *
 * Reached only from `/auth/recovery`, which has already exchanged the emailed
 * token for a session and stripped it from the URL. This page never sees a
 * token, and there is nothing in its address bar worth protecting; the headers
 * are still set, in `src/proxy.ts`, because it is the page a new password is
 * typed into.
 *
 * The only question it asks is whether the current session came from a recovery
 * link. A missing, malformed, expired, spent or wrong-type link all arrive here
 * the same way — with no recovery session — and all get the same screen, which
 * is why `/auth/recovery` needs no error codes. An **ordinary** signed-in
 * session gets that screen too: being signed in is not permission to change the
 * password without knowing it.
 */
export const metadata: Metadata = {
  title: "Choose a new password — Lancers Operations",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const redirectTo = safeRelativeDestination(params.redirectTo);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!isRecoveryAuthenticatedSession(data?.claims)) {
    return (
      <AuthShell heading="This reset link cannot be used">
        <Stack spacing={3}>
          <Alert severity="warning">{INVALID_RECOVERY_LINK_MESSAGE}</Alert>
          <Button href={FORGOT_PASSWORD_PATH} variant="contained">
            Request a new link
          </Button>
        </Stack>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Choose a new password"
      intro="You will be signed out and asked to sign in with the new password."
    >
      <ResetPasswordForm redirectTo={redirectTo} />
    </AuthShell>
  );
}
