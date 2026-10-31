import { NextResponse } from "next/server";

import { requireGrant } from "@/lib/auth/guards";
import { SEND_MESSAGES } from "@/lib/auth/roster-access";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { isServiceError } from "@/lib/db";

/**
 * The two checks every upload request passes before anything is read: the
 * request came from this application's own pages (a Server Action's origin
 * check, done by hand for a route), and the session holds May send Messages
 * (LAN-520), as sending does. A refusal is a status, never a redirect — these
 * are called by `fetch` mid-form.
 */
export async function authoriseUpload(request: Request): Promise<ResolvedOperator | Response> {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || originHost(origin) !== host) {
    return NextResponse.json({ status: "forbidden" }, { status: 403 });
  }
  try {
    return await requireGrant(SEND_MESSAGES);
  } catch (error) {
    if (isServiceError(error) && error.kind === "not_permitted") {
      return NextResponse.json({ status: "forbidden" }, { status: 403 });
    }
    throw error;
  }
}

/** An Origin's host, or null for `null` (a sandboxed or opaque origin) and anything unparseable. */
function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * The request body, refused (null) as soon as it passes `limit` bytes. Read as
 * a stream, so a body larger than it declared is never held whole.
 */
export async function readBodyAtMost(request: Request, limit: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

/** A service refusal as the form's message; anything else still throws. */
export function failure(error: unknown): Response {
  if (!isServiceError(error)) throw error;
  const status = error.kind === "not_found" ? 404 : error.kind === "not_permitted" ? 403 : 422;
  return NextResponse.json({ status: "refused", message: error.message }, { status });
}
