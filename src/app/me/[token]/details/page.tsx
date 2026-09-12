/**
 * `/me/[token]/details` — the five-step onboarding questionnaire, LAN-216.
 * A public token surface: token resolution, throttling and the not-found
 * state stay exactly here. The step screens live in the sibling files this
 * route split into (LAN-300) — `step-shell.tsx`, `details-step.tsx`,
 * `document-step.tsx`, `trust-steps.tsx`, `terminal-pages.tsx`.
 */
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Stack from "@mui/material/Stack";
import { PublicShell } from "@/components/public-shell";
import { Notice } from "@/components/notice";

import { withTransaction } from "@/lib/db";
import {
  allowPlayerHomeRequest,
  clientKeyFrom,
  logThrottledPlayerHomeRequest,
  withUniformTerminalTiming,
} from "@/lib/rsvp/public-surface";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { resolveHudlJoinLink } from "@/lib/services/player-config";
import {
  readQuestionnaireViewIn,
  STEP_ORDER,
  type QuestionnaireStep,
  type QuestionnaireView,
} from "@/lib/services/player-questionnaire";

import { BUSY_MESSAGE } from "./presentation";
import { AlreadyCompletePage, DonePage } from "./terminal-pages";
import { DetailsStepPage } from "./details-step";
import { DocumentStepPage } from "./document-step";
import { BucsStepPage, HudlStepPage } from "./trust-steps";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface Resolved {
  personId: string | null;
  seasonId: string | null;
  view: QuestionnaireView | null;
}

const STEP_PARAM_VALUES: readonly string[] = [...STEP_ORDER, "done"];

export default async function PlayerDetailsPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;
  const requestedStep = first(query.step);
  const agreeError = first(query.agreeError) !== null;
  const busy = first(query.error) === "busy";

  const resolved = await withUniformTerminalTiming<Resolved>(
    async () => {
      const requestHeaders = await headers();
      const decision = allowPlayerHomeRequest(clientKeyFrom(requestHeaders), token);
      if (!decision.allowed) {
        logThrottledPlayerHomeRequest(decision.reason!);
        return { personId: null, seasonId: null, view: null };
      }

      return withTransaction(async (tx) => {
        const resolution = await resolvePersonTokenIn(tx, token);
        if (resolution.state !== "valid" || !resolution.resolved) {
          return { personId: null, seasonId: null, view: null };
        }
        const view = await readQuestionnaireViewIn(
          tx,
          resolution.resolved.personId,
          resolution.resolved.seasonId,
        );
        return {
          personId: resolution.resolved.personId,
          seasonId: resolution.resolved.seasonId,
          view,
        };
      });
    },
    (outcome) => outcome.personId === null || outcome.view === null,
  );

  if (resolved.personId === null || resolved.view === null) {
    notFound();
  }

  const view = resolved.view;

  // Three landings in order: explicit `?step=` wins, else nothing-left is "already complete" (W4-08), else `view.nextStep` resumes.
  type PageKind = "already-complete" | "done" | QuestionnaireStep;
  let page: PageKind;
  if (requestedStep && STEP_PARAM_VALUES.includes(requestedStep)) {
    page = requestedStep as PageKind;
  } else if (view.nothingOutstanding) {
    page = "already-complete";
  } else {
    page = view.nextStep;
  }

  return (
    <PublicShell layout="stack">
      <Stack spacing={3}>
        {busy ? <Notice severity="warning">{BUSY_MESSAGE}</Notice> : null}

        {page === "already-complete" ? (
          <AlreadyCompletePage />
        ) : page === "done" ? (
          <DonePage view={view} token={token} />
        ) : page === "details" ? (
          <DetailsStepPage view={view} token={token} />
        ) : page === "code_of_conduct" || page === "photo_release" ? (
          <DocumentStepPage
            view={view}
            token={token}
            agreementType={page}
            agreeError={agreeError}
          />
        ) : page === "bucs_play" ? (
          <BucsStepPage view={view} token={token} />
        ) : (
          // LAN-333. Configuration, never a literal: `null` until HUDL_JOIN_LINK is set.
          <HudlStepPage view={view} token={token} joinLink={resolveHudlJoinLink()} />
        )}
      </Stack>
    </PublicShell>
  );
}
