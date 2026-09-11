import { NextResponse } from "next/server";

import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { importTemplateCsv } from "@/lib/services/roster-csv";

// The roster import's template — LAN-215, `W1`.
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
