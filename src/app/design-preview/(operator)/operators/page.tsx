import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
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
  type OperatorDirectory,
} from "@/lib/services/administration-directory";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Refusal } from "@/components/refusal";
import { DesktopOnly, RowCard, RowCardList } from "@/components/row-card";
import { TableFrame } from "@/components/sortable-header";
import { StatusChip } from "@/components/status-chip";
import { gateShellPage } from "@/app/operate/gate";
import { HOW_ADMINISTRATION_WORKS } from "@/app/operate/admin/page-heading";
import {
  accountStateLabel,
  describeInvitationProgress,
  describeSeats,
  operatorSections,
} from "@/app/operate/admin/presentation";

/**
 * S8 — Operators, on the kit. LAN-225.
 *
 * `/operate/admin/operators`, unchanged in content and grouping (H8 stays
 * Brian's): `PageHeader` with the guide link in the subtitle slot, one
 * `StatusChip` vocabulary for the account states, `TableFrame` at desktop and
 * `RowCard` on a phone. Dates in the invitation column come through the
 * admin presentation module; the `Sept` form (A6) is the one listed delta,
 * taken in `formatInstant` on this branch.
 */
export default async function OperatorsPreviewPage() {
  const gate = await gateShellPage("/design-preview/operators", "role_management");
  if ("screen" in gate) return gate.screen;

  let directory: OperatorDirectory;
  try {
    directory = await readOperatorDirectory(gate.operator);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <Refusal
        title="Operators"
        message={error.message}
        action={{ href: "/design-preview", label: "Back to the preview" }}
      />
    );
  }

  const sections = operatorSections(directory.operators);
  const count = directory.operators.length;

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Operators"
        subtitle={
          <>
            {directory.committeeYear?.label ?? "No committee year recorded"} ·{" "}
            {`${count} ${count === 1 ? "operator account" : "operator accounts"}`} ·{" "}
            <Link href="/operate/admin/guide">{HOW_ADMINISTRATION_WORKS}</Link>
          </>
        }
        actions={
          <Button variant="contained" href="/operate/admin/operators/new">
            Invite operator
          </Button>
        }
      />

      {count === 0 ? (
        <EmptyState
          title="Nobody has an operator account yet"
          description="Inviting somebody creates their sign-in and gives them the role they are being invited to do. It does not make them a player."
          action={{ href: "/operate/admin/operators/new", label: "Invite operator" }}
        />
      ) : (
        sections.map((section) => (
          <Stack component="section" spacing={1.5} key={section.code || "unassigned"}>
            <Typography variant="h3" component="h2">
              {section.label}
            </Typography>

            <DesktopOnly>
              <TableFrame>
                <Table size="small" aria-label={section.label}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: "24%" }}>Name</TableCell>
                      <TableCell sx={{ width: "22%" }}>Current roles</TableCell>
                      <TableCell>Account status</TableCell>
                      <TableCell sx={{ width: "34%" }}>Invitation</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {section.operators.map((operator) => (
                      <TableRow key={operator.operatorAccountId} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {operator.displayName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {operator.loginEmail ?? "No sign-in address recorded"}
                          </Typography>
                        </TableCell>
                        <TableCell>{describeSeats(operator.roles)}</TableCell>
                        <TableCell>
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
                          <Button size="small" href="/design-preview/operator">
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
                <RowCard
                  key={operator.operatorAccountId}
                  title={operator.displayName}
                  href="/design-preview/operator"
                  chips={
                    <StatusChip
                      domain="operator"
                      status={operator.state}
                      label={accountStateLabel(operator.state)}
                    />
                  }
                  sublines={[
                    operator.loginEmail ?? "No sign-in address recorded",
                    describeSeats(operator.roles),
                    describeInvitationProgress(operator),
                  ]}
                />
              ))}
            </RowCardList>
          </Stack>
        ))
      )}
    </Stack>
  );
}
