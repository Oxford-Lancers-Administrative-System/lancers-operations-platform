import type { RawEventMessage } from "@/lib/services/event-messages-input";

/**
 * The event message cards a submission carries — LAN-508. Read the same way by
 * the draft form, the edit page and the template editor, because it is the
 * same editor posting the same fields. `null` is "this form posted no event
 * messages section at all", which is not the same as "it posted none".
 */
export function readEventMessagesFromForm(formData: FormData): RawEventMessage[] | null {
  if (formData.get("eventMessagesPresent") === null) return null;

  const strings = (field: string) =>
    formData.getAll(field).map((value) => (typeof value === "string" ? value : ""));

  const ids = strings("eventMessageId");
  const hours = strings("eventMessageHoursBefore");
  const channels = strings("eventMessageChannel");
  const recipients = strings("eventMessageRecipients");
  const bodies = strings("eventMessageBody");
  const fromTemplate = strings("eventMessageFromTemplate");

  return bodies.map((body, index) => ({
    id: ids[index] ?? "",
    hoursBefore: hours[index] ?? "",
    channel: channels[index] ?? "",
    recipients: recipients[index] ?? "",
    body,
    fromTemplate: fromTemplate[index] ?? "false",
  }));
}
