import type { Metadata } from "next";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import AuthShell from "../auth-shell";
import { safeRelativeDestination } from "@/lib/auth/destination";
import LoginForm from "./login-form";

/**
 * UX-01. The default destination is `/operate`, the operator shell, per the
 * route contract in `docs/ux/slice-ux.md` § 4 — `/dashboard` was LAN-71's
 * throwaway wiring proof and is not where a signed-in operator belongs.
 *
 * The guard around `redirectTo` is `safeRelativeDestination`, which is the same
 * rule this page enforced inline before LAN-125 and refuses two more things
 * besides: a backslash-prefixed path, which browsers normalise into a
 * protocol-relative one, and any value carrying a control character.
 *
 * `?reset=1` is the one flag this page reads besides the destination. It says a
 * password was just set through the recovery journey and carries nothing about
 * who set it — the recovery session is already ended by the time the browser
 * arrives here, so this is a message, not a state.
 */
export const metadata: Metadata = {
  title: "Sign in — Lancers Operations",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const redirectTo = safeRelativeDestination(params.redirectTo);
  const justReset = params.reset === "1";

  return (
    <AuthShell
      heading="Sign in to Lancers Operations"
      intro="Use the email address connected to your operator profile."
    >
      {justReset ? (
        <Alert severity="success">
          Your password has been changed. Sign in with your new password.
        </Alert>
      ) : null}
      <Alert severity="info">
        Authentication does not grant access by itself. The linked operator profile and current role
        assignments are checked on every protected action.
      </Alert>
      <LoginForm redirectTo={redirectTo} />
      <Typography variant="body2" color="text.secondary">
        Accounts are provided by the club. There is no public registration — ask the club
        administrator for access.
      </Typography>
    </AuthShell>
  );
}
