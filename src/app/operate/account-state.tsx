import { Refusal } from "@/components/refusal";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { signOut } from "../login/actions";

// UX-03 and UX-04, at `/operate`. Reword nothing without a recorded owner
// decision (LAN-107). Nothing else renders — no name, email, role, counts,
// or shell links. Decision history: docs/ux/tickets/LAN-73-shell-and-access.md.

const UNLINKED_HEADING = "Operator profile not connected";

const UNLINKED_MESSAGE =
  "You’re signed in, but this account is not connected to a Lancers operator " +
  "profile. Contact the club administrator and provide the email address you used " +
  "to sign in.";

const INACTIVE_HEADING = "Operator access inactive";

const INACTIVE_MESSAGE =
  "Your Lancers operator access is inactive. Contact the club administrator if you " +
  "believe access should be restored.";

const COPY = {
  unlinked: { heading: UNLINKED_HEADING, message: UNLINKED_MESSAGE },
  inactive: { heading: INACTIVE_HEADING, message: INACTIVE_MESSAGE },
} as const;

export type AccountStateKind = keyof typeof COPY;

export default function OperatorAccountState({ state }: { state: AccountStateKind }) {
  const { heading, message } = COPY[state];
  return (
    <Box data-state={state}>
      <Refusal
        title={heading}
        message={message}
        testId="operator-account-state"
        action={
          <Box component="form" action={signOut}>
            <Button type="submit" variant="contained">
              Sign out
            </Button>
          </Box>
        }
      />
    </Box>
  );
}
