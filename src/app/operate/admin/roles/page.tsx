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
 * **Roles** — Administration's second destination, and the club's constitution
 * as a page. LAN-133.
 *
 * ## What it shows, and what it deliberately does not
 *
 * `DEC-administration-navigation`: "Roles appear as Operational Administration,
 * Club Committee, then Coaching Staff; **the top level shows current holders
 * only**." So each row is one seat, this operating year's holder or *Not
 * assigned*, and the seat's Permissions summary. Past holders are on the seat's
 * own page under Holder history, which is where `REQ-append-only-audit-evidence`
 * puts them.
 *
 * The group headings are read from `public.role_groups` rather than written
 * here. `REQ-static-role-catalogue` fixes the three groups and their order in
 * the catalogue migration, and a page that restated them would be a second copy
 * of the club's structure that could disagree with the first.
 *
 * ## No role and no grant is editable — and not as a disabled control
 *
 * `DEC-no-runtime-role-editing` and `REQ-admin-surfaces` are both unambiguous:
 * "the role catalogue and capability map are read-only in the application",
 * "No role or grant is editable". There is therefore no edit affordance on this
 * page at all — not a greyed-out one, which would say the club could edit its
 * constitution here if only the reader had more authority. What the actions on
 * a seat's page change is **who holds it**, which is a different thing and is
 * the whole of this mission.
 *
 * The Permissions text is the projection of the enforced grants
 * (`REQ-capability-copy-consistency`), so it cannot drift from what the server
 * actually allows: there is nowhere else for the sentence to come from.
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
      {/*
        The committee year is a label, not a precondition — LAN-141 finding 8.
        `committee_years.ends_on` is exclusive, so a club that closes one year
        the day before the next opens has a gap, and this page used to refuse to
        draw the club's twenty seats at all during it.
      */}
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
                      {/*
                      The seat's name does not wrap. "Vice-President" broken
                      after its hyphen reads as two words, and the column a
                      reader scans twenty rows down is the one that must stay
                      scannable.
                    */}
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
                          {/*
                          `assignable` rather than `!cycleMissing`: a season in
                          `closing` exists to read and takes no new coaching
                          appointment, so offering Assign there would send the
                          administrator to a form the service is certain to
                          refuse — LAN-141 findings 2 and 4.
                        */}
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
