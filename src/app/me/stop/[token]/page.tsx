import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-shell";

import { withTransaction } from "@/lib/db";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { readSeasonLabelIn } from "@/lib/services/seasons";

import { withdrawMessagingConsent } from "./actions";
import StopFlow from "./stop-flow";

/** The opt-out surface (LAN-202, item 6) — "honoured immediately across every channel." Under `/me/` so the proxy's `no-store`/`no-referrer`/`noindex` apply unchanged. `LAN-199`'s `Stop messages` button points here. */
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
