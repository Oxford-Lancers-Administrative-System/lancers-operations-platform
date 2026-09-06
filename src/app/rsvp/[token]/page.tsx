import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Notice } from "@/components/notice";
import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import { Fact, FactGrid } from "@/components/fact";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import Typography from "@mui/material/Typography";

import { withTransaction } from "@/lib/db";
import {
  allowRsvpRequest,
  clientKeyFrom,
  logThrottledRsvpRequest,
  withUniformTerminalTiming,
} from "@/lib/rsvp/public-surface";
import { readSignedRsvpPageIn, type SignedRsvpPage } from "@/lib/services/rsvp";
import { resolveRsvpTokenIn } from "@/lib/services/rsvp-tokens";

import { submitAttending, submitNotAttending } from "./actions";
import {
  BUSY_ERROR,
  CLOSED_ERROR,
  DECLINE_STEP,
  ERROR_PARAM,
  REASON_REQUIRED_ERROR,
  SAVED_PARAM,
  STEP_PARAM,
} from "./params";
import {
  ANSWER_ATTENDING,
  ANSWER_NONE,
  ANSWER_NOT_ATTENDING,
  ATTENDING,
  BACK,
  CANCELLED_HEADING,
  CANCELLED_NOTE,
  CHANGE_RESPONSE,
  CLOSE,
  CURRENT_ANSWER_LABEL,
  CURRENT_ANSWER_NOTE,
  DEADLINE_LABEL,
  DEADLINE_NOTE,
  DECLINE_HEADING,
  DECLINE_PROMPT,
  INVITATION_LABEL,
  NOT_ATTENDING,
  PLAYER_LABEL,
  PRIVACY_NOTE,
  REASON_LABEL,
  REASON_PLACEHOLDER,
  SAVE_NOT_ATTENDING,
  SAVED_HEADING,
  SAVED_NOTE,
  VENUE_LABEL,
  cancelledSentence,
  eventSummary,
  eventTypeLabel,
  formatDeadline,
  formatEventDate,
  formatEventDateShort,
  formatEventTime,
} from "./presentation";

/**
 * The player's RSVP — UX-60, UX-61, UX-62 and UX-66. LAN-79.
 *
 * ## The only unauthenticated page in the application
 *
 * There is no session here and no sign-in prompt, by design: the token is the
 * authorization. Everything that follows from that is deliberate.
 *
 * **Nothing is cached.** `force-dynamic` plus the `no-store` headers set in
 * `src/proxy.ts` keep one player's answer out of another's response, and keep a
 * shared proxy from ever holding a page that names a person. Verified on a
 * production build rather than assumed, and asserted in
 * `tests/operate-route-protection.test.ts`.
 *
 * **Nothing is indexed, and no referrer leaves.** The token is in the URL, so a
 * `Referer` header on any outbound request would hand it to a third party.
 * `Referrer-Policy: no-referrer` is set for this route for that reason alone.
 *
 * **There is no navigation into `/operate`.** Not an oversight — a link would
 * invite a player to a surface they have no account for, and the ticket asks
 * for a deliberately plain page.
 *
 * ## Four screens, one route
 *
 * The approved registry gives UX-60, UX-61, UX-62 and UX-66 the same route, and
 * the steps move on query parameters rather than nested routes. That keeps the
 * whole journey working with scripting disabled: `?step=decline` is a link,
 * every submission is a plain form POST, and `?saved=1` is where the action
 * redirects. No client component is involved on any path.
 *
 * ## Where the terminal states went
 *
 * UX-63, UX-64 and UX-65 are not rendered here. Every one of them calls
 * `notFound()`, which renders `not-found.tsx` in this same segment at `404` —
 * so the three internal states cannot render different bodies even by accident,
 * because there is only one body. See that file for the rest of the reasoning.
 */
