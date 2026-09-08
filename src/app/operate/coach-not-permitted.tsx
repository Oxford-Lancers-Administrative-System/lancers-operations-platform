import { Refusal } from "@/components/refusal";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
  const signOutControl = (
    <Box component="form" action={signOut}>
      <Button type="submit" variant="outlined">
        Sign out
      </Button>
    </Box>
  );
  return (
    <Refusal
      title={COACH_NOT_PERMITTED_HEADING}
      message={COACH_NOT_PERMITTED_MESSAGE}
      testId="coach-not-permitted"
      action={
        returnHref ? { href: returnHref, label: "Return to an authorized area" } : signOutControl
      }
      secondary={returnHref ? signOutControl : undefined}
    />
  );
}
