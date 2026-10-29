import { NextResponse } from "next/server";

import { UPLOAD_CHUNK_BYTES } from "@/lib/services/club-message-input";
import { appendAttachmentChunk, removeAttachmentUpload } from "@/lib/services/club-messages";
import { authoriseUpload, failure } from "../guard";

/**
 * LAN-514. One chunk of an attachment (`PUT ?offset=<bytes held>`, the body
 * the raw bytes), or the upload removed (`DELETE`). Only the operator who
 * started an upload can add to it or remove it, and only before a message has
 * claimed it.
 */
export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await authoriseUpload(request);
  if (operator instanceof Response) return operator;
  const { id } = await params;

  const offset = Number(new URL(request.url).searchParams.get("offset"));
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isInteger(offset) || offset < 0 || declared > UPLOAD_CHUNK_BYTES) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  try {
    const upload = await appendAttachmentChunk({
      actorPersonId: operator.personId,
      uploadId: id,
      offset,
      bytes,
    });
    return NextResponse.json(
      { status: "ok", ...upload },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await authoriseUpload(request);
  if (operator instanceof Response) return operator;
  const { id } = await params;
  try {
    await removeAttachmentUpload({ actorPersonId: operator.personId, uploadId: id });
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return failure(error);
  }
}
