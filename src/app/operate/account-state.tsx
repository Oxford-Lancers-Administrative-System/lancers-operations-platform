import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { signOut } from "../login/actions";

/**
 * UX-03 and UX-04 — the two account states, at `/operate`.
 *
 * ## The copy is exact, and the two are different on purpose
 *
 * Brian approved both sentences on 12 August 2026 (LAN-107; `slice-ux.md` § 8).
 * They differ because the next action differs: an unlinked account has to be
 * connected to a club record, a deactivated one has to be re-enabled. A single
 * message covering both would send at least one of those people somewhere
 * useless, which is the defect LAN-95 had already found once in `/dashboard`.
 *
 * Reword nothing here without a recorded owner decision. The strings are
 * asserted literally by test for that reason.
 *
 * ## What this screen may contain
 *
 * Nothing. No navigation, no operator name, no email address, no role, no
 * counts, no links into the shell. The person reading it has a verified session
 * and no operator access, and everything this repository holds about the club
 * is off limits to them — including the fact that a Person record may exist
 * behind their address. The only outward reference is "the club administrator",
 * unnamed, because naming one would be a contact detail.
 *
 * Sign out is the only action, exactly as both wireframes show.
 */

export const UNLINKED_HEADING = "Operator profile not connected";

export const UNLINKED_MESSAGE =
  "You’re signed in, but this account is not connected to a Lancers operator " +
  "profile. Contact the club administrator and provide the email address you used " +
  "to sign in.";

export const INACTIVE_HEADING = "Operator access inactive";

export const INACTIVE_MESSAGE =
  "Your Lancers operator access is inactive. Contact the club administrator if you " +
  "believe access should be restored.";

/** The note both wireframes carry, stating the boundary rather than implying it. */
export const NO_DATA_NOTE =
  "No operator data, navigation, roles or actions are exposed in this state.";

const COPY = {
  unlinked: { heading: UNLINKED_HEADING, message: UNLINKED_MESSAGE },
  inactive: { heading: INACTIVE_HEADING, message: INACTIVE_MESSAGE },
} as const;

export type AccountStateKind = keyof typeof COPY;

export default function OperatorAccountState({ state }: { state: AccountStateKind }) {
  const { heading, message } = COPY[state];

  return (
    <Box sx={{ display: "flex", justifyContent: "center", px: 2, py: { xs: 4, md: 8 } }}>
      <Paper
        variant="outlined"
        sx={{ maxWidth: 640, p: { xs: 2.5, md: 5 }, width: "100%" }}
        data-testid="operator-account-state"
        data-state={state}
      >
        <Stack spacing={3} sx={{ alignItems: "flex-start" }}>
          <Typography variant="overline" color="text.secondary">
            Lancers Operations
          </Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            {heading}
          </Typography>
          <Typography color="text.secondary">{message}</Typography>
          <Alert severity="info" sx={{ width: "100%" }}>
            {NO_DATA_NOTE}
          </Alert>
          <Box component="form" action={signOut}>
            <Button type="submit" variant="contained">
              Sign out
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
