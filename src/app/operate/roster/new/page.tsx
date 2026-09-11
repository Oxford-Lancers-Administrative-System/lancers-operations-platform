import { gateShellPage } from "../../gate";
import ReturnerIntakeForm from "./returner-intake-form";

export default async function NewReturnerPage() {
  const gate = await gateShellPage("/operate/roster/new");
  if ("screen" in gate) return gate.screen;

  return <ReturnerIntakeForm />;
}
