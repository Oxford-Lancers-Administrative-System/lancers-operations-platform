import Stack from "@mui/material/Stack";
import { PageHeader } from "@/components/page-header";
import { SEND_MESSAGES } from "@/lib/auth/roster-access";
import { isServiceError } from "@/lib/db";
import { readClubMessageAudience, type ClubMessageAudience } from "@/lib/services/club-messages";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import { ComposeForm } from "../compose-form";
import { BACK_TO_MESSAGES, MESSAGES_PATH, NEW_MESSAGE, NEW_MESSAGE_PATH } from "../presentation";

/**
 * **New message** — LAN-514. The audience catalogue is the event builder's,
 * narrowed to the viewer's grants as it is there (LAN-423) by the service the
 * send resolves against too. Who has no email is a contact fact, so the names
 * are marked only for a seat that reads Contact & emergency; the send refuses
 * them either way. May send Messages (LAN-520).
 */
export default async function NewMessagePage() {
  const gate = await gateShellPage(NEW_MESSAGE_PATH, SEND_MESSAGES);
  if ("screen" in gate) return gate.screen;

  let audience: ClubMessageAudience;
  try {
    audience = await readClubMessageAudience(gate.operator.grants);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen title={NEW_MESSAGE} message={error.message} testId="compose-unavailable" />
    );
  }

  return (
    <Stack spacing={3} data-testid="compose-screen">
      <PageHeader title={NEW_MESSAGE} back={{ href: MESSAGES_PATH, label: BACK_TO_MESSAGES }} />
      <ComposeForm
        candidates={audience.catalogue.candidates}
        counts={audience.catalogue.counts}
        unreachable={audience.unreachable}
      />
    </Stack>
  );
}
