import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { PublicShell } from "@/components/public-shell";

import { withTransaction } from "@/lib/db";
import {
  allowPlayerHomeRequest,
  clientKeyFrom,
  logThrottledPlayerHomeRequest,
  withUniformTerminalTiming,
} from "@/lib/rsvp/public-surface";
import { isSeasonRosterMemberIn } from "@/lib/services/messaging-consent";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { readSeasonLabelIn } from "@/lib/services/seasons";

import { withdrawMessagingConsent } from "./actions";
import StopFlow from "./stop-flow";

/** The opt-out surface (LAN-202, item 6) — "honoured immediately across every channel." `LAN-199`'s `Stop messages` button points here. LAN-343 gave it its own route and its own `messaging_stop` credential: it used to share one with whichever form the same message carried, so a leaked form link also stopped every message the club sends. */
export const metadata: Metadata = {
  title: "Stop messages",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

interface Holder {
  readonly seasonLabel: string;
  /** LAN-372: a roster player is exempt from Stop and is told so instead. */
  readonly rosterMember: boolean;
}

/** Throttled and timing-padded exactly like `/onboarding` — the audit (LAN-352) found this and `/signup` were the two token doors without either brake. */
async function resolveHolder(token: string): Promise<Holder | null> {
  return withUniformTerminalTiming<Holder | null>(
    async () => {
      const decision = allowPlayerHomeRequest(clientKeyFrom(await headers()), token);
      if (!decision.allowed) {
        logThrottledPlayerHomeRequest(decision.reason!);
        return null;
      }
      return withTransaction(async (tx) => {
        const resolved = await resolvePersonTokenIn(tx, token, "messaging_stop");
        if (resolved.state !== "valid" || !resolved.resolved) return null;
        return {
          seasonLabel: (await readSeasonLabelIn(tx, resolved.resolved.seasonId)) ?? "this season",
          rosterMember: await isSeasonRosterMemberIn(
            tx,
            resolved.resolved.personId,
            resolved.resolved.seasonId,
          ),
        };
      });
    },
    (holder) => holder === null,
  );
}

export default async function StopMessagesPage({ params }: PageProps) {
  const { token } = await params;
  const holder = await resolveHolder(token);
  if (holder === null) notFound();

  return (
    <PublicShell layout="stack">
      <StopFlow
        seasonLabel={holder.seasonLabel}
        rosterMember={holder.rosterMember}
        withdraw={withdrawMessagingConsent.bind(null, token)}
      />
    </PublicShell>
  );
}
