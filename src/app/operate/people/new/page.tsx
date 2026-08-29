import { gateShellPage } from "../../gate";
import CreatePersonForm from "./create-person-form";

/**
 * `/operate/people/new` — W3-01 … W3-07. LAN-185, `REQ-create-without-roles`.
 *
 * Four-role only, the same gate the person record and the missing-data queue
 * open with. The page reads nothing beyond the gate: every duplicate-check
 * query and every write happens inside the server action, after it has
 * authorized its own caller.
 */
export default async function AddPersonPage() {
  const gate = await gateShellPage("/operate/people/new", "person_record_authority");
  if ("screen" in gate) return gate.screen;

  return <CreatePersonForm />;
}
