import { redirect } from "next/navigation";
import { gateShellPage } from "./gate";
import NotPermittedScreen from "./not-permitted";
import { firstPermittedDestination } from "./destinations";

// `/operate` — account-state resolution, not a Home page. Decision history: docs/ux/tickets/LAN-73-shell-and-access.md.
export default async function OperatePage() {
  const gate = await gateShellPage("/operate", undefined, { narrowRecorder: "allow" });
  if ("screen" in gate) return gate.screen;

  const destination = firstPermittedDestination(gate.operator.roleCodes);
  if (destination) {
    redirect(destination.href);
  }

  return (
    <NotPermittedScreen requirement="No destination in the operator shell is currently open to your role assignments." />
  );
}
