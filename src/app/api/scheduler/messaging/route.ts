import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { runMessagingSweep } from "@/lib/services/messaging-scheduler";

/**
 * The messaging scheduler's trigger. LAN-169. Cloud Run has no background
 * worker or cron, so the sweep runs only when Cloud Scheduler (deployed) or
 * `scripts/messaging-ticker.mjs` (local) POSTs here. Authenticated by a
 * constant-time shared-secret compare, not a session — there is no operator
 * (`REQ-retries-have-no-actor`). An unauthenticated caller gets `401` with no
 * database access at all; a missing `SCHEDULER_TRIGGER_TOKEN` refuses rather
 * than running unauthenticated. Deliberately no `GET` — a sweep sends
 * messages, and a URL that does that on a prefetch is a defect waiting to
 * happen.
 *
 * Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE
 */

export const dynamic = "force-dynamic";

/** The variable carrying the shared secret. Named here so a test can agree. */
export const SCHEDULER_TOKEN_VARIABLE = "SCHEDULER_TRIGGER_TOKEN";

/** Constant-time comparison. Both sides are hashed to a fixed 32 bytes first, since `timingSafeEqual` throws (a length oracle) on a length mismatch. */
function tokenMatches(given: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(given, "utf8").digest();
  const b = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

function presentedToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return (request.headers.get("x-scheduler-token") ?? "").trim();
}

export async function POST(request: Request): Promise<NextResponse> {
  const expected = (process.env[SCHEDULER_TOKEN_VARIABLE] ?? "").trim();

  if (expected === "") {
    return NextResponse.json(
      {
        error:
          "The messaging scheduler has no trigger token configured on this deployment, so it " +
          "refuses to run. This needs the club's administrator.",
      },
      { status: 503 },
    );
  }

  const given = presentedToken(request);
  if (given === "" || !tokenMatches(given, expected)) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    const summary = await runMessagingSweep();
    // Counts only — no recipient, message body, or job identifier in a scheduler's log.
    return NextResponse.json(summary, { status: 200 });
  } catch {
    // Worth retrying: the next tick reclaims the same due work ("due" is a row predicate, not a consumed queue).
    return NextResponse.json({ error: "The messaging sweep failed." }, { status: 500 });
  }
}

/** Deliberately absent: a `GET` (see module header). */
