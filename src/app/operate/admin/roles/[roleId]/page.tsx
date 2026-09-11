import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import { Section } from "@/components/section";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { todayInClubZone } from "@/lib/club-time";
import { isServiceError } from "@/lib/db";
import { readHolderHistory } from "@/lib/services/administration-audit";
import { earliestEndFor } from "@/lib/services/operator-administration";
import {
  readRoleCatalogue,
  type CatalogueGroup,
  type CatalogueRole,
} from "@/lib/services/administration-directory";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../../gate";
import AdminPageHeading from "../../page-heading";
import AdministrationHistory from "../../history";
import { permittedRoleActions } from "../../permissions";
import { limitsLine, NO_CYCLE, permissionsSummary } from "../../presentation";
import CurrentHolderPanel from "./current-holder-panel";
import RoleActions from "./role-actions";

// One seat — LAN-133.
export default async function RoleRecordPage({
  params,
}: PageProps<"/operate/admin/roles/[roleId]">) {
  const { roleId } = await params;
  const gate = await gateShellPage(`/operate/admin/roles/${roleId}`, "role_management");
  if ("screen" in gate) return gate.screen;

  let found: { role: CatalogueRole; group: CatalogueGroup; cycleLabel: string } | null = null;
  let history: Awaited<ReturnType<typeof readHolderHistory>> = [];

  try {
    const catalogue = await readRoleCatalogue(gate.operator);
    for (const group of catalogue.groups) {
      const role = group.roles.find((candidate) => candidate.id === roleId);
      if (role) {
        found = {
          role,
          group,
          cycleLabel:
            role.scope === "committee_year"
              ? (catalogue.committeeYear?.label ?? NO_CYCLE.committee_year)
              : (catalogue.season?.label ?? NO_CYCLE.season),
        };
        break;
      }
    }
    if (found) history = await readHolderHistory(gate.operator, found.role.id);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return <UnavailableScreen title="Role" message={error.message} testId="role-unavailable" />;
  }

  if (!found) notFound();

  const { role, group, cycleLabel } = found;
  const permitted = await permittedRoleActions(
    gate.operator,
    role.code,
    role.holders[0]?.personId ?? null,
  );
  const permissions = permissionsSummary(role.code);
  const limits = limitsLine(role.code);
  const today = todayInClubZone();

  return (
    <Stack spacing={3}>
      <AdminPageHeading
        title={role.label}
        subtitle={`${group.label} · ${cycleLabel}`}
        back={{ href: "/operate/admin/roles", label: "Back to roles" }}
      />

      <Section title="Current holder" testId="current-holder">
        <CurrentHolderPanel role={role} cycleLabel={cycleLabel} />
      </Section>

      <Section title="Permissions">
        {permissions.empty ? (
          <Typography variant="body2" color="text.secondary" data-testid="permissions">
            {permissions.items[0]}
          </Typography>
        ) : (
          <Box data-testid="permissions">
            <List dense disablePadding>
              {permissions.items.map((item) => (
                <ListItem key={item}>
                  <ListItemText primary={`Can ${item}.`} />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
        {limits ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }} data-testid="limits">
            {limits}
          </Typography>
        ) : null}
      </Section>

      <Section title="Role actions">
        <RoleActions
          roleId={role.id}
          roleCode={role.code}
          roleLabel={role.label}
          vacant={role.vacant}
          assignable={role.assignable}
          admitsMultipleHolders={role.admitsMultipleHolders}
          today={today}
          holders={role.holders.map((holder) => ({
            roleAssignmentId: holder.roleAssignmentId,
            displayName: holder.displayName,
            effectiveFrom: holder.effectiveFrom,
            earliestEnd: earliestEndFor(holder),
          }))}
          permitted={permitted}
        />
      </Section>

      <Box component="section">
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { sm: "baseline" }, justifyContent: "space-between", mb: 1.5 }}
        >
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
            Holder history
          </Typography>
          <Typography variant="caption" color="text.secondary">
            This year and past years
          </Typography>
        </Stack>
        <AdministrationHistory
          entries={history}
          emptyMessage={
            role.holders.length > 0 || role.scheduled.length > 0
              ? "No changes to this role have been recorded here. Assignments that came with the club\u2019s records, rather than being made on this screen, appear above."
              : "No changes to this role have been recorded, and nobody is assigned to it."
          }
          testId="holder-history"
          identify="target"
        />
      </Box>
    </Stack>
  );
}
