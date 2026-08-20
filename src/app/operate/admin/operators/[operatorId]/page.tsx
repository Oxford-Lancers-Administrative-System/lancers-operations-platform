import { notFound } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { readOperatorAuditHistory } from "@/lib/services/administration-audit";
import {
  readOperatorRecord,
  readPlayerMembership,
  type DirectoryOperator,
  type PlayerMembershipSummary,
} from "@/lib/services/administration-directory";
import { operatorAccountState } from "@/lib/services/operator-account-state";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../../gate";
import AdminPageHeading from "../../page-heading";
import { permittedAccountActions } from "../../permissions";
import {
  accountStateColour,
  accountStateLabel,
  describePeriod,
  formatInstant,
  membershipStatusLabel,
  sectionLabelForGroup,
} from "../../presentation";
import AdministrationHistory from "../../history";
import { ArrivalNotice, OutcomeSlotProvider } from "../../outcome";
import OperatorActions from "./operator-actions";

/**
 * One operator's record — LAN-133.
 *
 * ## The separation this page exists to make visible
 *
 * `REQ-admin-surfaces`: operator detail "uses club-facing labels and
 * distinguishes operator account state from role state". Two panels, and the
 * line between them is the whole design:
 *
 *   * **Operator account** — can this person sign in, and what happened to the
 *     invitation. One of five states, in the club's own words.
 *   * **Current relationships** — what the club has asked them to do, and
 *     whether they are also a player this season
 *     (`DEC-one-person-multiple-capacities`: one Person, one login, several
 *     capacities).
 *
 * A deactivated Vice-President reads *Deactivated* on the left and
 * *Vice-President* on the right at the same time, which is exactly what
 * `REQ-deactivate-and-reinstate` requires and what a single merged "status"
 * could not express.
 *
 * ## The delivery failure reason is rendered here — LAN131-A5
 *
 * When an invitation is opened and then abandoned, the account cannot be
 * invited again, and the reason recorded against it says so and says what to do
 * instead. Independent review of `WP-invitation` confirmed the escape route
 * works and that its **discoverability** was the open half: the sentence was
 * written to `invitation_delivery_failure_reason` and rendered nowhere. It is
 * on this page, beside the state that produced it, and in the list's invitation
 * column as well — a Delivery failed badge with no reason beside it is the
 * defect that finding names.
 */
export default async function OperatorRecordPage({
  params,
  searchParams,
}: PageProps<"/operate/admin/operators/[operatorId]">) {
  const { operatorId } = await params;
  const gate = await gateShellPage(`/operate/admin/operators/${operatorId}`, "role_management");
  if ("screen" in gate) return gate.screen;

  let operator: DirectoryOperator | null;
  let membership: PlayerMembershipSummary | null = null;
  let history: Awaited<ReturnType<typeof readOperatorAuditHistory>> = [];

  try {
    operator = await readOperatorRecord(gate.operator, operatorId);
    if (operator) {
      membership = await readPlayerMembership(gate.operator, operator.personId);
      history = await readOperatorAuditHistory(gate.operator, operator.personId);
    }
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title="Operator"
        message={error.message}
        testId="operator-record-unavailable"
      />
    );
  }

  if (!operator) notFound();

  const definition = operatorAccountState(operator.state);
  const permitted = await permittedAccountActions(gate.operator, operator.personId);
  const notice = noticeFor(await searchParams);

  return (
    <OutcomeSlotProvider>
      <Stack spacing={3}>
        <AdminPageHeading
          title={operator.displayName}
          subtitle="Operator account and current roles"
        />

        <Link href="/operate/admin/operators" variant="body2">
          Back to Operators
        </Link>

        {notice ? <ArrivalNotice severity={notice.severity} message={notice.message} /> : null}

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          <Paper variant="outlined" sx={{ p: 2 }} data-testid="operator-account-panel">
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Operator account
            </Typography>

            <Stack spacing={1.5}>
              <Box>
                <Chip
                  label={accountStateLabel(operator.state)}
                  color={accountStateColour(operator.state)}
                  variant={operator.state === "active" ? "filled" : "outlined"}
                  data-testid="account-state-chip"
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {definition.description}
                </Typography>
              </Box>

              {/*
              LAN131-A5. The transport's own sentence, shown wherever Delivery
              failed is. It is the only place an administrator is told that an
              invitation which was opened and abandoned is recovered through
              Forgot password rather than through another invitation.
            */}
              {operator.state === "delivery_failed" && operator.deliveryFailureReason ? (
                <Alert severity="warning" data-testid="delivery-failure-reason">
                  {operator.deliveryFailureReason}
                </Alert>
              ) : null}

              <Fact label="Sign-in email" value={operator.loginEmail ?? "None recorded"} />
              <Fact
                label="Invitation sent"
                value={
                  operator.invitedAt ? formatInstant(operator.invitedAt) : "No invitation recorded"
                }
              />
              <Fact
                label="Accepted"
                value={operator.activatedAt ? formatInstant(operator.activatedAt) : "Not yet"}
              />
              {operator.deliveryFailedAt ? (
                <Fact label="Delivery failed" value={formatInstant(operator.deliveryFailedAt)} />
              ) : null}
              {operator.emailRehomePendingAt ? (
                <Fact
                  label="Email change started"
                  value={formatInstant(operator.emailRehomePendingAt)}
                />
              ) : null}
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }} data-testid="operator-relationships-panel">
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Current relationships
            </Typography>

            <Stack spacing={1.5}>
              {operator.roles.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  This person holds no club role at the moment. Their account still exists and their
                  history is unchanged.
                </Typography>
              ) : (
                operator.roles.map((role) => (
                  <Box key={role.roleAssignmentId}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {role.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {sectionLabelForGroup(role.groupCode, role.groupLabel)} ·{" "}
                      {describePeriod(role)}
                    </Typography>
                  </Box>
                ))
              )}

              <Divider />

              <Fact
                label="Player"
                value={
                  membership
                    ? `${membershipStatusLabel(membership.status)} · ${membership.seasonLabel}`
                    : "No current player membership"
                }
              />
            </Stack>
          </Paper>
        </Box>

        <Box component="section">
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Account actions
          </Typography>
          <OperatorActions
            operatorAccountId={operator.operatorAccountId}
            state={operator.state}
            resendAvailable={definition.resendAvailable}
            loginEmail={operator.loginEmail}
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
              Operator audit history
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Account and role events affecting this person
            </Typography>
          </Stack>
          <AdministrationHistory
            entries={history}
            emptyMessage="Nothing has been recorded against this operator yet."
            testId="operator-audit-history"
            identify="role"
          />
        </Box>
      </Stack>
    </OutcomeSlotProvider>
  );
}

/** One labelled fact. A definition list would be heavier than this earns. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

/**
 * The one-word outcome the invitation flow redirects with.
 *
 * A code rather than a sentence: a message carried in a query string is a
 * message the URL can be edited to say anything, and this page would then be
 * repeating a stranger's text back to an administrator as if the application
 * had said it.
 */
function noticeFor(query: Record<string, string | string[] | undefined>): {
  severity: "success" | "warning";
  message: string;
} | null {
  const value = Array.isArray(query.notice) ? query.notice[0] : query.notice;

  if (value === "invited") {
    return {
      severity: "success",
      message:
        "The invitation has been sent. This person follows the link in it to set up their " +
        "sign-in; until then their account stays Invitation pending.",
    };
  }
  if (value === "invited-undelivered") {
    return {
      severity: "warning",
      message:
        "The account and the role are recorded, but the invitation could not be delivered. " +
        "Check the address below, correct it if it is wrong, and send it again.",
    };
  }
  return null;
}
