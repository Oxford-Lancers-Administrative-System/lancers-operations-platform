import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { readHolderHistory } from "@/lib/services/administration-audit";
import {
  readRoleCatalogue,
  type CatalogueGroup,
  type CatalogueRole,
} from "@/lib/services/administration-directory";
import { operatorAccountState } from "@/lib/services/operator-account-state";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../../gate";
import AdminPageHeading from "../../page-heading";
import AdministrationHistory from "../../history";
import { permittedRoleActions } from "../../permissions";
import {
  accountStateColour,
  describePeriod,
  NOT_ASSIGNED,
  permissionsSummary,
} from "../../presentation";
import RoleActions from "./role-actions";

/**
 * One seat — LAN-133.
 *
 * `REQ-admin-surfaces` names the three things this page presents, and it
 * presents exactly those three: "current holder, a plain-language Permissions
 * summary and holder history".
 *
 * ## The current holder, including when there is not one
 *
 * `DEC-account-state-separation` puts three different situations on this page
 * and each has to read as itself:
 *
 *   * a holder whose operator access is **deactivated** is still the holder,
 *     and the page says so rather than showing a vacancy;
 *   * a successor who is still **Invitation pending** holds the seat "without
 *     capabilities until activation", which is the state chip beside their name;
 *   * **Not assigned** appears only where a role was ended, because only End
 *     role creates a vacancy.
 *
 * ## Permissions
 *
 * `describeRoleCapabilities()` is the projection of the arrays server
 * enforcement reads — `REQ-capability-copy-consistency`, so "a later approved
 * grant change updates authorization and plain-language UI copy together". No
 * sentence on this page is written by hand, and half the catalogue's seats
 * legitimately hold nothing, which is a sentence rather than an empty list.
 *
 * ## The seat itself is not editable
 *
 * `DEC-no-runtime-role-editing`. What the actions below change is who holds it.
 */
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
              ? catalogue.committeeYear.label
              : (catalogue.season?.label ?? "No season under way"),
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

  return (
    <Stack spacing={3}>
      <AdminPageHeading title={role.label} subtitle={`${group.label} · ${cycleLabel}`} />

      <Link href="/operate/admin/roles" variant="body2">
        Back to Roles
      </Link>

      <Paper variant="outlined" sx={{ p: 2 }} data-testid="current-holder">
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Current holder
        </Typography>

        {role.holders.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {role.cycleMissing
              ? "There is no season under way, so this role has no holder to show yet."
              : `${NOT_ASSIGNED}. Nobody holds this role for ${cycleLabel}.`}
          </Typography>
        ) : (
          <Stack spacing={2}>
            {role.holders.map((holder) => (
              <Box key={holder.roleAssignmentId} data-testid="holder">
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
                >
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {holder.operatorAccountId ? (
                      <Link href={`/operate/admin/operators/${holder.operatorAccountId}`}>
                        {holder.displayName}
                      </Link>
                    ) : (
                      holder.displayName
                    )}
                  </Typography>
                  {holder.operatorState ? (
                    <Chip
                      size="small"
                      label={operatorAccountState(holder.operatorState).label}
                      color={accountStateColour(holder.operatorState)}
                      variant={holder.operatorState === "active" ? "filled" : "outlined"}
                    />
                  ) : (
                    <Chip size="small" label="No operator account" variant="outlined" />
                  )}
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {describePeriod(holder)}
                </Typography>
                {holder.accessDeactivated ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    data-testid="holder-deactivated"
                  >
                    Their operator access is deactivated. They still hold this role — the seat is
                    not vacant.
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Stack>
        )}
      </Paper>

      <Box component="section">
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
          Permissions
        </Typography>
        {permissions.empty ? (
          <Typography variant="body2" color="text.secondary" data-testid="permissions">
            {permissions.items[0]}
          </Typography>
        ) : (
          <Paper variant="outlined" data-testid="permissions">
            <List dense disablePadding>
              {permissions.items.map((item) => (
                <ListItem key={item}>
                  <ListItemText primary={`Can ${item}.`} />
                </ListItem>
              ))}
            </List>
          </Paper>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          These come from the same definition the application enforces, so they cannot say one thing
          here and allow another. They are not editable in the application.
        </Typography>
      </Box>

      <Box component="section">
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Role actions
        </Typography>
        <RoleActions
          roleId={role.id}
          roleCode={role.code}
          roleLabel={role.label}
          vacant={role.vacant}
          admitsMultipleHolders={role.admitsMultipleHolders}
          holders={role.holders.map((holder) => ({
            roleAssignmentId: holder.roleAssignmentId,
            displayName: holder.displayName,
          }))}
          permitted={permitted}
        />
      </Box>

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
          emptyMessage="Nothing has been recorded about who holds this role yet."
          testId="holder-history"
        />
      </Box>
    </Stack>
  );
}
