"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireGrant } from "@/lib/auth/guards";
import { SEND_MESSAGES } from "@/lib/auth/roster-access";
import { isServiceError } from "@/lib/db";
import { createClubMessage } from "@/lib/services/club-messages";
import { MESSAGES_PATH } from "./presentation";

/**
 * LAN-514. Sending a message from the Messages page. May send Messages
 * (LAN-520, the seat-page switch that replaced `delivery_administration` here)
 * — checked against the verified session here, whatever the page showed. A refusal or a rule the
 * service enforces comes back as the form's own error, entries intact.
 */
export interface SendMessageState {
  readonly error: string | null;
}

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function all(formData: FormData, field: string): string[] {
  return formData.getAll(field).filter((value): value is string => typeof value === "string");
}

export async function sendClubMessageAction(
  _previous: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  let created: { id: string };
  try {
    const operator = await requireGrant(SEND_MESSAGES);
    const scheduled = text(formData, "when") === "schedule";
    created = await createClubMessage({
      actorPersonId: operator.personId,
      grants: operator.grants,
      subject: text(formData, "subject"),
      body: text(formData, "body"),
      audienceKeys: all(formData, "audienceKey"),
      audienceGroups: all(formData, "audienceGroup"),
      attachmentIds: all(formData, "attachmentId"),
      schedule: scheduled
        ? { day: text(formData, "sendDay"), time: text(formData, "sendTime") }
        : null,
    });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return { error: error.message };
  }
  revalidatePath(MESSAGES_PATH);
  redirect(`${MESSAGES_PATH}/${created.id}?sent=1`);
}
