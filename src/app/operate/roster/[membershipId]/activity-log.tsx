import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { OnboardingActivitySection } from "@/lib/services/player-record";
import { formatWhen } from "../presentation";

// The sectioned activity log — `REQ-activity-log`, `OD7-log-by-section`.
export default function ActivityLog({
  sections,
}: {
  sections: readonly OnboardingActivitySection[];
}) {
  const hasEntries = sections.some((section) => section.entries.length > 0);
  if (!hasEntries) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }} data-testid="activity-log-empty">
        Nothing has been asked of this person yet.
      </Typography>
    );
  }
  const rows = sections.flatMap((section) =>
    section.entries.map((entry, index) => ({ section: section.section, entry, index })),
  );
  return (
    <Stack data-testid="activity-log">
      {rows.map(({ section, entry, index }, position) => (
        <Box
          key={`${section}-${entry.occurredAt.toISOString()}-${index}`}
          sx={{ py: 1.25, borderTop: position === 0 ? "none" : 1, borderColor: "divider" }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {section}
          </Typography>
          <Typography variant="body2">
            {entry.kind === "ask" ? `Asked — ${entry.channel}` : `Answered — ${entry.channel}`}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p">
            <time dateTime={entry.occurredAt.toISOString()}>{formatWhen(entry.occurredAt)}</time>
            {" · "}
            {entry.who}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}
