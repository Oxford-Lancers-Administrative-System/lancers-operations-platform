import { redirect } from "next/navigation";
import { gateShellPage } from "./gate";
import NotPermittedScreen from "./not-permitted";
import { firstPermittedDestination } from "./destinations";

/**
 * `/operate` — account-state resolution, and the way in. Not a Home page.
 *
 * `docs/ux/slice-ux.md` § 3 and § 4: the shell has no Home destination, and
 * "after authentication, the shell opens the first destination permitted by the
 * operator's capability map". So an active operator never stays here; they are
 * sent to that destination. What remains at this route is the two account
 * states — UX-03 and UX-04, rendered by the gate — and the refusal that applies
 * when an operator's roles permit no destination at all.
 *
 * Adding content here would create the Home page the UX contract removed.
 */
export default async function OperatePage() {
  const gate = await gateShellPage("/operate");
  if ("screen" in gate) return gate.screen;

  const destination = firstPermittedDestination(gate.operator.roleCodes);
  if (destination) {
    redirect(destination.href);
  }

  // Unreachable while Roster is open to every operator, and deliberately still
  // written: the day a destination gains a capability, an operator with none of
  // them must get a refusal that says what is needed, not an empty shell.
  return (
    <NotPermittedScreen requirement="No destination in the operator shell is currently open to your role assignments." />
  );
}
