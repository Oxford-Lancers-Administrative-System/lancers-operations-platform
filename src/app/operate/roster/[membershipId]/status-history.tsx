import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { MembershipStatusEvent } from "@/lib/services/membership";
import { formatWhen, labelFor, MEMBERSHIP_STATUS_LABELS } from "../presentation";

/** This membership's status transitions, oldest to newest, each with its actor and reason. */
export default function StatusHistory({ history }: { history: readonly MembershipStatusEvent[] }) {
  if (history.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }} data-testid="status-history-empty">
        No recorded transition for this membership.
      </Typography>
    );
  }
  return (
    <Stack data-testid="status-history">
      {history.map((event, index) => {
        const from = event.fromStatus
          ? labelFor(MEMBERSHIP_STATUS_LABELS, event.fromStatus)
          : "Created as";
        const to = labelFor(MEMBERSHIP_STATUS_LABELS, event.toStatus);
        return (
          <Box
            key={`${event.toStatus}-${event.occurredAt.toISOString()}-${index}`}
            sx={{ py: 1.25, borderTop: index === 0 ? "none" : 1, borderColor: "divider" }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Status
            </Typography>
            <Typography variant="body2">
              {event.fromStatus ? `${from} → ${to}` : `${from} ${to.toLowerCase()}`}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="p">
              <time dateTime={event.occurredAt.toISOString()}>{formatWhen(event.occurredAt)}</time>
              {" · "}
              {event.actorName ?? event.actorLabel ?? "a named process"}
              {event.reason ? ` · ${event.reason}` : ""}
            </Typography>
          </Box>
        );
      })}
    </Stack>
  );
}
