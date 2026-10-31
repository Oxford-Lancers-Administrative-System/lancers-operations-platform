/**
 * The confirm forms — the shared shell, the player's confirm-and-follow-up
 * screen, and the recruit's plain confirm. Split from `page.tsx` (LAN-300).
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Notice } from "@/components/notice";
import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import { Fact, FactGrid } from "@/components/fact";
import { Field } from "@/components/field";

import type { PlayerAnswerLanding } from "@/lib/services/player-home";
import type { PlayerAnswer } from "@/lib/services/player-answer-tokens";
import type { SignedRsvpPage } from "@/lib/services/rsvp";
import { formatDeadline, formatEventDate, formatEventTime } from "@/app/rsvp/[token]/presentation";

import { AutoSubmitOnInteraction, SubmitOnLoad } from "./auto-submit";
import { PendingSubmitButton } from "./pending-submit-button";
import { QuestionField } from "@/components/question-field";
import { submitAnswer } from "./actions";
import { ANSWER_FORM_ID } from "./params";
import {
  ANSWER_LABEL,
  BUSY_MESSAGE,
  CHANGE_TO_YES,
  CONFIRM_HEADING,
  GIVE_REASON_AND_CONTINUE,
  NOT_SAVED_HEADING,
  NO_EXPLANATION,
  PLANS_CHANGED,
  PRIVACY_NOTE,
  QUESTIONS_HEADING,
  REASON_LABEL,
  REASON_PLACEHOLDER,
  REASON_PROMPT,
  RECRUIT_CONFIRM_LABEL,
  RETRY,
  SAVING,
  UNSAVED_MESSAGE,
  answerValue,
  attendingSentence,
  confirmLabel,
  otherOutstandingSentence,
} from "./presentation";

/**
 * How this load of the page saves its answer — LAN-498, Brian, 31 October 2026.
 *
 * - `on-load`: delivered by WhatsApp, so the form submits itself once the page
 *   has hydrated (`SubmitOnLoad`). The page reads "Saving…" from the start.
 * - `on-interaction`: delivered by email, or a channel the record cannot prove,
 *   or an invitation that already has any standing answer. Today's
 *   behaviour: the first interaction outside the form saves, or the button.
 * - `manual`: a known preview fetcher or crawler asked (`preview-agents.ts`).
 *   Nothing submits by itself; the button still works, and `submitAnswer`
 *   refuses the agent anyway.
 * - `busy` / `unsaved`: an earlier submit came back refused or failed. Nothing
 *   submits by itself; the button is the retry.
 */
export type SaveMode = "on-load" | "on-interaction" | "manual" | "busy" | "unsaved";

function headingFor(mode: SaveMode): string {
  if (mode === "on-load") return SAVING;
  if (mode === "on-interaction" || mode === "manual") return CONFIRM_HEADING;
  return NOT_SAVED_HEADING;
}

function failed(mode: SaveMode): boolean {
  return mode === "busy" || mode === "unsaved";
}

/** The failure, if this load is showing one. */
function SaveFailure({ mode }: { mode: SaveMode }) {
  if (mode === "busy") return <Notice severity="warning">{BUSY_MESSAGE}</Notice>;
  if (mode === "unsaved") return <Notice severity="error">{UNSAVED_MESSAGE}</Notice>;
  return null;
}

/** What submits the form without its button: on load, on a first interaction, or nothing after a failure (the button is the retry, and re-arming would hammer the same limiter). */
function SaveTrigger({ mode }: { mode: SaveMode }) {
  if (mode === "on-load") return <SubmitOnLoad formId={ANSWER_FORM_ID} />;
  if (mode === "on-interaction") return <AutoSubmitOnInteraction formId={ANSWER_FORM_ID} />;
  return null;
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell>
      <Stack spacing={2}>{children}</Stack>
    </PublicShell>
  );
}

