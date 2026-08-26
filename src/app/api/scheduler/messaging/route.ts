import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { runMessagingSweep } from "@/lib/services/messaging-scheduler";

/**
 * The messaging scheduler's trigger. LAN-169.
 *
 * ## Why the sweep needs a route at all
 *
 * Because nothing else in this application runs without a request. Cloud Run
 * scales to zero and has no background worker, no cron and no timer that
 * survives a container being reclaimed; a `setInterval` in a module would run
 * on whichever instances happened to be warm, which is none of them at four in
 * the morning and several of them at once during a deploy. So the loop is a
 * request somebody makes on a schedule — Cloud Scheduler in the deployed
 * environment, `scripts/messaging-ticker.mjs` locally — and this is what they
 * make it to.
 *
 * ## Why it is authenticated by a shared secret rather than by a session
 *
 * There is no operator here. The sweep is automated work with no actor
 * (`REQ-retries-have-no-actor`), and requiring a signed-in human would mean
 * either the club's messaging stops when nobody is looking at the app — which
 * is the entire failure this mission exists to remove — or a service account
 * with a password, which is a worse secret than this one.
 *
 * The token is compared in **constant time**. A naive `===` on a secret leaks
 * its length and its prefix to anybody willing to time enough requests, and
 * this endpoint is reachable from the internet.
 *
 * ## What an unauthenticated caller gets
 *
 * `401`, an empty body, and no database access whatsoever. In particular the
 * sweep does not run first and refuse to answer afterwards: a caller who cannot
 * authenticate must not be able to make the club send messages, even correct
 * ones, and must not be able to use the endpoint's timing to learn whether
 * there is work outstanding.
 *
 * ## Why an unconfigured deployment refuses rather than running unauthenticated
 *
 * A missing `SCHEDULER_TRIGGER_TOKEN` is a refusal, never a default. The
 * alternative — "no token configured, so allow everybody" — would make the one
 * variable whose absence *widens* what the deployment does, which is the rule
 * `config.ts` is built on and the reason the delivery allowlist is required.
 */

export const dynamic = "force-dynamic";

/** The variable carrying the shared secret. Named here so a test can agree. */
export const SCHEDULER_TOKEN_VARIABLE = "SCHEDULER_TRIGGER_TOKEN";

/**
 * Constant-time comparison of two secrets.
 *
 * `timingSafeEqual` throws on a length mismatch, which would itself be a length
 * oracle, so both sides are hashed to a fixed 32 bytes first and the digests are
 * compared. That is the standard shape and it is the same one
 * `verifyWebhookSignature` uses a few directories away.
 */
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
    // The counts, and nothing else. No recipient, no message body, no job
    // identifier — this response is readable by whatever made the request, and
    // a scheduler's log is not a place the club's roster belongs.
    return NextResponse.json(summary, { status: 200 });
  } catch {
    // A 500 is worth retrying and this one genuinely is: the next tick reclaims
    // exactly the same due work, because "due" is a predicate over rows rather
    // than a queue this request consumed.
    return NextResponse.json({ error: "The messaging sweep failed." }, { status: 500 });
  }
}

/**
 * Deliberately absent: a `GET`.
 *
 * A sweep sends messages, and a URL that sends messages when it is fetched is
 * one browser prefetch, one link preview or one uptime check away from doing it
 * by accident. Cloud Scheduler and the local ticker both POST.
 */
