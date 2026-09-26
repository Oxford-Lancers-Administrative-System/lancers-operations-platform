import { gateShellPage } from "../../gate";
import CreatePersonForm from "./create-person-form";
import type { GrantRule } from "@/lib/auth/grants";

// LAN-432: creating a person needs Person at edit.
const PERSON_EDIT: GrantRule = { subject: { kind: "roster", key: "person" }, minimum: "edit" };

export default async function AddPersonPage() {
  const gate = await gateShellPage("/operate/people/new", PERSON_EDIT);
  if ("screen" in gate) return gate.screen;

  return <CreatePersonForm />;
}
