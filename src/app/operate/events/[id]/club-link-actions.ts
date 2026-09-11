"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { isServiceError } from "@/lib/db";
import { issueEventClubLink } from "@/lib/services/participation";

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
