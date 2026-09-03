import { NextResponse } from "next/server";

import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { importTemplateCsv } from "@/lib/services/roster-csv";

/**
 * The roster import's template — the header row an operator's spreadsheet
 * has to match. LAN-215, `WP-arrival-doors`, workflow `W1`.
 *
 * ## Why there is no round-tripping export here
 *
 * `/operate/events/import`'s own export round-trips an `id` column so a
 * second import can recognise "this is the same event, edited" — this
 * importer has no such column: a person is matched by the duplicate
 * question, never by a spreadsheet identifier, so there is nothing an export
 * of the current roster would let a re-import upsert against. Delegated to
 * the Mission Lead (`acceptance/W1.md`) and settled this way: the template
 * alone, on the identical byte-order-mark and authorization reasoning
 * `/operate/events/import/export/route.ts` states in full.
 */
export const dynamic = "force-dynamic";

const BYTE_ORDER_MARK = "﻿";

export async function GET() {
  try {
    await requireCapability("roster_bulk_import");
  } catch (error) {
    if (isServiceError(error) && error.kind === "not_permitted") {
      return NextResponse.json({ status: "forbidden" }, { status: 403 });
    }
    if (isServiceError(error)) {
      return NextResponse.json({ status: "unavailable", message: error.message }, { status: 409 });
    }
    throw error;
  }

  return new NextResponse(BYTE_ORDER_MARK + importTemplateCsv(), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="lancers-roster-template.csv"',
      "cache-control": "no-store",
    },
  });
}
