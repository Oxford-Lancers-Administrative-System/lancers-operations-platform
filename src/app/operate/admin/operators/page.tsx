import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
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
  readOperatorDirectory,
  type DirectoryOperator,
  type OperatorDirectory,
} from "@/lib/services/administration-directory";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import AdminPageHeading from "../page-heading";
import {
  accountStateColour,
  accountStateLabel,
  describeInvitationProgress,
  describeSeats,
  operatorSections,
} from "../presentation";

/**
 * **Operators** — the first of Administration's two destinations. LAN-133.
 *
 * ## What the reviewed prototype fixes here
 *
 * Three things, and all three are `DEC-administration-navigation` rather than
 * taste: the sections are Standing Officers, Club Officers and Coaches, in the
 * catalogue's group order; **Invite operator** is the top-right primary action;
 * and the guide is reached from the compact question-mark link beside the
 * heading rather than from a callout or a third sidebar entry.
 *
 * ## Account state and role state are two columns, deliberately
 *
 * `REQ-admin-surfaces` requires operator surfaces to "distinguish operator
 * account state from role state", and this is the list's half of that. **Current
 * roles** says what the club has asked this person to do; **Account status**
 * says whether they can sign in. `REQ-deactivate-and-reinstate` is the reason
 * that separation has to survive contact with a real screen: deactivating
 * access "does not end organizational roles, make a role pending or create a
 * vacancy", so a deactivated Vice-President is a row reading *Vice-President*
 * and *Deactivated* at the same time, and one merged column could not say it.
 *
 * ## Two shapes, one set of facts
 *
 * A wide table from `md` up and cards below it — the roster's precedent, and for
 * the same reason: an operator scanning eight accounts for the one that never
 * accepted its invitation is doing comparison work, which a table does and a
 * stack of cards does not. At 375px the same fields are stacked, none dropped;
 * the invitation line in particular stays, because it is the only place the
 * delivery failure reason appears outside the record itself.
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
        subtitle={`${directory.committeeYear.label} · ${count} ${
          count === 1 ? "operator account" : "operator accounts"
        }`}
        help
        actions={
          <Button variant="contained" href="/operate/admin/operators/new" sx={{ minHeight: 44 }}>
            Invite operator
          </Button>
        }
      />

      {count === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }} data-testid="operators-empty">
          <Typography variant="subtitle1" component="h2" gutterBottom>
            Nobody has an operator account yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Inviting somebody creates their sign-in and gives them the role they are being invited
            to do. It does not make them a player.
          </Typography>
        </Paper>
      ) : (
        sections.map((section) => (
          <Box component="section" key={section.code || "unassigned"}>
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
              {section.label}
            </Typography>

            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ display: { xs: "none", md: "block" } }}
            >
              <Table size="small" aria-label={section.label}>
                {/*
                  The proportions are fixed rather than left to the content.
                  A delivery failure carries the transport's own sentence, which
                  is a paragraph, and an auto-sized table gives that paragraph
                  the room by taking it from the name and the roles beside it —
                  so one failed invitation reshapes the whole section.
                */}
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
                          {operator.loginEmail ?? "No sign-in address recorded"}
                        </Typography>
                      </TableCell>
                      <TableCell>{describeSeats(operator.roles)}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Chip
                          size="small"
                          label={accountStateLabel(operator.state)}
                          color={accountStateColour(operator.state)}
                          variant={operator.state === "active" ? "filled" : "outlined"}
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
            </TableContainer>

            <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>
              {section.operators.map((operator) => (
                <OperatorCard key={operator.operatorAccountId} operator={operator} />
              ))}
            </Stack>
          </Box>
        ))
      )}
    </Stack>
  );
}

/** The 375px presentation of one row. Same facts, stacked. */
function OperatorCard({ operator }: { operator: DirectoryOperator }) {
  return (
    <Card variant="outlined" data-testid="operator-card">
      <CardActionArea
        href={`/operate/admin/operators/${operator.operatorAccountId}`}
        sx={{ p: 2, display: "block", textAlign: "left" }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {operator.displayName}
          </Typography>
          <Chip
            size="small"
            label={accountStateLabel(operator.state)}
            color={accountStateColour(operator.state)}
            variant={operator.state === "active" ? "filled" : "outlined"}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {operator.loginEmail ?? "No sign-in address recorded"}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {describeSeats(operator.roles)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {describeInvitationProgress(operator)}
        </Typography>
      </CardActionArea>
    </Card>
  );
}
