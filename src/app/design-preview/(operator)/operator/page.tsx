import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { roleLabel } from "@/lib/auth/capabilities";
import { readOperatorAuditHistory } from "@/lib/services/administration-audit";
import {
  readPlayerMembership,
  type DirectoryOperator,
  type PlayerMembershipSummary,
} from "@/lib/services/administration-directory";
import { operatorAccountState } from "@/lib/services/operator-account-state";
import { Fact, FactList } from "@/components/fact";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Refusal } from "@/components/refusal";
import { Section } from "@/components/section";
import { StatusChip } from "@/components/status-chip";
import { gateShellPage } from "@/app/operate/gate";
import { permittedAccountActions } from "@/app/operate/admin/permissions";
import {
  accountStateLabel,
  describePeriod,
  formatInstant,
  membershipStatusLabel,
  sectionLabelForGroup,
} from "@/app/operate/admin/presentation";
import { pickOperator } from "../../picks";

/**
 * S8 (detail) — one operator's record, on the kit. LAN-225.
 *
 * `/operate/admin/operators/[operatorId]`, content unchanged: the account
 * panel and the relationships panel are two plain `Section`s, the facts are
 * one `Fact`, the state is one `StatusChip`, the back link is in the
 * `PageHeader`, and the account actions are drawn (E11: an outcome would land
 * in the page's `OutcomeSlot`, not inside the panel) — not wired.
 */
export default async function OperatorPreviewPage() {
  const gate = await gateShellPage("/design-preview/operator", "role_management");
  if ("screen" in gate) return gate.screen;

  let operator: DirectoryOperator | null;
  let membership: PlayerMembershipSummary | null = null;
  let history: Awaited<ReturnType<typeof readOperatorAuditHistory>> = [];
  try {
    operator = await pickOperator(gate.operator);
    if (operator) {
      membership = await readPlayerMembership(gate.operator, operator.personId);
      history = await readOperatorAuditHistory(gate.operator, operator.personId);
    }
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <Refusal
        title="Operator"
        message={error.message}
        action={{ href: "/design-preview/operators", label: "Back to operators" }}
      />
    );
  }

  if (!operator) {
    return (
      <Refusal
        title="No operator to show"
        message="The seed has no operator account to open."
        action={{ href: "/design-preview/operators", label: "Back to operators" }}
      />
    );
  }

  const definition = operatorAccountState(operator.state);
  const permitted = await permittedAccountActions(gate.operator, operator.personId);
  const offered = {
    resend: definition.resendAvailable && permitted.resend,
    correct: definition.resendAvailable && permitted.correct,
    recover:
      (operator.state === "active" || operator.state === "email_change_pending") &&
      permitted.recoverEmail,
    deactivate: operator.state !== "deactivated" && permitted.deactivate,
    restore: operator.state === "deactivated" && permitted.restore,
  };
  const anything = Object.values(offered).some(Boolean);

  return (
    <Stack spacing={3}>
      <PageHeader
        eyebrow="Operator"
        title={operator.displayName}
        subtitle="Operator account and current roles"
        back={{ href: "/design-preview/operators", label: "Back to operators" }}
        status={
          <StatusChip
            domain="operator"
            status={operator.state}
            label={accountStateLabel(operator.state)}
            size="medium"
          />
        }
      />

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
        }}
      >
        <Section title="Operator account" description={definition.description} testId="account">
          {operator.state === "delivery_failed" && operator.deliveryFailureReason ? (
            <Box sx={{ mb: 2 }}>
              <Notice severity="warning">{operator.deliveryFailureReason}</Notice>
            </Box>
          ) : null}
          <FactList>
            <Fact
              label="Sign-in email"
              value={operator.loginEmail ?? "None recorded"}
              layout="inline"
            />
            <Fact
              label="Invitation sent"
              value={
                operator.invitedAt ? formatInstant(operator.invitedAt) : "No invitation recorded"
              }
              layout="inline"
            />
            <Fact
              label="Accepted"
              value={operator.activatedAt ? formatInstant(operator.activatedAt) : "Not yet"}
              layout="inline"
            />
            {operator.deliveryFailedAt ? (
              <Fact
                label="Delivery failed"
                value={formatInstant(operator.deliveryFailedAt)}
                layout="inline"
              />
            ) : null}
            {operator.emailRehomePendingAt ? (
              <Fact
                label="Email change started"
                value={formatInstant(operator.emailRehomePendingAt)}
                layout="inline"
              />
            ) : null}
          </FactList>
        </Section>

        <Section title="Current relationships" testId="relationships">
          <FactList>
            {operator.roles.length === 0 ? (
              <Fact
                label="Roles"
                value="This person holds no club role at the moment. Their account still exists and their history is unchanged."
                layout="inline"
              />
            ) : (
              operator.roles.map((role) => (
                <Fact
                  key={role.roleAssignmentId}
                  label={role.label}
                  value={`${sectionLabelForGroup(role.groupCode, role.groupLabel)} · ${describePeriod(role)}`}
                  layout="inline"
                />
              ))
            )}
            <Fact
              label="Player"
              value={
                membership
                  ? `${membershipStatusLabel(membership.status)} · ${membership.seasonLabel}`
                  : "No current player membership"
              }
              layout="inline"
            />
          </FactList>
        </Section>
      </Box>

      <Section title="Account actions" testId="actions">
        {anything ? (
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            {offered.resend ? <Button variant="outlined">Resend invitation</Button> : null}
            {offered.correct ? <Button variant="outlined">Correct email and resend</Button> : null}
            {offered.recover ? <Button variant="outlined">Recover email access</Button> : null}
            {offered.deactivate ? (
              <Button variant="outlined" color="error">
                Deactivate operator access
              </Button>
            ) : null}
            {offered.restore ? <Button variant="contained">Restore operator access</Button> : null}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            There is nothing you can change on this operator&rsquo;s account.
          </Typography>
        )}
      </Section>

      <Section
        title="Operator audit history"
        description="Account and role events affecting this person"
        testId="history"
      >
        {history.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing has been recorded against this operator yet.
          </Typography>
        ) : (
          <FactList>
            {history.map((entry) => (
              <Fact
                key={entry.id}
                label={formatInstant(entry.occurredAt)}
                value={
                  <Stack spacing={0.25}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {entry.label}
                      {entry.role ? ` · ${roleLabel(entry.role.code)}` : ""}
                    </Typography>
                    {entry.reason ? <Typography variant="body2">{entry.reason}</Typography> : null}
                  </Stack>
                }
                provenance={[
                  `By ${entry.actor.name}`,
                  entry.operatingYear.label,
                  entry.backdated ? "backdated" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                layout="inline"
              />
            ))}
          </FactList>
        )}
      </Section>
    </Stack>
  );
}
