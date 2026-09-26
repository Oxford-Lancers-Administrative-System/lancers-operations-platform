import { gateShellPage } from "../../gate";
import CreatePersonForm from "./create-person-form";
import { PERSON_RECORD_BRIDGE } from "@/lib/auth/grants";

export default async function AddPersonPage() {
  // LAN-429 bridge: replaced by LAN-432
  const gate = await gateShellPage("/operate/people/new", PERSON_RECORD_BRIDGE);
  if ("screen" in gate) return gate.screen;

  return <CreatePersonForm />;
}
