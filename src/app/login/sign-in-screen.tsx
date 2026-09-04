import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import AuthShell from "../auth-shell";
import LoginForm from "./login-form";

/**
 * The sign-in screen itself, so that `/` and `/login` are one page and not two.
 *
 * LAN-225 took audit finding B8: the root used to be LAN-71's bootstrap
 * scaffold, and is now where a visitor signs in. `/login` stays a real route —
 * the proxy redirects to it with `?redirectTo=`, the recovery emails link to
 * it, and the route contract names it — so this is extracted rather than one
 * route redirecting to the other. Anything added here appears on both.
 */
export default function SignInScreen({
  redirectTo,
  justReset,
}: {
  redirectTo: string;
  justReset: boolean;
}) {
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
