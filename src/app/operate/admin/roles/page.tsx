import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
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
import { describeHolders, permissionsLine } from "../presentation";

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
      <AdminPageHeading
        title="Roles"
        subtitle={`${catalogue.committeeYear.label} · current holders`}
        help
      />

      <Typography variant="body2" color="text.secondary">
        These are the club&rsquo;s approved roles. What each one can do is read from the same
        definition the application enforces, and neither the roles nor what they can do are editable
        here — only who holds them.
      </Typography>

      {catalogue.groups.map((group) => (
        <Box component="section" key={group.code}>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
            {group.label}
          </Typography>

          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ display: { xs: "none", md: "block" } }}
          >
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
                    <TableCell sx={{ fontWeight: 600 }}>{role.label}</TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        color={role.vacant ? "text.secondary" : "text.primary"}
                      >
                        {describeHolders(role)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {permissionsLine(role.code)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        href={`/operate/admin/roles/${role.id}`}
                        sx={{ textTransform: "none" }}
                      >
                        {role.vacant && !role.cycleMissing ? "Assign" : "View"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>
            {group.roles.map((role) => (
              <RoleCard key={role.id} role={role} />
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

/** The 375px presentation of one seat. */
function RoleCard({ role }: { role: CatalogueRole }) {
  return (
    <Card variant="outlined" data-testid="role-card">
      <CardActionArea
        href={`/operate/admin/roles/${role.id}`}
        sx={{ p: 2, display: "block", textAlign: "left" }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {role.label}
        </Typography>
        <Typography variant="body2" color={role.vacant ? "text.secondary" : "text.primary"}>
          {describeHolders(role)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {permissionsLine(role.code)}
        </Typography>
      </CardActionArea>
    </Card>
  );
}
