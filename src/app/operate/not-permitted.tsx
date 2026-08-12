import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { signOut } from "../login/actions";

/**
 * UX-05 — an active operator whose current roles do not permit the action.
 *
 * ## What it says, and what it must never say
 *
 * The heading and the sentence are the approved wireframe copy. The line the
 * wireframe does not have — `requirement` — is required by the live LAN-73
 * acceptance criteria: "refused any privileged action, with a message naming
 * the role required". Live Linear outranks the wireframe (`slice-ux.md` § 1),
 * and the addition is additive: it names what the *action* needs.
 *
 * It never names what the reader holds, and never names who does hold the
 * missing role. The first would tell whoever has the session what the account
 * is worth; the second would publish the committee's composition to anybody who
 * can reach a screen. `requirement` comes from `capabilities.ts`, which builds
 * its sentence from the capability's own role list and from nothing about the
 * actor.
 *
 * ## Why it is a screen and not a 404
 *
 * A refusal that pretends the destination does not exist leaves an operator who
 * genuinely should have been given the role with no way to tell the difference
 * between "ask for access" and "that page is gone". The recovery action is
 * therefore a real one: return to a destination they can open.
 */

export const NOT_PERMITTED_HEADING = "You do not have access to this action";

export const NOT_PERMITTED_MESSAGE =
  "Your operator profile is active, but your current role assignments do not permit " +
  "this action.";

export const NOT_PERMITTED_NOTE =
  "Authorization is enforced by the service action independently of whether a " +
  "navigation item was visible.";

export default function NotPermittedScreen({
  requirement,
  returnHref,
}: {
  /** One sentence naming the role the action requires. Never the roles held. */
  requirement: string;
  /** A destination this operator can actually open, when there is one. */
  returnHref?: string;
}) {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", px: 2, py: { xs: 4, md: 8 } }}>
      <Paper
        variant="outlined"
        sx={{ maxWidth: 640, p: { xs: 2.5, md: 5 }, width: "100%" }}
        data-testid="operator-not-permitted"
      >
        <Stack spacing={3} sx={{ alignItems: "flex-start" }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            {NOT_PERMITTED_HEADING}
          </Typography>
          <Typography color="text.secondary">{NOT_PERMITTED_MESSAGE}</Typography>
          <Alert severity="warning" sx={{ width: "100%" }} data-testid="required-role">
            {requirement}
          </Alert>
          <Alert severity="info" sx={{ width: "100%" }}>
            {NOT_PERMITTED_NOTE}
          </Alert>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ width: "100%", alignItems: { xs: "stretch", sm: "center" } }}
          >
            {returnHref ? (
              <Button variant="contained" href={returnHref}>
                Return to an authorized area
              </Button>
            ) : null}
            <Box component="form" action={signOut}>
              <Button type="submit" variant="outlined" fullWidth>
                Sign out
              </Button>
            </Box>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
