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
 * UX-51 — W6-02's own table, one row per attempt per channel, replacing the
 * per-invitee table this screen drew before OWNER-LAN173-02: Person, Channel,
 * Attempt, When, Outcome, Provider reference, exactly as the mockup draws it,
 * and nothing this screen shows an RSVP column for any more — RSVP stays on
 * the per-invitee overview's own vocabulary instead of being repeated here
 * against data this table was never the RSVP's source of truth for.
 *
 * Includes the automatic email fallback's own attempts, which a per-invitee
 * table could not show at all: that shape is one row per invitee, and a
 * fallback is a second job for the same person, not a second invitee.
 *
 * No message content, ever. Status narrows by the attempt's own recorded
 * outcome ({@link matchesAttemptStatusFilter}) and Search narrows by name, the
 * same two controls W6-02 draws and no others — the mockup's second dropdown,
 * "Entry", is dropped rather than guessed at (OWNER-LAN173-01's reasoning
 * applies here too: no spec text defines what it would filter).
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
