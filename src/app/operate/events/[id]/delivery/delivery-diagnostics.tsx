import { Section } from "@/components/section";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import { RowCard, RowCardList, DesktopOnly } from "@/components/row-card";
import { TableFrame } from "@/components/sortable-header";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import type { DiagnosticsAttempt, EventDelivery } from "@/lib/services/delivery";
import DeliveryFilters from "./delivery-filters";
import { DIAGNOSTICS_HEADING, formatAttemptTime, matchesAttemptStatusFilter } from "./presentation";

/**
 * UX-51 — W6-02's table: one row per attempt per channel (OWNER-LAN173-02),
 * replacing the per-invitee table. Includes the automatic email fallback's
 * own attempts, which the per-invitee shape couldn't show. No message
 * content, ever. Status and Search only — no "Entry" dropdown (no spec
 * defines what it would filter, per OWNER-LAN173-01).
 */
export function Diagnostics({
  delivery,
  attempts,
  basePath,
  search,
  status,
}: {
  delivery: EventDelivery;
  attempts: readonly DiagnosticsAttempt[];
  basePath: string;
  search: string;
  status: string;
}) {
  const needle = search.trim().toLowerCase();
  const rows = attempts.filter(
    (attempt) =>
      matchesAttemptStatusFilter(attempt.outcome, status) &&
      (needle === "" || attempt.inviteeName.toLowerCase().includes(needle)),
  );

  return (
    <Section
      title={DIAGNOSTICS_HEADING}
      description={`${delivery.eventName} · ${delivery.counts.audience} intended recipients`}
    >
      <Stack spacing={2}>
        <DeliveryFilters basePath={basePath} search={search} status={status} />

        {rows.length === 0 ? (
          <EmptyState
            testId="attempt-log-empty"
            title={
              attempts.length === 0
                ? "Nothing has been attempted for this event yet."
                : "No attempt matches this search."
            }
            searched={search || undefined}
            action={{ href: `${basePath}?view=diagnostics`, label: "Clear filters" }}
          />
        ) : (
          <DesktopOnly>
            <TableFrame>
              <Table size="small" data-testid="attempt-log-table">
                <TableHead>
                  <TableRow>
                    <TableCell>Person</TableCell>
                    <TableCell>Channel</TableCell>
                    <TableCell>Attempt</TableCell>
                    <TableCell>When</TableCell>
                    <TableCell>Outcome</TableCell>
                    <TableCell>Provider reference</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((attempt) => (
                    <TableRow key={attempt.attemptId} data-testid="attempt-log-row">
                      <TableCell sx={{ fontWeight: 600 }}>{attempt.inviteeName}</TableCell>
                      <TableCell>{describeChannel(attempt.channel)}</TableCell>
                      <TableCell>{attempt.attemptNumber}</TableCell>
                      <TableCell>{formatAttemptTime(attempt.requestedAt)}</TableCell>
                      <TableCell>
                        <StatusChip
                          domain="delivery"
                          status={attempt.outcome}
                          label={describeAttemptOutcome(attempt.outcome)}
                        />
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8em" }}>
                        {attempt.providerReference ?? "not recorded"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
          </DesktopOnly>
        )}

        {/* Phone: cards, per § 7. */}
        {rows.length > 0 ? (
          <RowCardList>
            {rows.map((attempt) => (
              <RowCard
                key={attempt.attemptId}
                title={attempt.inviteeName}
                testId="attempt-log-card"
                chips={
                  <StatusChip
                    domain="delivery"
                    status={attempt.outcome}
                    label={describeAttemptOutcome(attempt.outcome)}
                  />
                }
                sublines={[
                  `${describeChannel(attempt.channel)} · attempt ${attempt.attemptNumber} · ${formatAttemptTime(attempt.requestedAt)}`,
                  attempt.providerReference ?? "not recorded",
                ]}
              />
            ))}
          </RowCardList>
        ) : null}
      </Stack>
    </Section>
  );
}

/** The attempt-level outcome, in the same words as the five-state vocabulary. */
function describeAttemptOutcome(outcome: string): string {
  switch (outcome) {
    case "delivered":
      return "Delivered";
    case "failed":
      return "Failed";
    case "rejected":
      return "Failed";
    case "attempted":
      return "Attempted";
    default:
      return "Sent";
  }
}

/** The wireframe's "WhatsApp" and "Email fallback", from the neutral channel. */
function describeChannel(channel: string): string {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "email") return "Email fallback";
  if (channel === "sms") return "SMS fallback";
  return channel;
}
