import { Refusal } from "@/components/refusal";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { signOut } from "../login/actions";

// UX-05 — an active operator whose current roles do not permit the action. Decision history: docs/ux/tickets/LAN-73-shell-and-access.md.

const NOT_PERMITTED_HEADING = "You do not have access to this action";

const NOT_PERMITTED_MESSAGE =
  "Your operator profile is active, but your current role assignments do not permit " +
  "this action.";

export default function NotPermittedScreen({
  requirement,
  returnHref,
}: {
  requirement: string;
  returnHref?: string;
}) {
  const signOutControl = (
    <Box component="form" action={signOut}>
      <Button type="submit" variant="outlined">
        Sign out
      </Button>
    </Box>
  );
  return (
    <Refusal
      title={NOT_PERMITTED_HEADING}
      message={NOT_PERMITTED_MESSAGE}
      requirement={requirement}
      testId="operator-not-permitted"
      action={
        returnHref ? { href: returnHref, label: "Return to an authorized area" } : signOutControl
      }
      secondary={returnHref ? signOutControl : undefined}
    />
  );
}
