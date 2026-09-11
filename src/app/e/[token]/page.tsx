import type { Metadata } from "next";
import { headers } from "next/headers";
import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { LinkOpenedBeacon } from "@/components/link-opened-beacon";
import { TOKEN_LINK_METADATA } from "@/lib/brand";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  allowPublicLinkRequest,
  clientKeyFrom,
  logThrottledClubLinkRequest,
} from "@/lib/rsvp/public-surface";
import { labelFor, STATUS_LABELS } from "@/lib/services/event-vocabulary";
import { readParticipationFilters } from "@/lib/services/participation-view";
import { readClubLinkParticipation } from "@/lib/services/participation";

import { noteClubLinkOpened } from "./actions";

import { EventFacts, formatEventWhen, HeadlineNumbers } from "../../participation/event-facts";
import { ParticipationFilterBar } from "../../participation/participation-filters";
import { ParticipationTable } from "../../participation/participation-table";
import {
  CLUB_LINK_SUBTITLE,
  CLUB_LINK_UNAVAILABLE_DETAIL,
  CLUB_LINK_UNAVAILABLE_HEADLINE,
} from "../../participation/presentation";

/**
 * The club link — W7-03. D2, D81, LAN-157. Coaches hold no operator account
 * (Brian, 2026-08-21: "The event ID shared with anyone should be openable by
 * anyone"). Held shut by the token alone, resolved in the service layer — no
 * session, no `/operate` navigation. `readClubLinkParticipation` returns no
 * delivery field and no joining URL (REQ-club-link, REQ-no-joining-url); that
 * boundary is held by the separate per-tier query and field-by-field
 * reassembly, not the compiler (R157-B5). Not cached: `src/proxy.ts` gives
 * this prefix `no-store`/`no-referrer`/`noindex`. One body for every refusal.
 * Rate limited (R157-B4, W157-R1) as `/rsvp`'s counter, extended with its own
 * per-link allowance so one squad's ordinary traffic is not throttled.
 *
 * Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE
 */
export const dynamic = "force-dynamic";

/** The generic club card, not this event's (LAN-269) — static, so no token is resolved to build it. */
export const metadata: Metadata = TOKEN_LINK_METADATA;

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ClubLinkPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;

  const requestHeaders = await headers();
  const decision = allowPublicLinkRequest("club_link", clientKeyFrom(requestHeaders), token);
  if (!decision.allowed) {
    logThrottledClubLinkRequest(decision.reason!);
  }

  const page = decision.allowed
    ? await readClubLinkParticipation(token)
    : ({ state: "unavailable" } as const);

  if (page.state !== "live") {
    return (
      <PublicShell testId="club-link-unavailable">
        <Stack spacing={2}>
          <PageHeader title={CLUB_LINK_UNAVAILABLE_HEADLINE} />
          <Typography variant="body2" color="text.secondary">
            {CLUB_LINK_UNAVAILABLE_DETAIL}
          </Typography>
        </Stack>
      </PublicShell>
    );
  }

  const { participation } = page;
  // W157-F1: shown whenever status is not `approved` (today, only `cancelled`
  // — `draft` cannot reach this page). Reason is structurally absent: `ClubLinkEvent` has no `decisionReason` key.
  const notApproved = participation.event.status !== "approved";
  const cancelled = participation.event.status === "cancelled";
  const basePath = `/e/${encodeURIComponent(token)}`;
  const filters = readParticipationFilters(query, participation.questions, participation.tier);

  return (
    <PublicShell width="wide">
      {/* Counts as a real opening; the render stamps nothing (LAN-269). */}
      <LinkOpenedBeacon record={noteClubLinkOpened.bind(null, token)} />
      <Stack spacing={2}>
        <PageHeader
          title={participation.event.name}
          struckThrough={cancelled}
          status={
            notApproved ? (
              <StatusChip
                domain="event"
                status={participation.event.status}
                label={labelFor(STATUS_LABELS, participation.event.status)}
                testId="club-link-status"
              />
            ) : undefined
          }
          subtitle={[
            notApproved ? labelFor(STATUS_LABELS, participation.event.status) : null,
            formatEventWhen(participation.event),
            CLUB_LINK_SUBTITLE,
          ]
            .filter(Boolean)
            .join(" · ")}
        />

        <EventFacts event={participation.event} />
        <HeadlineNumbers headline={participation.headline} />
        <ParticipationFilterBar basePath={basePath} filters={filters} showDelivery={false} />
        <ParticipationTable basePath={basePath} participation={participation} filters={filters} />
      </Stack>
    </PublicShell>
  );
}
