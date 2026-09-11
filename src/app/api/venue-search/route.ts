import { NextResponse } from "next/server";

import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { searchVenues } from "@/lib/venue-search/provider";

/**
 * Address suggestions for the event editor's venue field. LAN-115. A route,
 * not a Server Action: it runs per debounced keystroke and must be
 * cancellable, which Server Actions (queued, non-abortable) are not. Guarded
 * with `event_calendar_management` — the same capability create/edit require
 * — so the geocoding proxy is not open to anyone with the URL; refusal is a
 * `403`, never a redirect, since this is called by `fetch` mid-form. Reads
 * nothing, writes nothing, stores no suggestion.
 */
export const dynamic = "force-dynamic";

/** The query parameter carrying what the operator has typed. */
const QUERY_PARAM = "q";

export async function GET(request: Request) {
  try {
    await requireCapability("event_calendar_management");
  } catch (error) {
    if (isServiceError(error) && error.kind === "not_permitted") {
      return NextResponse.json({ status: "forbidden" }, { status: 403 });
    }
    throw error;
  }

  const query = new URL(request.url).searchParams.get(QUERY_PARAM) ?? "";
  const outcome = await searchVenues(query, { signal: request.signal });

  // The browser is told the outcome, never the deployment: `unavailable` sheds the variable names.
  const body =
    outcome.status === "ok"
      ? { status: "ok" as const, suggestions: outcome.suggestions }
      : { status: outcome.status };

  // `no-store`: the result is per-operator and per-keystroke.
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
