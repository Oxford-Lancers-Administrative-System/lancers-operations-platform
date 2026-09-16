"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { isServiceError } from "@/lib/db";
import { clubLinkUrl } from "@/lib/services/club-link";
import { issueEventClubLink, readEventShareFacts } from "@/lib/services/participation";
import { buildShareMessage } from "../../../participation/share-message";
import { publicOrigin } from "../../../participation/origin";

// Issuing the club link — §4.15, LAN-157. Never revokes, rotates or expires (Q2).
export async function issueClubLinkAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");

  try {
    await issueEventClubLink(eventId);
  } catch (error) {
    if (isServiceError(error)) {
      redirect(
        `/operate/events/${encodeURIComponent(eventId)}?share=1&shareError=${encodeURIComponent(
          error.rule ?? "refused",
        )}`,
      );
    }
    throw error;
  }

  revalidatePath(`/operate/events/${eventId}`);
  redirect(`/operate/events/${encodeURIComponent(eventId)}?share=1`);
}

/**
 * The four lines an operator pastes into a group chat — LAN-384. Reads the
 * same headline the event page and the club-link page both read, issues the
 * link where the event has none, and returns text; the clipboard is the
 * client's to write.
 */
export async function shareMessageAction(params: {
  eventId: string;
}): Promise<{ text: string | null }> {
  try {
    const facts = await readEventShareFacts(params.eventId);
    return {
      text: buildShareMessage({
        eventName: facts.eventName,
        scheduledOn: facts.scheduledOn,
        startsAt: facts.startsAt,
        endsAt: facts.endsAt,
        venue: facts.venue,
        saidYes: facts.saidYes,
        saidNo: facts.saidNo,
        url: clubLinkUrl(await publicOrigin(), facts.token),
      }),
    };
  } catch (error) {
    if (isServiceError(error)) return { text: null };
    throw error;
  }
}
