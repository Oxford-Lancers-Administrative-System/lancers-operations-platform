import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { signOut } from "../login/actions";

/**
 * UX-96 — an active operator who cannot record attendance, on the attendance
 * route. LAN-110.
 *
 * ## Why this is not UX-05 with different words
 *
 * UX-05 tells an operator that *an action* is closed to them and points at a
 * destination that is not. This screen answers a narrower question — "may I
 * take the register for this event?" — and the wireframe's copy is specific in
 * a way the general refusal cannot be: it names the three assignments that
 * carry the capability, and it states what the page is **not** showing, which
 * is the half a coach standing at the side of a pitch actually needs to hear
 * before they go and find somebody who can.
 *
 * ## What it says about the reader
 *
 * Nothing it does not already know. "This account does not have an active Head
 * Coach, Offensive Coordinator or Defensive Coordinator assignment" is a
 * statement about the requirement and about the verified holder's own account.
 * It names no other person, no other account, and nobody who does hold the
 * seat — the same rule `guards.ts` keeps for every refusal in the slice.
 *
 * ## The recovery action
 *
 * The wireframe shows **Sign out** alone, and for the reader it was drawn for —
 * a coach whose seat has ended, who has nowhere else in the shell to go — that
 * is the whole of it. `returnHref` is offered only when the operator genuinely
 * has a destination they can open, because `slice-ux.md` § 7 forbids removing a
 * recovery action and sending somebody to sign out when they had somewhere to
 * be would be exactly that. When there is nowhere, the screen is the wireframe.
 */

export const COACH_NOT_PERMITTED_HEADING = "You cannot record attendance for this event";

export const COACH_NOT_PERMITTED_MESSAGE =
  "This account does not have an active Head Coach, Offensive Coordinator or Defensive " +
  "Coordinator assignment for this scope.";

export const COACH_NOT_PERMITTED_WITHHELD =
  "No roster, contact, RSVP reason, availability, attendance data or operator navigation " +
  "is exposed.";

export default function CoachNotPermittedScreen({ returnHref }: { returnHref?: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", px: 2, py: { xs: 4, md: 8 } }}>
      <Paper
        variant="outlined"
        sx={{ maxWidth: 640, p: { xs: 2.5, md: 5 }, width: "100%" }}
        data-testid="coach-not-permitted"
      >
        <Stack spacing={3} sx={{ alignItems: "flex-start" }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            {COACH_NOT_PERMITTED_HEADING}
          </Typography>
          <Typography color="text.secondary">{COACH_NOT_PERMITTED_MESSAGE}</Typography>
          <Alert severity="info" sx={{ width: "100%" }} data-testid="coach-withheld">
            {COACH_NOT_PERMITTED_WITHHELD}
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
