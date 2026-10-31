import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SEND_MESSAGES } from "@/lib/auth/roster-access";
import { isServiceError } from "@/lib/db";
import { listClubMessages, type ClubMessageSummary } from "@/lib/services/club-messages";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../gate";
import { MessageCards, MessageTable } from "./message-list";
import {
  MESSAGES_PATH,
  NEW_MESSAGE,
  NEW_MESSAGE_PATH,
  NO_MESSAGES,
  PAGE_HEADING,
} from "./presentation";

/**
 * **Messages** — LAN-514. Every message written here, scheduled and sent,
 * newest first, and the way to write another. May send Messages (LAN-520):
 * a seat-page switch, on for the five seats that held it before.
 */
export default async function MessagesPage() {
  const gate = await gateShellPage(MESSAGES_PATH, SEND_MESSAGES);
  if ("screen" in gate) return gate.screen;

  let messages: ClubMessageSummary[];
  try {
    messages = await listClubMessages();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title={PAGE_HEADING}
        message={error.message}
        testId="club-messages-unavailable"
      />
    );
  }

  return (
    <Stack spacing={3} data-testid="club-messages-screen">
      <PageHeader
        title={PAGE_HEADING}
        subtitle={`${messages.length} ${messages.length === 1 ? "message" : "messages"}`}
        actions={
          <Button variant="contained" href={NEW_MESSAGE_PATH} data-testid="new-message">
            {NEW_MESSAGE}
          </Button>
        }
      />
      {messages.length === 0 ? (
        <EmptyState
          testId="club-messages-empty"
          title={NO_MESSAGES}
          action={{ href: NEW_MESSAGE_PATH, label: NEW_MESSAGE }}
        />
      ) : (
        <>
          <MessageTable messages={messages} />
          <MessageCards messages={messages} />
        </>
      )}
    </Stack>
  );
}
