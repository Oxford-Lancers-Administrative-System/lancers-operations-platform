import { NextResponse } from "next/server";

import { isServiceError } from "@/lib/db";
import { exportSeasonEvents } from "@/lib/services/event-import";

/**
 * The season's events, as the file an operator edits and brings back. LAN-155.
 *
 * ## Why this is a route rather than a Server Action
 *
 * It is a download. A Server Action returns a value to a React tree; giving the
 * browser a file with a name needs a response carrying `Content-Disposition`,
 * and a link the operator can middle-click. Every *write* on these screens is
 * still a Server Action; this is the one thing that is not a write at all.
 *
 * ## Why it is authorized, and where
 *
 * `exportSeasonEvents()` calls `requireCapability("event_calendar_management")`
 * before it reads a row — `slice-ux.md` § 4, "routes do not authorize", and
 * `W3`'s "event management capability is required, enforced in the service
 * layer". Deleting this handler's error branch cannot grant the export; deleting
 * the handler entirely is the only thing it does.
 *
 * A refusal is a `403` with a fixed body rather than a redirect: this is opened
 * from a page the operator is already on, and a redirect to `/login` would
 * arrive as a page of HTML where a spreadsheet was expected.
 *
 * ## The byte order mark
 *
 * Excel on Windows reads a CSV without one as the system code page, which turns
 * every accented venue name into mojibake the operator then "corrects" and
 * imports back. The importer strips it again, so the round trip is unaffected.
 */
export const dynamic = "force-dynamic";

const BYTE_ORDER_MARK = "\uFEFF";

export async function GET() {
  let season;
  try {
    season = await exportSeasonEvents();
  } catch (error) {
    if (isServiceError(error) && error.kind === "not_permitted") {
      return NextResponse.json({ status: "forbidden" }, { status: 403 });
    }
    if (isServiceError(error)) {
      return NextResponse.json({ status: "unavailable", message: error.message }, { status: 409 });
    }
    throw error;
  }

  return new NextResponse(BYTE_ORDER_MARK + season.csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${season.fileName}"`,
      // The club's calendar changes all day. A cached export is a file whose
      // identifiers are right and whose rows are yesterday's.
      "cache-control": "no-store",
    },
  });
}
