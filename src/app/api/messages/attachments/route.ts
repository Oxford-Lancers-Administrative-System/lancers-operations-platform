import { NextResponse } from "next/server";

import { authoriseUpload, failure } from "./guard";
import { startAttachmentUpload } from "@/lib/services/club-messages";

/**
 * LAN-514. Starts one file's upload for a message on the Messages page. The
 * bytes follow in chunks to `./[id]` — a route, not a Server Action, because a
 * Server Action takes 1 MB and the proxy buffers 10 MB, and a playbook is
 * larger than both. `delivery_administration`, as sending is.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const operator = await authoriseUpload(request);
  if (operator instanceof Response) return operator;

  let body: { filename?: unknown; contentType?: unknown; byteSize?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  try {
    const upload = await startAttachmentUpload({
      actorPersonId: operator.personId,
      filename: typeof body.filename === "string" ? body.filename : "",
      contentType: typeof body.contentType === "string" ? body.contentType : "",
      byteSize: typeof body.byteSize === "number" ? body.byteSize : 0,
    });
    return NextResponse.json(
      { status: "ok", ...upload },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