export function Confirm({
  token,
  answer,
  base,
  landing,
  mode,
}: {
  token: string;
  answer: PlayerAnswer;
  base: SignedRsvpPage;
  landing: PlayerAnswerLanding;
  mode: SaveMode;
}) {
  // LAN-203, REQ-recruit-sees-public-only. A recruit reaches this exact route
  // through `recruit_event_followup`'s own yes/no buttons — the invitation
  // itself is unchanged (`event_invitation`, every audience's shared first
  // message) — and this is the one place `/a/<yes|no>/[token]` has to know the
  // difference: never their own name framed as "Player", never the event's
  // questions, never who else answered, and never asked for a reason on a
  // No. `RecruitConfirm` below is the whole of that difference; everything
  // else on this route — the token mechanics, the saved page it posts to —
  // is the one substrate both audiences share.
  if (base.capacity === "recruit") {
    return <RecruitConfirm token={token} answer={answer} base={base} mode={mode} />;
  }

  const date = formatEventDate(base.scheduledOn);
  const time = formatEventTime(base.startsAt, base.endsAt);
  const when = [date, time].filter(Boolean).join(" · ") || null;
  const deadline = formatDeadline(base.responseDeadline, base.deadlinePassed);
  const attending = attendingSentence(landing.attendingCount);
  const otherOutstanding = otherOutstandingSentence(landing.otherOutstandingCount);
  // LAN-498. A page that saves on load leaves for `/events/<t>` within a
  // moment, and that page asks the questions and the reason itself
  // (`FocusedPanel`). Fields shown here would be pulled away mid-typing.
  const followUp = mode !== "on-load";

  return (
    <Shell>
      <Typography variant="overline" color="text.secondary">
        {base.templateName}
      </Typography>
      <PageHeader title={headingFor(mode)} />
      <Typography sx={{ fontSize: { xs: 17, sm: 19 }, fontWeight: 600, mt: 1 }}>
        {base.eventName}
        {when ? ` · ${when}` : ""}
      </Typography>

      {answer === "no" && followUp ? (
        <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1.5 }}>
          {NO_EXPLANATION}
        </Typography>
      ) : null}

      <SaveFailure mode={mode} />

      <FactGrid>
        {base.playerName ? <Fact label="Player" value={base.playerName} /> : null}
        {base.venue ? <Fact label="Venue" value={base.venue} /> : null}
        {deadline ? <Fact label="Response deadline" value={deadline} /> : null}
        <Fact label={ANSWER_LABEL} value={answerValue(answer)} />
      </FactGrid>
      {attending ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>{attending}</Typography>
      ) : null}
      {otherOutstanding ? <Notice severity="info">{otherOutstanding}</Notice> : null}

      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2, mb: 2 }}>
        {PRIVACY_NOTE}
      </Typography>

      {/*
        Owner correction round 5 (OWNER-LAN172-12, OWNER-LAN172-13): the
        follow-up itself — the event's own questions for a Yes, the reason
        field for a No — is asked right here, in the same form as the
        confirm button, so one submit both records the answer and saves it.
        W2 line 61: the Yes landing "asks applicable event questions"; the
        No-path section: "the reason field belongs on that page."

        Owner correction round 6 (OWNER-LAN172-17), gated by Q-30 in round 7
        (LAN-172-r5-F1), corrected again by OWNER-LAN172-22 in round 8: this
        exact form is what `AutoSubmitOnInteraction` below submits itself, in
        a JS-capable browser, the moment the player's first interaction with
        the page lands *outside* this form — a real pointer, key, touch or
        scroll, never on mount alone (an unconditional mount-fire let any
        JS-executing automated visitor, including a security scanner,
        complete this write with no human action at all — exactly what
        REQ-no-false-rsvp forbids). An interaction directed at this form's
        own controls instead — focusing the reason field, opening the
        question select, pressing this form's own submit button — never
        triggers it (round 8: the gate was firing on the very click needed to
        reach either field, so a player could never actually use them).
        `id={ANSWER_FORM_ID}` is how that component finds this form; nothing
        else about the form changes for that purpose, so the unmodified
        visible button remains Q-11's own fallback — for no JavaScript, and
        for a human who only ever touches this form's own fields.

        LAN-498 (Brian, 31 October 2026) narrows that gate to email. A link
        WhatsApp delivered submits this form on load instead (`SubmitOnLoad`,
        `mode === "on-load"`), because WhatsApp's preview fetcher runs no
        script and the players who read the page and left had saved nothing.
        Email keeps the interaction gate: mail scanners do run script.

        Owner correction round 6 (OWNER-LAN172-18): `enforceRequired={false}`
        below means a blank required question never blocks this submit,
        whether it fires automatically or from a human's own click — the
        answer is never gated on a question, per W2 acceptance criterion 6.
      */}
      <Box id={ANSWER_FORM_ID} component="form" action={submitAnswer}>
        <input type="hidden" name="token" value={token} />

        {answer === "yes" && followUp && landing.questions.length > 0 ? (
          <Stack spacing={2} sx={{ mb: 3 }}>
            <Typography component="h2" sx={{ fontSize: 15, fontWeight: 700 }}>
              {QUESTIONS_HEADING}
            </Typography>
            {landing.questions.map((question) => (
              <QuestionField key={question.id} question={question} enforceRequired={false} />
            ))}
          </Stack>
        ) : null}

        {answer === "no" && followUp ? (
          <Stack spacing={1.5} sx={{ mb: 3 }}>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{REASON_PROMPT}</Typography>
            <Field
              name="reason"
              label={REASON_LABEL}
              placeholder={REASON_PLACEHOLDER}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
          </Stack>
        ) : null}

        {/*
          Emphasis always points at Yes (Brian, 2026-08-25): the Yes button is
          filled. On the No page, `REQ-emphasis-points-at-yes` puts the same
          rule on two controls at once — "Give a reason and continue"
          completes the No and stays unfilled; "Change to Yes" is the
          affirmative action and gets W2's own "primary treatment." Neither
          is a second continue control competing with the other — W2: "Give
          a reason and continue is the single forward action."
        */}
        {answer === "no" && followUp ? (
          <Stack direction="row" spacing={1.5}>
            <PendingSubmitButton
              savingLabel={SAVING}
              name="intent"
              value="answer"
              variant="outlined"
              color="inherit"
              fullWidth
              sx={{ minHeight: 48 }}
            >
              {failed(mode) ? RETRY : GIVE_REASON_AND_CONTINUE}
            </PendingSubmitButton>
            <PendingSubmitButton
              name="intent"
              value="change-to-yes"
              variant="contained"
              color="primary"
              fullWidth
              sx={{ minHeight: 48 }}
            >
              {CHANGE_TO_YES}
            </PendingSubmitButton>
          </Stack>
        ) : (
          <PendingSubmitButton
            savingLabel={SAVING}
            variant="contained"
            color="primary"
            fullWidth
            sx={{ minHeight: 48 }}
          >
            {failed(mode) ? RETRY : confirmLabel(answer, followUp && landing.questions.length > 0)}
          </PendingSubmitButton>
        )}
      </Box>

      <SaveTrigger mode={mode} />

      {/*
        W2's Yes-path bullet, quoted verbatim: "Changing to No remains
        available but visually secondary and lightly framed." A separate,
        small form — abandoning the questions being filled above is exactly
        what choosing this does, the same trade `/events/[token]`'s own "Plans
        changed?" already makes.
      */}
      {answer === "yes" && followUp ? (
        <Box component="form" action={submitAnswer} sx={{ mt: 2 }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="intent" value="change-to-no" />
          <Button
            type="submit"
            variant="text"
            color="inherit"
            sx={{ minHeight: 40, fontWeight: 400, textTransform: "none" }}
          >
            {PLANS_CHANGED}
          </Button>
        </Box>
      ) : null}
    </Shell>
  );
}