export const dynamic = "force-dynamic";

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
      // Counted before the token is even looked at, so that a scanner cannot
      // spend database round trips. A throttled request is reported as the same
      // terminal outcome everything else unusable produces — a distinct "too
      // many requests" page would tell a scanner it was being counted — but the
      // server says so in its own log, so that a throttled player is something
      // the club can discover rather than something nobody can see.
      const requestHeaders = await headers();
      const decision = allowRsvpRequest(clientKeyFrom(requestHeaders), token);
      if (!decision.allowed) {
        logThrottledRsvpRequest(decision.reason!);
        return { state: "unknown" as const, page: null };
      }

      // Resolution and the page read share one transaction: the event could
      // otherwise be cancelled between deciding the link is valid and reading
      // what to show for it.
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
    // `unknown`, `expired`, `revoked`, `superseded` and `event_started` are all
    // terminal, and all held to the same floor so that the work each one costs
    // is not visible from outside.
    (outcome) => outcome.page === null || outcome.state === "event_started",
  );

  // They stay distinct in the resolver, in secure logs and in tests, and become
  // one response at exactly this line.
  if (resolved.page === null || resolved.state === "event_started") {
    notFound();
  }

  if (resolved.state === "cancelled") {
    return <CancelledEvent page={resolved.page} />;
  }

  const error = firstValue(query[ERROR_PARAM]);
  if (firstValue(query[SAVED_PARAM]) !== null && error === null) {
    return <ResponseSaved page={resolved.page} token={token} />;
  }
  if (firstValue(query[STEP_PARAM]) === DECLINE_STEP) {
    return <DecliningStep page={resolved.page} token={token} error={error} />;
  }

  return <Invitation page={resolved.page} token={token} error={error} />;
}

/** A phone-first touch target. The player is outdoors on a small screen. */
const MIN_TOUCH_TARGET = 48;

/** One column, centred, readable at 375px and not absurdly wide on a desktop. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell>
      <Stack spacing={2}>{children}</Stack>
    </PublicShell>
  );
}

function currentAnswerLabel(page: SignedRsvpPage): string {
  if (page.currentResponse === null) return ANSWER_NONE;
  return page.currentResponse.response === "yes" ? ANSWER_ATTENDING : ANSWER_NOT_ATTENDING;
}

// ---------------------------------------------------------------------------
// UX-60 — the invitation
// ---------------------------------------------------------------------------

function Invitation({
  page,
  token,
  error,
}: {
  page: SignedRsvpPage;
  token: string;
  error: string | null;
}) {
  const date = formatEventDate(page.scheduledOn);
  const time = formatEventTime(page.startsAt, page.endsAt);
  const deadline = formatDeadline(page.responseDeadline);

  return (
    <Shell>
      {/*
        What kind of event this is, above its name — Brian's visual review.
        A player scanning a link on a phone wants to know "fixture or practice?"
        before they read anything else, and the event's own name does not always
        say: "vs Ivybridge Ravens" does, "Michaelmas week 3" does not.
      */}
      <Typography variant="overline" color="text.secondary">
        {eventTypeLabel(page.eventType)}
      </Typography>
      <PageHeader title={page.eventName} />
      {/*
        When the event is, given the weight it actually carries.

        This started as ordinary secondary text under the title and Brian's
        visual review found it got lost there — which is the wrong outcome for
        the one fact a player is opening the page to check. It is now primary
        colour, heavier and larger than the body text, and it is the only line
        on the screen treated that way apart from the event's name.
      */}
      {date ? (
        <Typography
          sx={{
            fontSize: { xs: 17, sm: 19 },
            fontWeight: 600,
            color: "text.primary",
            mt: 1,
            lineHeight: 1.35,
          }}
        >
          {time ? `${date} · ${time}` : date}
        </Typography>
      ) : null}

      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2 }}>{PRIVACY_NOTE}</Typography>

      {/*
        Two different failures, and they must not read as one. `closed` means
        the window shut between rendering and submitting — the page still
        resolves, so the player is told plainly rather than 404'd. `busy` means
        the request was rate limited, which is nothing to do with their event;
        the first version told those players their event had started, which was
        false and left them nothing to do about it.
      */}
      {error === CLOSED_ERROR ? (
        <Notice severity="warning">
          Your response could not be saved. Responses close when the event starts.
        </Notice>
      ) : null}
      {error === BUSY_ERROR ? (
        <Notice severity="warning">
          Your response could not be saved just now because the club received a lot of requests at
          once. Please try again in a minute — your event has not started.
        </Notice>
      ) : null}

      <FactGrid>
        <Fact label={PLAYER_LABEL} value={page.playerName} note={INVITATION_LABEL} />
        {page.venue ? <Fact label={VENUE_LABEL} value={page.venue} /> : null}
        {deadline ? <Fact label={DEADLINE_LABEL} value={deadline} note={DEADLINE_NOTE} /> : null}
        <Fact
          label={CURRENT_ANSWER_LABEL}
          value={currentAnswerLabel(page)}
          note={CURRENT_ANSWER_NOTE}
        />
      </FactGrid>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        {/* Attending is one tap: a form with nothing in it but the token. */}
        <Box component="form" action={submitAttending} sx={{ flex: 1 }}>
          <input type="hidden" name="token" value={token} />
          <Button type="submit" variant="contained" fullWidth sx={{ minHeight: MIN_TOUCH_TARGET }}>
            {ATTENDING}
          </Button>
        </Box>
        {/* Not attending is a link, so it works with scripting disabled and
            leaves the player's typed reason on a page of its own. */}
        <Button
          href={`/rsvp/${encodeURIComponent(token)}?${STEP_PARAM}=${DECLINE_STEP}`}
          variant="outlined"
          fullWidth
          sx={{ flex: 1, minHeight: MIN_TOUCH_TARGET }}
        >
          {NOT_ATTENDING}
        </Button>
      </Stack>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// UX-61 — declining, with the reason the domain requires
