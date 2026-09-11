import { gateShellPage } from "../../gate";
import CreatePersonForm from "./create-person-form";

export default async function AddPersonPage() {
  const gate = await gateShellPage("/operate/people/new", "person_record_authority");
  if ("screen" in gate) return gate.screen;

  return <CreatePersonForm />;
}
