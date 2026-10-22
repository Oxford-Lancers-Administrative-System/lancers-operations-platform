import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Section } from "@/components/section";
import type { StoredEventMessage } from "@/lib/services/event-messages";
import {
  EVENT_MESSAGES_HEADLINE,
  describeEventMessage,
  describeEventMessageStatus,
  eventMessageStatus,
} from "@/lib/services/event-messages-input";
import { BriefPreview } from "../brief-preview";

/**
 * The event's messages after approval — LAN-508, W1-04. In the Questions
 * list's row style: the message, its status (Scheduled or Sent, with the
 * moment), the one line that says when, how and to whom, and the brief as it
 * was last sent in a Preview disclosure.
 */
export function EventMessageList({
  messages,
  eventStatus,
  eventStart,
}: {
  messages: readonly StoredEventMessage[];
  eventStatus: string;
  eventStart: Date | null;
}) {
  return (
    <Section title={EVENT_MESSAGES_HEADLINE} testId="event-messages">
      <Stack component="ol" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }}>
        {messages.map((message, index) => {
          const shown = message.lastSend ?? message;
          const status = eventMessageStatus({
            lastSentAt: message.lastSend?.sentAt ?? null,
            eventStatus,
            eventStart,
            hoursBefore: message.hoursBefore,
          });
          return (
            <Box
              component="li"
              key={message.id}
              sx={{ py: 1, borderBottom: 1, borderColor: "divider" }}
              data-testid="event-message-row"
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {`Event message ${index + 1}`}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  data-testid="event-message-status"
                >
                  {describeEventMessageStatus(status)}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {describeEventMessage(shown)}
              </Typography>
              <Box sx={{ mt: 1.5 }}>
                <BriefPreview
                  src={`/api/event-messages/${message.id}/image?v=${message.lastSend?.version ?? 0}`}
                  testId="event-message-row-preview"
                />
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Section>
  );
}
