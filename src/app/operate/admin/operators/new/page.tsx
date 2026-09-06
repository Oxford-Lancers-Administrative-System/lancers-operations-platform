import Stack from "@mui/material/Stack";
import { isServiceError } from "@/lib/db";
import { readRoleCatalogue } from "@/lib/services/administration-directory";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../../gate";
import AdminPageHeading from "../../page-heading";
import InviteOperatorForm, { type AssignableRole } from "./invite-form";

/**
 * **Invite operator** — the flow behind the Operators page's primary action.
 * LAN-133.
 *
 * The seat list is read from the catalogue rather than written here, for the
 * same two reasons everything else in Administration reads it: it is the
 * approved twenty (`REQ-static-role-catalogue`) in the approved group order,
 * and `tests/capability-map-single-source.test.ts` allows no module in `src/`
 * outside the capability map to name a `roles.code`.
 *
 * Every seat is offered, including the ten coaching ones —
 * `REQ-coach-operator-onboarding`: "All ten fixed coaching roles may be invited
 * as operators", and coaching onboarding "neither requires nor automatically
 * creates player membership". Nothing on this page creates a membership.
 */
export default async function InviteOperatorPage() {
  const gate = await gateShellPage("/operate/admin/operators/new", "role_management");
  if ("screen" in gate) return gate.screen;

  let roles: AssignableRole[];
  try {
    const catalogue = await readRoleCatalogue(gate.operator);
    roles = catalogue.groups.flatMap((group) =>
      group.roles.map((role) => ({
        code: role.code,
        label: role.label,
        groupLabel: group.label,
      })),
    );
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title="Invite operator"
        message={error.message}
        testId="invite-unavailable"
      />
    );
  }

  return (
    <Stack spacing={3}>
      <AdminPageHeading
        title="Invite operator"
        subtitle="One guided account and role flow"
        back={{ href: "/operate/admin/operators", label: "Back to operators" }}
      />

      <InviteOperatorForm roles={roles} />
    </Stack>
  );
}
