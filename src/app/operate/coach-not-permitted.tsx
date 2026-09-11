import { Refusal } from "@/components/refusal";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { signOut } from "../login/actions";

// UX-96 — an active operator who cannot record attendance, LAN-110. `returnHref`
// shown only when real — `slice-ux.md` § 7.

const COACH_NOT_PERMITTED_HEADING = "You cannot record attendance for this event";

const COACH_NOT_PERMITTED_MESSAGE =
  "This account does not have an active Head Coach, Offensive Coordinator or Defensive " +
  "Coordinator assignment for this scope.";

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
