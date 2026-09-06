import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-shell";

import { withTransaction } from "@/lib/db";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { readSeasonLabelIn } from "@/lib/services/seasons";

import { withdrawMessagingConsent } from "./actions";
import StopFlow from "./stop-flow";

/**
 * The opt-out surface — LAN-202, item 6: "a page on the club's own domain
 * that withdraws consent for the season, honoured immediately across every
 * channel." Reached from a link at the foot of a message, so it carries a
 * token and lives under the same `/me/` prefix as the tokenised sign-up door
 * — the proxy's early return sets `no-store`, `no-referrer` and `noindex`
 * with no edit, exactly as it does there.
 *
 * `LAN-199`'s `Stop messages` button points here.
 */
export const metadata: Metadata = {
  title: "Stop messages",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

async function resolveSeasonLabel(token: string): Promise<string | null> {
  return withTransaction(async (tx) => {
    const resolved = await resolvePersonTokenIn(tx, token);
    if (resolved.state !== "valid" || !resolved.resolved) return null;
    return (await readSeasonLabelIn(tx, resolved.resolved.seasonId)) ?? "this season";
  });
}

export default async function StopMessagesPage({ params }: PageProps) {
  const { token } = await params;
  const seasonLabel = await resolveSeasonLabel(token);
  if (seasonLabel === null) notFound();

  return (
    <PublicShell layout="stack">
      <StopFlow seasonLabel={seasonLabel} withdraw={withdrawMessagingConsent.bind(null, token)} />
    </PublicShell>
  );
}
