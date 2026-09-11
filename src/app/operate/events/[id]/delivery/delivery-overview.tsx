import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { Fact, FactGrid } from "@/components/fact";
import { Metric, MetricRow } from "@/components/metric";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { MAX_ATTEMPTS, type EventDelivery } from "@/lib/services/delivery";
import {
  deliveryRowLabel,
  formatAttemptTime,
  matchesStatusFilter,
  NEEDS_ATTENTION_HEADING,
  NEEDS_ATTENTION_NOTE,
  NO_ACTION_NEEDED,
  OPEN_THEIR_RECORD,
  OVERVIEW_FACTS,
  VIEW_DIAGNOSTICS,
} from "./presentation";

/** UX-50 — the four counts and what the club's delivery actually is. */
export function Overview({ delivery, basePath }: { delivery: EventDelivery; basePath: string }) {
  const { counts } = delivery;

  return (
    <Stack spacing={3}>
      <MetricRow columns={4} testId="delivery-counts">
        <Metric value={counts.audience} label="Audience" testId="count-audience" />
        <Metric value={counts.delivered} label="Delivered" testId="count-delivered" />
        <Metric value={counts.queued + counts.attempted} label="Queued" testId="count-queued" />
        <Metric value={counts.failed + counts.retryable} label="Failed" testId="count-failed" />
      </MetricRow>

      {/*
        LAN-156, at the visual gate. A held message is the one state this screen
        exists to make visible, and it had none: the amend screen said messages
        were held and this screen showed them as Queued. The tile appears only
        when there are held messages, so an event nobody has amended is
        unchanged.

        R156-B3. This used to add "Re-notify to send the change", which told
        the operator that Re-notify sends the held message itself. Re-notify
        writes a separate notice job and nothing in the repository ever
        clears `held_at`, so that was a release condition this build does not
        implement. Says only what happened, and stops.
      */}
      {counts.held > 0 ? (
        <Notice severity="warning" testId="delivery-held">
          {counts.held === 1
            ? "1 message is held after a change to this event."
            : `${counts.held} messages are held after a change to this event.`}
        </Notice>
      ) : null}

      {delivery.rows.length === 0 ? (
        // § 9's Empty: distinguish "nothing yet" from "nothing matched". This is
        // system-empty — no invitation job exists for this event.
        //
        // The sentence used to assert the cause ("Invitations and their delivery
        // are created when the event is approved"), which is false on an event
        // that IS approved and whose invitations were never dispatched — the
        // state Brian found. It now says what is true and stops.
        <EmptyState
          title="No invitations have been sent for this event."
          testId="delivery-empty"
          action={{ href: `/operate/events/${delivery.eventId}`, label: "Back to event" }}
        />
      ) : null}

      <FactGrid columns={2}>
        {OVERVIEW_FACTS.map((fact) => (
          <Fact key={fact.label} label={fact.label} value={fact.value} note={fact.note} />
        ))}
      </FactGrid>

      <NeedsAttention delivery={delivery} />

      <Box>
        <Button
          variant="contained"
          href={`${basePath}?view=diagnostics`}
          disabled={delivery.rows.length === 0}
          sx={{ minHeight: 44 }}
        >
          {VIEW_DIAGNOSTICS}
        </Button>
      </Box>
    </Stack>
  );
}

/**
 * W6's own screen: everybody `matchesStatusFilter(row.state, "attention")`
 * selects, and what — if anything — an operator does about each. Brian,
 * 2026-08-25: retries and the email fallback are automatic and offer no
 * action; only a missing route is a person's job, and what it needs is a
 * roster fix rather than a message.
 *
 * Renders nothing when nobody needs attention — an event with every message
 * delivered has nothing here to say, and a heading over an empty list would
 * be a fact about nothing.
 */
function NeedsAttention({ delivery }: { delivery: EventDelivery }) {
  const rows = delivery.rows.filter((row) => matchesStatusFilter(row.state, "attention"));
  if (rows.length === 0) return null;

  return (
    <Section
      title={NEEDS_ATTENTION_HEADING}
      description={NEEDS_ATTENTION_NOTE}
      testId="needs-attention"
    >
      <Stack spacing={2}>
        {/*
          No `divider` prop — MUI v9's `Stack` divider throws during server
          rendering ("Element type is invalid… got: undefined"), a defect
          `participation-table.tsx` already hit and documented. Borders do
          the same job.
        */}
        <Stack spacing={0}>
          {rows.map((row) => (
            <Stack
              key={row.jobId}
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{
                py: 1.5,
                justifyContent: "space-between",
                alignItems: { sm: "center" },
                borderBottom: 1,
                borderColor: "divider",
                "&:last-of-type": { borderBottom: 0 },
              }}
              data-testid="needs-attention-row"
            >
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {row.inviteeName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.noUsableRoute
                    ? "No usable contact detail on their record — nothing to retry, nothing to fall back to"
                    : row.whatsappUnresponsive
                      ? "WhatsApp did not deliver · reached by email instead"
                      : row.nextAttemptAt
                        ? `Attempt ${row.attemptCount} of ${MAX_ATTEMPTS} · next attempt ${formatAttemptTime(
                            row.nextAttemptAt,
                          )}`
                        : `Attempt ${row.attemptCount} of ${MAX_ATTEMPTS} used`}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <StatusChip
                  domain="delivery"
                  status={
                    row.noUsableRoute
                      ? "no_channel"
                      : row.whatsappUnresponsive
                        ? "whatsapp_unresponsive"
                        : row.state
                  }
                  label={deliveryRowLabel(row)}
                  testId="needs-attention-state"
                />
                {row.noUsableRoute && row.seasonMembershipId ? (
                  <Button
                    size="small"
                    variant="outlined"
                    href={`/operate/roster/${row.seasonMembershipId}`}
                  >
                    {OPEN_THEIR_RECORD}
                  </Button>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {NO_ACTION_NEEDED}
                  </Typography>
                )}
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Section>
  );
}
