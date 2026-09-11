import { notFound } from "next/navigation";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { StatusChip } from "@/components/status-chip";
import { Fact } from "@/components/fact";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
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
  accountStateLabel,
  describePeriod,
  formatInstant,
  membershipStatusLabel,
  sectionLabelForGroup,
} from "../../presentation";
import AdministrationHistory from "../../history";
import { ArrivalNotice, OutcomeSlotProvider } from "@/components/outcome-slot";
import OperatorActions from "./operator-actions";

/**
 * One operator's record — LAN-133. Two panels: **Operator account** (can
 * they sign in, one of five states) and **Current relationships** (roles
 * and player membership) — `DEC-one-person-multiple-capacities`.
 * LAN131-A5: the delivery-failure reason is rendered here, beside the state
 * that produced it, and in the list's invitation column.
 * Decision history: docs/operating-the-slice.md
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
          back={{ href: "/operate/admin/operators", label: "Back to operators" }}
        />

        {notice ? <ArrivalNotice severity={notice.severity}>{notice.message}</ArrivalNotice> : null}

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          <Box data-testid="operator-account-panel">
            <Section title="Operator account">
              <Stack spacing={1.5}>
                <Box>
                  <StatusChip
                    domain="operator"
                    status={operator.state}
                    label={accountStateLabel(operator.state)}
                    testId="account-state-chip"
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {definition.description}
                  </Typography>
                </Box>

                {/* LAN131-A5: the transport's own sentence, wherever "Delivery failed" is. */}
                {operator.state === "delivery_failed" && operator.deliveryFailureReason ? (
                  <Notice severity="warning" testId="delivery-failure-reason">
                    {operator.deliveryFailureReason}
                  </Notice>
                ) : null}

                <Fact label="Sign-in email" value={operator.loginEmail ?? "None recorded"} />
                <Fact
                  label="Invitation sent"
                  value={
                    operator.invitedAt
                      ? formatInstant(operator.invitedAt)
                      : "No invitation recorded"
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
            </Section>
          </Box>

          <Box data-testid="operator-relationships-panel">
            <Section title="Current relationships">
              <Stack spacing={1.5}>
                {operator.roles.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    This person holds no club role at the moment. Their account still exists and
                    their history is unchanged.
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
            </Section>
          </Box>
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

/**
 * The one-word outcome code the invitation flow redirects with — not a
 * free-text message, which the URL could be edited to make the application
 * appear to say anything.
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
