import { gateShellPage } from "../../gate";
import ReturnerIntakeForm from "./returner-intake-form";

/**
 * `/operate/roster/new` — UX-10, UX-11 and UX-12. LAN-74.
 *
 * The gate is the page's own boundary, independent of the layout's: a page
 * reached in any way that skipped the layout would otherwise render unguarded.
 * No capability is named, because returner intake is an ordinary operator
 * action — the reasoning is in `./actions.ts`, next to the guard that actually
 * enforces it.
 *
 * The page itself reads nothing. Every query this screen makes happens inside
 * the server action, after that action has authorized its own caller, so an
 * unauthorized request never causes a club record to be loaded at all — there
 * is no protected data in the initial payload to leak.
 */
export default async function NewReturnerPage() {
  const gate = await gateShellPage("/operate/roster/new");
  if ("screen" in gate) return gate.screen;

  return <ReturnerIntakeForm />;
}
