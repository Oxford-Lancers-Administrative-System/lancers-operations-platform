import { RowCard, RowCardList, DesktopOnly } from "@/components/row-card";
import { TableFrame } from "@/components/sortable-header";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import {
  readRoleCatalogue,
  type CatalogueRole,
  type RoleCatalogue,
} from "@/lib/services/administration-directory";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import AdminPageHeading from "../page-heading";
import { describeHolders, permissionsPreview } from "../presentation";

/**
 * **Roles** — Administration's second destination, the club's constitution as
 * a page. LAN-133. Current holders only; read-only (no edit affordance).
 */
export default async function RolesPage() {
  const gate = await gateShellPage("/operate/admin/roles", "role_management");
  if ("screen" in gate) return gate.screen;

  let catalogue: RoleCatalogue;
  try {
    catalogue = await readRoleCatalogue(gate.operator);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return <UnavailableScreen title="Roles" message={error.message} testId="roles-unavailable" />;
  }

  return (
    <Stack spacing={3}>
      {/* LAN-141 finding 8: committee year is a label, not a precondition — `committee_years.ends_on` is exclusive so a gap year still draws all seats. */}
      <AdminPageHeading
        title="Roles"
        subtitle={
          catalogue.committeeYear
            ? `${catalogue.committeeYear.label} · current holders`
            : "Current holders · no committee year is recorded as running"
        }
        help
      />

      {catalogue.groups.map((group) => (
        <Box component="section" key={group.code}>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
            {group.label}
          </Typography>

          <DesktopOnly>
            <TableFrame>
              <Table size="small" aria-label={group.label}>
                <TableHead>
                  <TableRow>
                    <TableCell>Role</TableCell>
                    <TableCell>Current holder</TableCell>
                    <TableCell>Permissions</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {group.roles.map((role) => (
                    <TableRow key={role.id} hover data-testid="role-row">
                      {/* Seat name doesn't wrap — "Vice-President" broken after its hyphen reads as two words in a scanned column. */}
                      <TableCell sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                        {role.label}
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          color={role.vacant ? "text.secondary" : "text.primary"}
                        >
                          {describeHolders(role)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ width: "45%" }}>
                        <Typography variant="body2" color="text.secondary">
                          {permissionsPreview(role.code)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          href={`/operate/admin/roles/${role.id}`}
                          sx={{ textTransform: "none" }}
                        >
                          {/* `assignable`, not `!cycleMissing` — a closing season takes no new appointment (LAN-141 findings 2, 4). */}
                          {role.vacant && role.assignable ? "Assign" : "View"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
          </DesktopOnly>

          <RowCardList>
            {group.roles.map((role) => (
              <RoleCard key={role.id} role={role} />
            ))}
          </RowCardList>
        </Box>
      ))}
    </Stack>
  );
}

/** The 375px presentation of one seat. */
function RoleCard({ role }: { role: CatalogueRole }) {
  return (
    <RowCard
      testId="role-card"
      title={role.label}
      href={`/operate/admin/roles/${role.id}`}
      sublines={[describeHolders(role), permissionsPreview(role.code)]}
    />
  );
}
