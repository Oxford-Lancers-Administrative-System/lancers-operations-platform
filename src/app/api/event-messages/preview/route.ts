import { NextResponse } from "next/server";

import { requireCapability, requireGrant } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { briefImageResponse } from "@/lib/event-brief/image";
import { MAX_EVENT_MESSAGE_LENGTH } from "@/lib/services/event-messages-input";
import { ANY_TEMPLATE_MANAGE } from "@/lib/services/events";

/**
 * The brief being typed, drawn — LAN-508. The Preview disclosure under the
 * box on the event form, the edit page and the template editor posts the box
 * here and shows the PNG it answers with: the same function that draws the
 * image WhatsApp carries, so the coach sees what the player gets.
 *
 * A route rather than a Server Action because it returns an image and runs
 * per pause in typing. Guarded on what the three editors require — Manage on
 * any event template, or the calendar capability the template editor uses —
 * and a refusal is a `403`, never a redirect. Reads nothing and writes
 * nothing.
 */
export const dynamic = "force-dynamic";

async function permitted(): Promise<boolean> {
  try {
    await requireGrant(ANY_TEMPLATE_MANAGE);
    return true;
  } catch (error) {
    if (!isServiceError(error) || error.kind !== "not_permitted") throw error;
  }
  try {
    await requireCapability("event_calendar_management");
    return true;
  } catch (error) {
    if (isServiceError(error) && error.kind === "not_permitted") return false;
    throw error;
  }
}

export async function POST(request: Request) {
  if (!(await permitted())) {
    return NextResponse.json({ status: "forbidden" }, { status: 403 });
  }

  let body = "";
  try {
    const posted = (await request.json()) as { body?: unknown };
    body = typeof posted.body === "string" ? posted.body : "";
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }
  if (body.length > MAX_EVENT_MESSAGE_LENGTH) {
    return NextResponse.json({ status: "too_long" }, { status: 413 });
  }

  return briefImageResponse(body, { "Cache-Control": "no-store" });
}
