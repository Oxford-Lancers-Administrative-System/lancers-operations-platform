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

      {/* LAN-156, R156-B3: held-message tile shown only when there are held messages; says only what happened (Re-notify sends a separate job, not the held one). */}
      {counts.held > 0 ? (
        <Notice severity="warning" testId="delivery-held">
          {counts.held === 1
            ? "1 message is held after a change to this event."
            : `${counts.held} messages are held after a change to this event.`}
        </Notice>
      ) : null}

      {delivery.rows.length === 0 ? (
        // §9 Empty: system-empty (no invitation job exists), not "nothing matched". States only what is true.
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
 * W6: everybody `matchesStatusFilter(row.state, "attention")` selects — a
 * missing route is the only one needing a person's action (Brian, 2026-08-25).
 * Renders nothing when nobody needs attention.
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
        {/* No `divider` prop — MUI v9's Stack divider throws during SSR (participation-table.tsx hit this); borders do the same job. */}
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
