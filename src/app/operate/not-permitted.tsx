import { Refusal } from "@/components/refusal";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
