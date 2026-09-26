import { ADD_TO_ROSTER } from "@/lib/auth/roster-access";
import { gateShellPage } from "../../gate";
import ReturnerIntakeForm from "./returner-intake-form";

export default async function NewReturnerPage() {
  const gate = await gateShellPage("/operate/roster/new", ADD_TO_ROSTER);
  if ("screen" in gate) return gate.screen;

  return <ReturnerIntakeForm />;
}
