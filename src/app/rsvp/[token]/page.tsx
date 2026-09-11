import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { LinkOpenedBeacon } from "@/components/link-opened-beacon";
import { TOKEN_LINK_METADATA } from "@/lib/brand";

import { withTransaction } from "@/lib/db";
import {
  allowRsvpRequest,
  clientKeyFrom,
  logThrottledRsvpRequest,
  withUniformTerminalTiming,
} from "@/lib/rsvp/public-surface";
import { readSignedRsvpPageIn } from "@/lib/services/rsvp";
import { resolveRsvpTokenIn } from "@/lib/services/rsvp-tokens";

import { noteRsvpLinkOpened } from "./actions";
import { DECLINE_STEP, ERROR_PARAM, SAVED_PARAM, STEP_PARAM } from "./params";
import { DecliningStep } from "./decline-step";
import { Invitation } from "./invitation-step";
import { CancelledEvent, ResponseSaved } from "./saved-and-cancelled";

/**
 * The player's RSVP — the only unauthenticated page in the application; the
 * token is the authorization. `force-dynamic`/`no-store` keep one player's
 * answer out of another's; `Referrer-Policy: no-referrer` keeps the token
 * off a `Referer` header; there is no link into `/operate`. Four screens
 * move on query parameters, split into siblings (LAN-300):
 * `invitation-step.tsx`, `decline-step.tsx`, `saved-and-cancelled.tsx`,
 * `rsvp-shell.tsx`. UX-63/64/65 render nowhere — see `not-found.tsx`.
 */
export const dynamic = "force-dynamic";

/** The generic club card (LAN-269) — static, names no event/player: a token-built card would leak whether a link is live into a chat bubble. */
export const metadata: Metadata = TOKEN_LINK_METADATA;

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function RsvpPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;

  const resolved = await withUniformTerminalTiming(
    async () => {
      // Counted before the token is even looked at, so a scanner cannot spend database round trips; a throttled request is the same terminal outcome, logged server-side.
      const requestHeaders = await headers();
      const decision = allowRsvpRequest(clientKeyFrom(requestHeaders), token);
      if (!decision.allowed) {
        logThrottledRsvpRequest(decision.reason!);
        return { state: "unknown" as const, page: null };
      }

      // Resolution and the page read share one transaction: the event could otherwise be cancelled between the two.
      return withTransaction(async (tx) => {
        const resolution = await resolveRsvpTokenIn(tx, token);
        if (resolution.invitation === null) {
          return { state: resolution.state, page: null };
        }
        return {
          state: resolution.state,
          page: await readSignedRsvpPageIn(tx, resolution.invitation.invitationId),
        };
      });
    },
    // All terminal states held to the same floor so the work each costs is not visible from outside.
    (outcome) => outcome.page === null || outcome.state === "event_started",
  );

  // Distinct in the resolver, secure logs and tests; one response from exactly this line.
  if (resolved.page === null || resolved.state === "event_started") {
    notFound();
  }

  if (resolved.state === "cancelled") {
    return <CancelledEvent page={resolved.page} />;
  }

  const error = firstValue(query[ERROR_PARAM]);
  const screen =
    firstValue(query[SAVED_PARAM]) !== null && error === null ? (
      <ResponseSaved page={resolved.page} token={token} />
    ) : firstValue(query[STEP_PARAM]) === DECLINE_STEP ? (
      <DecliningStep page={resolved.page} token={token} error={error} />
    ) : (
      <Invitation page={resolved.page} token={token} error={error} />
    );

  return (
    <>
      {/* Counts as a real opening (LAN-269); render stamps nothing. Below the cancelled branch, deliberately: a cancelled link never counted as a use. */}
      <LinkOpenedBeacon record={noteRsvpLinkOpened.bind(null, token)} />
      {screen}
    </>
  );
}
