import { NextResponse } from "next/server";

import { requireGrant } from "@/lib/auth/guards";
import { ADD_RECRUITS } from "@/lib/auth/roster-access";
import { isServiceError } from "@/lib/db";
import { recruitImportTemplateCsv } from "@/lib/services/recruit-csv";

// The recruit import's empty template — LAN-487, the roster import's `export` route for recruits.
export const dynamic = "force-dynamic";

const BYTE_ORDER_MARK = "﻿";

export async function GET() {
  try {
    await requireGrant(ADD_RECRUITS);
  } catch (error) {
    if (isServiceError(error) && error.kind === "not_permitted") {
      return NextResponse.json({ status: "forbidden" }, { status: 403 });
    }
    if (isServiceError(error)) {
      return NextResponse.json({ status: "unavailable", message: error.message }, { status: 409 });
    }
    throw error;
  }

  return new NextResponse(BYTE_ORDER_MARK + recruitImportTemplateCsv(), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="lancers-recruit-template.csv"',
      "cache-control": "no-store",
    },
  });
}