/**
 * REQ-recruit-sees-public-only, REQ-no-reason-asked, REQ-never-harsh. One
 * question, one confirm, nothing else: no player-name framing, no event
 * questions (LAN-339 is what makes a recruit-capacity invitation have none —
 * `applies_to_capacities` names every capacity on every stored question, so
 * the rule is in `question-applicability.ts`; this page also never asks
 * regardless), no reason field, no attending
 * count, no other-outstanding count — none of `player-home.ts`'s counts are
 * even read into this branch. A No submits with no `reason` field in the
 * form at all, so `consumeAnswerTokenIn` falls back to its own
 * `NO_REASON_GIVEN_DEFAULT`, exactly as `rsvp_responses_no_requires_a_reason`
 * requires without this page ever asking the question.
 */
function RecruitConfirm({
  token,
  answer,
  base,
  mode,
}: {
  token: string;
  answer: PlayerAnswer;
  base: SignedRsvpPage;
  mode: SaveMode;
}) {
  const date = formatEventDate(base.scheduledOn);
  const time = formatEventTime(base.startsAt, base.endsAt);
  const when = [date, time].filter(Boolean).join(" · ") || null;

  return (
    <Shell>
      <Typography variant="overline" color="text.secondary">
        {base.templateName}
      </Typography>
      <PageHeader title={headingFor(mode)} />
      <Typography sx={{ fontSize: { xs: 17, sm: 19 }, fontWeight: 600, mt: 1 }}>
        {base.eventName}
        {when ? ` · ${when}` : ""}
      </Typography>

      <SaveFailure mode={mode} />

      <Box component="dl" sx={{ mt: 3, mb: 1 }}>
        {base.venue ? <Fact label="Venue" value={base.venue} /> : null}
        <Fact label={ANSWER_LABEL} value={answerValue(answer)} />
      </Box>

      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2, mb: 2 }}>
        {PRIVACY_NOTE}
      </Typography>

      <Box id={ANSWER_FORM_ID} component="form" action={submitAnswer}>
        <input type="hidden" name="token" value={token} />
        <PendingSubmitButton
          savingLabel={SAVING}
          variant="contained"
          color="primary"
          fullWidth
          sx={{ minHeight: 48 }}
        >
          {failed(mode) ? RETRY : RECRUIT_CONFIRM_LABEL}
        </PendingSubmitButton>
      </Box>

      <SaveTrigger mode={mode} />
    </Shell>
  );
}