// ---------------------------------------------------------------------------

function DecliningStep({
  page,
  token,
  error,
}: {
  page: SignedRsvpPage;
  token: string;
  error: string | null;
}) {
  const missingReason = error === REASON_REQUIRED_ERROR;

  return (
    <Shell>
      <PageHeader title={DECLINE_HEADING} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 0.5 }}>
        {eventSummary(page.eventName, page.scheduledOn, page.startsAt)}
      </Typography>

      <Notice severity={missingReason ? "error" : "info"}>{DECLINE_PROMPT}</Notice>

      <Box component="form" action={submitNotAttending} sx={{ mt: 3 }}>
        <input type="hidden" name="token" value={token} />
        <Stack spacing={2.5}>
          {/*
            `required` is the "refused in the form before the request is made"
            half of the acceptance criterion, and it is deliberately the
            browser's own validation rather than a script: it works with
            JavaScript disabled, which a React handler would not. The server
            checks the same string again in `recordSignedLinkResponse`, and the
            database's own constraint checks it a third time.
          */}
          <Field
            name="reason"
            label={REASON_LABEL}
            placeholder={REASON_PLACEHOLDER}
            required

            error={missingReason}
            helperText={missingReason ? DECLINE_PROMPT : undefined}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          {/*
            One reason, and no second box. The wireframe paired this with an
            optional "Additional detail"; Brian removed it on 14 August 2026 —
            the player leaves a reason, and nothing downstream reads the two
            apart.
          */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button type="submit" variant="contained" sx={{ minHeight: MIN_TOUCH_TARGET, flex: 1 }}>
              {SAVE_NOT_ATTENDING}
            </Button>
            <Button
              href={`/rsvp/${encodeURIComponent(token)}`}
              variant="text"
              sx={{ minHeight: MIN_TOUCH_TARGET, flex: 1 }}
            >
              {BACK}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// UX-62 — saved
// ---------------------------------------------------------------------------

function ResponseSaved({ page, token }: { page: SignedRsvpPage; token: string }) {
  const answer = currentAnswerLabel(page);
  const summary = eventSummary(page.eventName, page.scheduledOn, page.startsAt);

  return (
    <Shell>
      <PageHeader title={SAVED_HEADING} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 0.5 }}>
        {`${answer} · ${summary}`}
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 2 }}>{SAVED_NOTE}</Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 3 }}>
        <Button
          href={`/rsvp/${encodeURIComponent(token)}`}
          variant="contained"
          sx={{ minHeight: MIN_TOUCH_TARGET, flex: 1 }}
        >
          {CHANGE_RESPONSE}
        </Button>
        {/*
          Close is a plain link to the same page rather than a script that tries
          to close the tab: `window.close()` does nothing for a tab the script
          did not open, so a button that appeared to close and then did not
          would be worse than one that simply returns the player to their
          answer.
        */}
        <Button
          href={`/rsvp/${encodeURIComponent(token)}`}
          variant="text"
          sx={{ minHeight: MIN_TOUCH_TARGET, flex: 1 }}
        >
          {CLOSE}
        </Button>
      </Stack>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// UX-66 — a valid link to a cancelled event
// ---------------------------------------------------------------------------

/**
 * The one terminal state that is not uniform, and the reason it may not be.
 *
 * The invitation resolved: this holder is a genuine invitee of a genuine event,
 * so telling them it is off leaks nothing they were not already told when they
 * were invited. Brian's decision permits the event and its date here, and
 * nothing else — no other player, no roster, no response history.
 */
function CancelledEvent({ page }: { page: SignedRsvpPage }) {
  return (
    <Shell>
      <PageHeader title={CANCELLED_HEADING} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
        {cancelledSentence(page.eventName, formatEventDateShort(page.scheduledOn))}
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 2 }}>
        {CANCELLED_NOTE}
      </Typography>
    </Shell>
  );
}
