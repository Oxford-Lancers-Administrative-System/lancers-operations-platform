import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { EventChangeEntry } from "@/lib/services/event-amendment";
import {
  CANCEL_EVENT_LABEL,
  CANCELLED_ANSWERS_DETAIL,
  CANCELLED_ANSWERS_HEADING,
  CANCELLED_REASON_HEADING,
  CANCELLED_REASON_INTERNAL,
  cancelledSummary,
  describeHistoryEntry,
  describeTold,
  EDIT_EVENT_LABEL,
  formatRecordedMoment,
  HISTORY_COLUMN_TOLD,
  HISTORY_COLUMN_WHAT,
  HISTORY_COLUMN_WHEN,
  HISTORY_COLUMN_WHO,
  HISTORY_EMPTY,
  HISTORY_HEADING,
} from "./change-presentation";

/**
 * The three panels W5 and W6 add to the event page — LAN-156.
 *
 * They live here rather than in `page.tsx` so that the page's own diff stays
 * small while two sibling work packages are editing the same file. Every one of
 * them is a server component that renders from stored rows; none holds state,
 * and none decides anything.
 */

/**
 * W5-01 — the two ways out of an approved event.
 *
 * Neither exists on `main`: an approved event is terminal there, so a
 * rescheduled practice means telling people in WhatsApp and leaving the record
 * wrong. Both guard themselves server-side; rendering them only for an operator
 * who may press them is the courtesy, not the boundary.
 */
export function ApprovedEventActions({ eventId }: { eventId: string }) {
  return (
    <Stack spacing={1} data-testid="approved-event-actions">
      <Button
        variant="contained"
        href={`/operate/events/${eventId}/amend`}
        fullWidth
        sx={{ minHeight: 44 }}
        data-testid="edit-event"
      >
        {EDIT_EVENT_LABEL}
      </Button>
      <Button
        variant="outlined"
        color="error"
        href={`/operate/events/${eventId}/cancel`}
        fullWidth
        sx={{ minHeight: 44 }}
        data-testid="cancel-event"
      >
        {CANCEL_EVENT_LABEL}
      </Button>
    </Stack>
  );
}

/**
 * W5-05 — actor, change and notify choice, retained and queryable (§4.13).
 *
 * "This is the only place in the mission where somebody changes something
 * people have already acted on, so the history is the point rather than a
 * nicety. It answers the question a committee actually asks three weeks later:
 * who moved it, and were people told?"
 *
 * A table on a wide screen and a stack of rows on a narrow one, which is why it
 * is a CSS grid rather than a `<table>`: at 375px a four-column table either
 * scrolls sideways or truncates the column that matters.
 */
export function ChangeHistoryPanel({ entries }: { entries: readonly EventChangeEntry[] }) {
  return (
    <Section title={HISTORY_HEADING} testId="change-history" collapsible>
      <Stack spacing={2}>
        {entries.length === 0 ? (
          <Typography variant="body2" color="text.secondary" data-testid="history-empty">
            {HISTORY_EMPTY}
          </Typography>
        ) : (
          <Stack component="ul" sx={{ listStyle: "none", p: 0, m: 0 }} spacing={0}>
            {entries.map((entry) => (
              <Box
                component="li"
                key={entry.id}
                sx={{
                  display: "grid",
                  gap: { xs: 0.5, md: 2 },
                  gridTemplateColumns: { xs: "1fr", md: "auto auto 1fr auto" },
                  alignItems: "baseline",
                  py: 1.5,
                  borderBottom: 1,
                  borderColor: "divider",
                }}
                data-testid={`history-${entry.kind}`}
              >
                <Typography variant="body2" color="text.secondary" aria-label={HISTORY_COLUMN_WHEN}>
                  {formatRecordedMoment(entry.occurredAt)}
                </Typography>
                <Typography variant="body2" aria-label={HISTORY_COLUMN_WHO}>
                  {entry.actorName ?? "Not recorded"}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600 }}
                  aria-label={HISTORY_COLUMN_WHAT}
                >
                  {describeHistoryEntry(entry)}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  aria-label={HISTORY_COLUMN_TOLD}
                  data-testid={`history-told-${entry.kind}`}
                >
                  {describeTold(entry.notified, entry.recipients)}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Stack>
    </Section>
  );
}

/**
 * W6-02 — what a cancelled event keeps.
 *
 * "A cancelled event is not deleted, because deleting it would erase the fact
 * that the club planned a game and called it off. The 32 people who said yes
 * still said yes — that is what happened."
 *
 * The reason is shown here and marked internal. This route is the operator
 * tier; the reason reaches no other surface and no payload, which
 * `event-amendment.test.ts` asserts against the message rather than against
 * this screen.
 */
export function CancelledPanel({
  reason,
  entry,
}: {
  reason: string | null;
  /** The cancellation's own history row, where there is one. */
  entry: EventChangeEntry | null;
}) {
  return (
    <Section title="Cancellation" testId="cancelled-panel">
      <Stack spacing={2}>
        {entry ? (
          <Notice severity="info" testId="cancelled-summary">
            {cancelledSummary(entry)}
          </Notice>
        ) : null}

        {reason ? (
          <Box>
            <Typography variant="overline" color="text.secondary" component="p">
              {CANCELLED_REASON_HEADING}
            </Typography>
            <Typography variant="body1" data-testid="cancelled-reason">
              {reason}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {CANCELLED_REASON_INTERNAL}
            </Typography>
          </Box>
        ) : null}

        <Box>
          <Typography variant="overline" color="text.secondary" component="p">
            {CANCELLED_ANSWERS_HEADING}
          </Typography>
          <Typography variant="body2" color="text.secondary" data-testid="cancelled-answers">
            {CANCELLED_ANSWERS_DETAIL}
          </Typography>
        </Box>
      </Stack>
    </Section>
  );
}
