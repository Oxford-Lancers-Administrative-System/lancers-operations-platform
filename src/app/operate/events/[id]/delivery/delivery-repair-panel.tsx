import { Section } from "@/components/section";
import { Fact, FactGrid } from "@/components/fact";
import Stack from "@mui/material/Stack";
import { MAX_ATTEMPTS, type DeliveryRow, type EventDelivery } from "@/lib/services/delivery";
import { RetryDeliveryForm, RevokeAndReissueForm } from "./repair-forms";
import {
  deliveryRowLabel,
  describeRetryability,
  FALLBACK_NOTE,
  FALLBACK_VALUE,
  formatAttemptTime,
  REPAIR_HEADING,
  SAFE_REASON_PREFIX,
  TOKEN_LABELS,
} from "./presentation";

/** UX-52 — one invitee, what happened, and the two repairs. */
export function RepairPanel({
  eventId,
  delivery,
  row,
}: {
  eventId: string;
  delivery: EventDelivery;
  row: DeliveryRow;
}) {
  // The row's own answer, not a re-derivation from the state: Result and Retry
  // are separate axes, so a **Failed** delivery whose cause has been fixed can
  // still be attempted again while attempts remain.
  const retryable = row.retryable;

  return (
    <Section
      title={REPAIR_HEADING}
      description={`${row.inviteeName} · ${delivery.eventName}`}
      testId="repair-panel"
    >
      <Stack spacing={3}>
        <FactGrid columns={2}>
          <Fact
            label="Latest result"
            value={deliveryRowLabel(row)}
            note={
              row.failureReason
                ? `${SAFE_REASON_PREFIX}: ${row.failureReason}`
                : formatAttemptTime(row.lastAttemptAt)
            }
            testId="latest-result"
          />
          <Fact
            label="Retry"
            value={retryable ? "Retryable" : "Not retryable"}
            note={describeRetryability(row.state, row.attemptCount, MAX_ATTEMPTS, retryable)}
            testId="retry-fact"
          />
          <Fact
            label="Token"
            value={TOKEN_LABELS[row.tokenState] ?? row.tokenState}
            note={
              row.tokenState === "live"
                ? "Revoke and reissue available"
                : "A new link is issued with the next attempt"
            }
            testId="token-fact"
          />
          <Fact
            label="Fallback"
            value={FALLBACK_VALUE}
            note={FALLBACK_NOTE}
            testId="fallback-fact"
          />
        </FactGrid>

        <Stack spacing={2} sx={{ maxWidth: 420 }}>
          <RetryDeliveryForm
            eventId={eventId}
            jobId={row.jobId}
            disabled={!retryable}
            disabledReason={describeRetryability(
              row.state,
              row.attemptCount,
              MAX_ATTEMPTS,
              retryable,
            )}
          />
          <RevokeAndReissueForm
            eventId={eventId}
            invitationId={row.invitationId}
            disabled={row.attemptCount >= MAX_ATTEMPTS}
          />
        </Stack>
      </Stack>
    </Section>
  );
}
