import { NextResponse } from "next/server";

import { isServiceError } from "@/lib/db";
import { briefImageResponse } from "@/lib/event-brief/image";
import { readEventMessageBrief } from "@/lib/services/event-messages/store";
import { requireEventGrant } from "@/lib/services/events";

/**
 * One event message's brief, drawn — LAN-508, the Preview on the event page
 * (W1-04): the brief as last sent, or as it stands while it has not gone.
 * The same function that draws the image WhatsApp carries.
 *
 * Guarded by View on the event's template, read from the database (LAN-431),
 * like the page it sits on. A missing message and a refusal are both a
 * `404`, so the route does not say which messages exist.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/event-messages/[messageId]/image">,
) {
  const { messageId } = await context.params;
  const brief = await readEventMessageBrief(messageId);
  if (brief === null) return NextResponse.json({ status: "not_found" }, { status: 404 });

  try {
    await requireEventGrant(brief.eventId, "view");
  } catch (error) {
    if (isServiceError(error)) {
      return NextResponse.json({ status: "not_found" }, { status: 404 });
    }
    throw error;
  }

  return briefImageResponse(brief.body, { "Cache-Control": "private, no-store" });
}
