import { EmptyState } from "@/components/empty-state";
import { NotRecorded } from "@/components/fact";
import { StatusChip } from "@/components/status-chip";
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
  readOperatorDirectory,
  type DirectoryOperator,
  type OperatorDirectory,
} from "@/lib/services/administration-directory";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import AdminPageHeading from "../page-heading";
import {
  accountStateLabel,
  describeInvitationProgress,
  describeSeats,
  operatorSections,
} from "../presentation";

/**
 * **Operators** — the first of Administration's two destinations. LAN-133.
 * Sections in catalogue group order (`DEC-administration-navigation`).
 * Account state and role state are two columns, deliberately
 * (`REQ-admin-surfaces`, `REQ-deactivate-and-reinstate`). Table from `md`
 * up, cards below — same fields, none dropped.
 */
export default async function OperatorsPage() {
  const gate = await gateShellPage("/operate/admin/operators", "role_management");
  if ("screen" in gate) return gate.screen;

  let directory: OperatorDirectory;
  try {
    directory = await readOperatorDirectory(gate.operator);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen title="Operators" message={error.message} testId="operators-unavailable" />
    );
  }

  const sections = operatorSections(directory.operators);
  const count = directory.operators.length;

  return (
    <Stack spacing={3}>
      <AdminPageHeading
        title="Operators"
        subtitle={[
          // LAN-141 finding 8: committee year is a label — a gap year used to take this page down entirely.
          directory.committeeYear?.label ?? "No committee year recorded",
          `${count} ${count === 1 ? "operator account" : "operator accounts"}`,
        ].join(" · ")}
        help
        actions={
          <Button variant="contained" href="/operate/admin/operators/new" sx={{ minHeight: 44 }}>
            Invite operator
          </Button>
        }
      />

      {count === 0 ? (
        <EmptyState title="Nobody has an operator account yet" testId="operators-empty" />
      ) : (
        sections.map((section) => (
          <Box component="section" key={section.code || "unassigned"}>
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
              {section.label}
            </Typography>

            <DesktopOnly>
              <TableFrame>
                <Table size="small" aria-label={section.label}>
                  {/* Fixed column proportions — a failed-invitation paragraph would otherwise reshape the whole section. */}
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: "24%" }}>Name</TableCell>
                      <TableCell sx={{ width: "22%" }}>Current roles</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>Account status</TableCell>
                      <TableCell sx={{ width: "34%" }}>Invitation</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {section.operators.map((operator) => (
                      <TableRow key={operator.operatorAccountId} hover data-testid="operator-row">
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {operator.displayName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {operator.loginEmail ?? <NotRecorded />}
                          </Typography>
                        </TableCell>
                        <TableCell>{describeSeats(operator.roles)}</TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          <StatusChip
                            domain="operator"
                            status={operator.state}
                            label={accountStateLabel(operator.state)}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {describeInvitationProgress(operator)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            href={`/operate/admin/operators/${operator.operatorAccountId}`}
                            sx={{ textTransform: "none" }}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            </DesktopOnly>

            <RowCardList>
              {section.operators.map((operator) => (
                <OperatorCard key={operator.operatorAccountId} operator={operator} />
              ))}
            </RowCardList>
          </Box>
        ))
      )}
    </Stack>
  );
}

/** The 375px presentation of one row. Same facts, stacked. */
function OperatorCard({ operator }: { operator: DirectoryOperator }) {
  return (
    <RowCard
      testId="operator-card"
      title={operator.displayName}
      href={`/operate/admin/operators/${operator.operatorAccountId}`}
      chips={
        <StatusChip
          domain="operator"
          status={operator.state}
          label={accountStateLabel(operator.state)}
        />
      }
      sublines={[
        operator.loginEmail ?? <NotRecorded />,
        describeSeats(operator.roles),
        describeInvitationProgress(operator),
      ]}
    />
  );
}
