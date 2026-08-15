import { NextResponse } from "next/server";

import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { searchVenues } from "@/lib/venue-search/provider";

/**
 * Address suggestions for the event editor's venue field. LAN-115.
 *
 * ## Why this is a route rather than a Server Action
 *
 * Every other write on the event screens is a Server Action, and this is the
 * one thing on them that is neither a write nor a submission: it runs on each
 * debounced keystroke, its previous call has to be **cancellable**, and its
 * result is discarded if a newer query has since been typed. Server Actions are
 * queued and non-abortable by design, so a stale one cannot be cancelled and
 * would arrive late to overwrite a newer list — the exact defect LAN-115's
 * "a slow earlier query cannot overwrite a later query's results" names. A
 * plain `GET` gives the browser an `AbortController`, and the field a sequence
 * number, which is what makes that criterion enforceable rather than hoped for.
 *
 * ## Why it is authorized at all
 *
 * A geocoding proxy open to anyone with the URL is somebody else's free service
 * being spent by strangers, in the club's name, from the club's address. It is
 * guarded with `event_calendar_management` — the same capability the create and
 * edit actions require — so exactly the operators who may set a venue may look
 * one up, and nobody else reaches the provider at all. This grants no new
 * authority: the capability, its role list and its single source in
 * `capabilities.ts` are untouched by this issue.
 *
 * A refusal is a `403` with a fixed body. It never redirects: this is called by
 * `fetch` from a form the operator is part-way through, and a redirect to
 * `/login` would arrive as a page of HTML where a suggestion list was expected.
 *
 * ## What this route does not do
 *
 * It reads nothing from the database, writes nothing, and records no audit row,
 * because looking up an address is not a domain event — the event is saving the
 * draft, which is audited where it always was. It stores no suggestion, so
 * there is no venue directory and no venue history, both of which LAN-115 puts
 * explicitly out of scope.
 */
export const dynamic = "force-dynamic";

/** The query parameter carrying what the operator has typed. */
const QUERY_PARAM = "q";

export async function GET(request: Request) {
  try {
    await requireCapability("event_calendar_management");
  } catch (error) {
    // A refusal is the expected answer for anyone else and is answered as one.
    // Anything else is a genuine fault and must reach the platform as itself.
    if (isServiceError(error) && error.kind === "not_permitted") {
      return NextResponse.json({ status: "forbidden" }, { status: 403 });
    }
    throw error;
  }

  const query = new URL(request.url).searchParams.get(QUERY_PARAM) ?? "";
  const outcome = await searchVenues(query, { signal: request.signal });

  // The browser is told the outcome and nothing about the deployment. In
  // particular `unavailable` sheds the variable names the adapter collected:
  // they exist so a developer reading a server log knows what to set, and a
  // configuration inventory is not something a form needs in order to say
  // "type the venue yourself".
  const body =
    outcome.status === "ok"
      ? { status: "ok" as const, suggestions: outcome.suggestions }
      : { status: outcome.status };

  // `no-store` because the result is per-operator and per-keystroke. Nothing
  // between here and the browser has any business keeping a copy.
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
