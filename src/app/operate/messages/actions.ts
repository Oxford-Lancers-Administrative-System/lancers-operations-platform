"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { createClubMessage } from "@/lib/services/club-messages";
import { MESSAGES_PATH } from "./presentation";

/**
 * LAN-514. Sending a message from the Messages page. `delivery_administration`
 * — the seats that already administer the club's delivery (President, Vice
 * President, Secretary, General Manager, IT Officer) — checked against the
 * verified session here, whatever the page showed. A refusal or a rule the
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
    const operator = await requireCapability("delivery_administration");
    const scheduled = text(formData, "when") === "schedule";
    created = await createClubMessage({
      actorPersonId: operator.personId,
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
