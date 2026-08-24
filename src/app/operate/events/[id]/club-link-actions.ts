"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { isServiceError } from "@/lib/db";
import { issueEventClubLink } from "@/lib/services/participation";

/**
 * Issuing the club link — §4.15, inventory amendment 1. LAN-157.
 *
 * ## Why issuing is an action and reading is not
 *
 * Opening **Share link** must not write. An operator looking at what they
 * already shared is reading, and a page render that minted a token would put a
 * row in `club_link_tokens` every time somebody glanced at the dialog. So the
 * dialog reads the live link, and this action exists for the one case where
 * there is not one yet.
 *
 * ## Where the refusal is
 *
 * In the service, which resolves the operator from the verified session and
 * asks for `event_calendar_management`. This file passes no actor: a server
 * action is a POST endpoint anybody with a session can call, and an action that
 * accepted "who am I" as a form field would accept whatever the browser sent.
 *
 * ## What it never does
 *
 * Revoke, rotate or expire. Q2 is a nonblocking unknown Brian chose to settle
 * by testing, and this ships without revocation — `club_link_tokens.revoked_at`
 * is there so that settling it later is additive.
 */
export async function issueClubLinkAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");

  try {
    await issueEventClubLink(eventId);
  } catch (error) {
    if (isServiceError(error)) {
      // The dialog re-renders with the refusal rather than an error page —
      // `docs/ux/standards.md` rule 6. `shareError` carries the rule name, not
      // the message: the page owns the words.
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
