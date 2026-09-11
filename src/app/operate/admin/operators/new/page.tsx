import Stack from "@mui/material/Stack";
import { isServiceError } from "@/lib/db";
import { readRoleCatalogue } from "@/lib/services/administration-directory";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../../gate";
import AdminPageHeading from "../../page-heading";
import InviteOperatorForm, { type AssignableRole } from "./invite-form";

// Invite operator — LAN-133. Seat list read from the catalogue (`REQ-static-role-catalogue`); nothing here creates a membership. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
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
