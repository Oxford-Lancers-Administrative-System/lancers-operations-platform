import { NextResponse } from "next/server";

import { isServiceError } from "@/lib/db";
import { exportSeasonEvents } from "@/lib/services/event-import";

// The season's events, as a file — LAN-155. A route, not a Server Action (it's a download).
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
      "cache-control": "no-store",
    },
  });
}
