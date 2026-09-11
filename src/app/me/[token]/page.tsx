/**
 * `/me/[token]` — the player's home, LAN-172. A public token surface: token
 * resolution, throttling and the not-found state stay exactly here. The row
 * and panel presentation split into siblings (LAN-300) — `summary-row.tsx`,
 * `row-actions.tsx`, `focused-panel.tsx`.
 */
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { RowCardList } from "@/components/row-card";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";

import { withTransaction } from "@/lib/db";
import {
  allowPlayerHomeRequest,
  clientKeyFrom,
  logThrottledPlayerHomeRequest,
  withUniformTerminalTiming,
} from "@/lib/rsvp/public-surface";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import {
  readPlayerAnswerLandingIn,
  readPlayerHomeIn,
  type PlayerAnswerLanding,
  type PlayerHome,
  type PlayerHomeInvitation,
} from "@/lib/services/player-home";

import {
  ANSWERED_HEADING,
  ANSWERED_HELP,
  FOLLOW_UP_HEADING,
  FURTHER_OUT_HEADING,
  FURTHER_OUT_HELP,
  FURTHER_OUT_SUMMARY,
  NEW_INVITATIONS_HEADING,
  PRIVACY_NOTE,
  PUBLIC_CALENDAR_LINK,
  pageHeading,
  STILL_NEED_ANSWER_HEADING,
} from "./presentation";
import { FocusedPanel } from "./focused-panel";
import { SummaryRow } from "./summary-row";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface Resolved {
  readonly personId: string | null;
  readonly home: PlayerHome | null;
  readonly focused: PlayerAnswerLanding | null;
}

/** Every invitation across the four near-term buckets plus further-out, flattened once. */
function allEntries(home: PlayerHome): readonly PlayerHomeInvitation[] {
  return [
    ...home.newInvitations,
    ...home.stillNeedAnswer,
    ...home.followUpNeeded,
    ...home.answeredUpcoming,
    ...home.furtherOut,
  ];
}

export default async function PlayerHomePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;
  const openInvitationId = firstValue(query.open);
  const reasonError = firstValue(query.reasonError) !== null;

  const resolved = await withUniformTerminalTiming<Resolved>(
    async () => {
      const requestHeaders = await headers();
      const decision = allowPlayerHomeRequest(clientKeyFrom(requestHeaders), token);
      if (!decision.allowed) {
        logThrottledPlayerHomeRequest(decision.reason!);
        return { personId: null, home: null, focused: null };
      }

      return withTransaction(async (tx) => {
        const resolution = await resolvePersonTokenIn(tx, token);
        if (resolution.state !== "valid" || !resolution.resolved) {
          return { personId: null, home: null, focused: null };
        }
        const home = await readPlayerHomeIn(tx, resolution.resolved.personId);
        const belongsToThisPerson =
          openInvitationId !== null &&
          allEntries(home).some((entry) => entry.invitationId === openInvitationId);
        const focused = belongsToThisPerson
          ? await readPlayerAnswerLandingIn(tx, openInvitationId as string)
          : null;
        return { personId: resolution.resolved.personId, home, focused };
      });
    },
    (outcome) => outcome.personId === null,
  );

  if (resolved.personId === null || resolved.home === null) {
    notFound();
  }

  const home = resolved.home;
  const focusedInvitation =
    openInvitationId !== null
      ? (allEntries(home).find((entry) => entry.invitationId === openInvitationId) ?? null)
      : null;

  /**
   * OWNER-LAN172-20. The invitation `?open=` focuses already gets its own
   * richly detailed card above, from `FocusedPanel` — rendering it a second
   * time, unchanged, in whichever section it also belongs to left a player
   * looking at two cards for one event, each with its own separate controls,
   * unable to tell whether their answer had been recorded once or twice (it
   * had, correctly, only once — this was purely a rendering choice). Every
   * section below is filtered through this before it decides whether it has
   * anything to show, so a section that becomes empty once its one entry is
   * the focused one does not render an empty heading either.
   */
  const focusedId = focusedInvitation?.invitationId ?? null;
  function withoutFocused<T extends { invitationId: string }>(entries: readonly T[]): readonly T[] {
    return focusedId === null
      ? entries
      : entries.filter((entry) => entry.invitationId !== focusedId);
  }
  const newInvitations = withoutFocused(home.newInvitations);
  const stillNeedAnswer = withoutFocused(home.stillNeedAnswer);
  const followUpNeeded = withoutFocused(home.followUpNeeded);
  const answeredUpcoming = withoutFocused(home.answeredUpcoming);
  const furtherOut = withoutFocused(home.furtherOut);

  return (
    <PublicShell layout="stack">
      <Stack spacing={3}>
        <PageHeader
          title={pageHeading(home.outstandingCount, home.followUpNeeded.length > 0)}
          eyebrow={home.playerName ?? undefined}
          subtitle={PRIVACY_NOTE}
        />
        {focusedInvitation && resolved.focused ? (
          <FocusedPanel
            token={token}
            invitation={focusedInvitation}
            landing={resolved.focused}
            reasonError={reasonError}
          />
        ) : null}

        {newInvitations.length > 0 ? (
          <Section title={NEW_INVITATIONS_HEADING}>
            <RowCardList at="all">
              {newInvitations.map((entry) => (
                <SummaryRow
                  key={entry.invitationId}
                  token={token}
                  entry={entry}
                  dominant={entry.invitationId === home.nextInvitationId}
                />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {stillNeedAnswer.length > 0 ? (
          <Section title={STILL_NEED_ANSWER_HEADING}>
            <RowCardList at="all">
              {stillNeedAnswer.map((entry) => (
                <SummaryRow
                  key={entry.invitationId}
                  token={token}
                  entry={entry}
                  dominant={entry.invitationId === home.nextInvitationId}
                />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {followUpNeeded.length > 0 ? (
          <Section title={FOLLOW_UP_HEADING}>
            <RowCardList at="all">
              {followUpNeeded.map((entry) => (
                <SummaryRow key={entry.invitationId} token={token} entry={entry} dominant={false} />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {answeredUpcoming.length > 0 ? (
          <Section title={ANSWERED_HEADING} description={ANSWERED_HELP} collapsible>
            <RowCardList at="all">
              {answeredUpcoming.map((entry) => (
                <SummaryRow key={entry.invitationId} token={token} entry={entry} dominant={false} />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {furtherOut.length > 0 ? (
          <Section
            title={FURTHER_OUT_HEADING}
            description={FURTHER_OUT_HELP}
            summary={FURTHER_OUT_SUMMARY}
            collapsible
          >
            <RowCardList at="all">
              {furtherOut.map((entry) => (
                <SummaryRow key={entry.invitationId} token={token} entry={entry} dominant={false} />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {home.outstandingCount === 0 ? (
          <Button href="/calendar" variant="outlined" sx={{ mt: 1, minHeight: 44 }}>
            {PUBLIC_CALENDAR_LINK}
          </Button>
        ) : null}
      </Stack>
    </PublicShell>
  );
}
