import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Field } from "@/components/field";
import { PublicShell } from "@/components/public-shell";
import { gateShellPage } from "@/app/operate/gate";

/**
 * S7 — sign in, on the public shell. LAN-225.
 *
 * The words are `/login`'s, unchanged, with one listed delta: the info alert
 * explaining that authentication does not grant access is cut (audit H1, taken
 * per brief §4.6). The form is drawn, not wired: a preview reached through the
 * real login has nothing to sign in to.
 */
export default async function LoginPreviewPage() {
  const gate = await gateShellPage("/design-preview/login");
  if ("screen" in gate) return gate.screen;

  return (
    <PublicShell caption="Operations" width="narrow" testId="login-preview">
      <Stack spacing={3}>
        <Stack spacing={1}>
          <Typography variant="h1" component="h1">
            Sign in to Lancers Operations
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Use the email address connected to your operator profile.
          </Typography>
        </Stack>
        <Stack component="form" spacing={2}>
          <Field label="Email address" name="email" type="email" autoComplete="username" required />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button type="button" variant="contained">
              Sign in
            </Button>
            <Button type="button" variant="outlined">
              Forgot password?
            </Button>
          </Stack>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Accounts are provided by the club. There is no public registration — ask the club
          administrator for access.
        </Typography>
      </Stack>
    </PublicShell>
  );
}
