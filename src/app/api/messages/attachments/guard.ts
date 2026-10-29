import { NextResponse } from "next/server";

import { requireCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { isServiceError } from "@/lib/db";

/**
 * The two checks every upload request passes before anything is read: the
 * request came from this application's own pages (a Server Action's origin
 * check, done by hand for a route), and the session holds
 * `delivery_administration`. A refusal is a status, never a redirect — these
 * are called by `fetch` mid-form.
 */
export async function authoriseUpload(request: Request): Promise<ResolvedOperator | Response> {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return NextResponse.json({ status: "forbidden" }, { status: 403 });
  }
  try {
    return await requireCapability("delivery_administration");
  } catch (error) {
    if (isServiceError(error) && error.kind === "not_permitted") {
      return NextResponse.json({ status: "forbidden" }, { status: 403 });
    }
    throw error;
  }
}

/** A service refusal as the form's message; anything else still throws. */
export function failure(error: unknown): Response {
  if (!isServiceError(error)) throw error;
  const status = error.kind === "not_found" ? 404 : error.kind === "not_permitted" ? 403 : 422;
  return NextResponse.json({ status: "refused", message: error.message }, { status });
}
