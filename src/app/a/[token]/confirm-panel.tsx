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

import { AutoSubmitOnInteraction } from "./auto-submit";
import { QuestionField } from "./question-field";
import { submitAnswer } from "./actions";
import { ANSWER_FORM_ID } from "./params";
import {
  BUSY_MESSAGE,
  CHANGE_TO_YES,
  GIVE_REASON_AND_CONTINUE,
  NO_EXPLANATION,
  NO_HEADING,
  PLANS_CHANGED,
  PRIVACY_NOTE,
  QUESTIONS_HEADING,
  REASON_LABEL,
  REASON_PLACEHOLDER,
  REASON_PROMPT,
  RECRUIT_CONFIRM_LABEL,
  RECRUIT_NO_HEADING,
  RECRUIT_YES_HEADING,
  YES_HEADING,
  attendingSentence,
  confirmLabel,
  otherOutstandingSentence,
} from "./presentation";

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
  busy,
}: {
  token: string;
  answer: PlayerAnswer;
  base: SignedRsvpPage;
  landing: PlayerAnswerLanding;
  busy: boolean;
}) {
  // LAN-203, REQ-recruit-sees-public-only. A recruit reaches this exact route
  // through `recruit_event_followup`'s own yes/no buttons — the invitation
  // itself is unchanged (`event_invitation`, every audience's shared first
  // message) — and this is the one place `/a/[token]` has to know the
  // difference: never their own name framed as "Player", never the event's
  // questions, never who else answered, and never asked for a reason on a
  // No. `RecruitConfirm` below is the whole of that difference; everything
  // else on this route — the token mechanics, the saved page it posts to —
  // is the one substrate both audiences share.
  if (base.capacity === "recruit") {
    return <RecruitConfirm token={token} answer={answer} base={base} busy={busy} />;
  }

  const date = formatEventDate(base.scheduledOn);
  const time = formatEventTime(base.startsAt, base.endsAt);
  const when = [date, time].filter(Boolean).join(" · ") || null;
  const deadline = formatDeadline(base.responseDeadline);
  const attending = attendingSentence(landing.attendingCount);
  const otherOutstanding = otherOutstandingSentence(landing.otherOutstandingCount);

  return (
    <Shell>
      <Typography variant="overline" color="text.secondary">
        {base.templateName}
      </Typography>
      <PageHeader title={answer === "yes" ? YES_HEADING : NO_HEADING} />
      <Typography sx={{ fontSize: { xs: 17, sm: 19 }, fontWeight: 600, mt: 1 }}>
        {base.eventName}
        {when ? ` · ${when}` : ""}
      </Typography>

      {answer === "no" ? (
        <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1.5 }}>
          {NO_EXPLANATION}
        </Typography>
      ) : null}

      {busy ? <Notice severity="warning">{BUSY_MESSAGE}</Notice> : null}

      <FactGrid>
        {base.playerName ? <Fact label="Player" value={base.playerName} /> : null}
        {base.venue ? <Fact label="Venue" value={base.venue} /> : null}
        {deadline ? <Fact label="Response deadline" value={deadline} /> : null}
        <Fact label="Your answer" value={answer === "yes" ? YES_HEADING : "You're not attending"} />
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

        Owner correction round 6 (OWNER-LAN172-18): `enforceRequired={false}`
        below means a blank required question never blocks this submit,
        whether it fires automatically or from a human's own click — the
        answer is never gated on a question, per W2 acceptance criterion 6.
      */}
      <Box id={ANSWER_FORM_ID} component="form" action={submitAnswer}>
        <input type="hidden" name="token" value={token} />

        {answer === "yes" && landing.questions.length > 0 ? (
          <Stack spacing={2} sx={{ mb: 3 }}>
            <Typography component="h2" sx={{ fontSize: 15, fontWeight: 700 }}>
              {QUESTIONS_HEADING}
            </Typography>
            {landing.questions.map((question) => (
              <QuestionField key={question.id} question={question} enforceRequired={false} />
            ))}
          </Stack>
        ) : null}

        {answer === "no" ? (
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
        {answer === "no" ? (
          <Stack direction="row" spacing={1.5}>
            <Button
              type="submit"
              name="intent"
              value="answer"
              variant="outlined"
              color="inherit"
              fullWidth
              sx={{ minHeight: 48 }}
            >
              {GIVE_REASON_AND_CONTINUE}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="change-to-yes"
              variant="contained"
              color="primary"
              fullWidth
              sx={{ minHeight: 48 }}
            >
              {CHANGE_TO_YES}
            </Button>
          </Stack>
        ) : (
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            sx={{ minHeight: 48 }}
          >
            {confirmLabel(answer, landing.questions.length > 0)}
          </Button>
        )}
      </Box>

      {/*
        Owner correction round 6 (OWNER-LAN172-17), interaction-gated by Q-30
        in round 7. `busy` means an earlier submit was already refused as
        rate-limited and redirected back here — arming the listener again
        immediately would let the player's very next scroll retry against the
        same limiter with no pause to read `BUSY_MESSAGE`, so this one case is
        left to the visible button instead. Every other load arms the
        listener once and waits for a genuine interaction, per
        `AutoSubmitOnInteraction`'s own guard.
      */}
      {!busy ? <AutoSubmitOnInteraction formId={ANSWER_FORM_ID} /> : null}

      {/*
        W2's Yes-path bullet, quoted verbatim: "Changing to No remains
        available but visually secondary and lightly framed." A separate,
        small form — abandoning the questions being filled above is exactly
        what choosing this does, the same trade `/me/[token]`'s own "Plans
        changed?" already makes.
      */}
      {answer === "yes" ? (
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
  busy,
}: {
  token: string;
  answer: PlayerAnswer;
  base: SignedRsvpPage;
  busy: boolean;
}) {
  const date = formatEventDate(base.scheduledOn);
  const time = formatEventTime(base.startsAt, base.endsAt);
  const when = [date, time].filter(Boolean).join(" · ") || null;

  return (
    <Shell>
      <Typography variant="overline" color="text.secondary">
        {base.templateName}
      </Typography>
      <PageHeader title={answer === "yes" ? RECRUIT_YES_HEADING : RECRUIT_NO_HEADING} />
      <Typography sx={{ fontSize: { xs: 17, sm: 19 }, fontWeight: 600, mt: 1 }}>
        {base.eventName}
        {when ? ` · ${when}` : ""}
      </Typography>

      {busy ? <Notice severity="warning">{BUSY_MESSAGE}</Notice> : null}

      {base.venue ? (
        <Box component="dl" sx={{ mt: 3, mb: 1 }}>
          <Fact label="Venue" value={base.venue} />
        </Box>
      ) : null}

      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2, mb: 2 }}>
        {PRIVACY_NOTE}
      </Typography>

      <Box id={ANSWER_FORM_ID} component="form" action={submitAnswer}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant="contained" color="primary" fullWidth sx={{ minHeight: 48 }}>
          {RECRUIT_CONFIRM_LABEL}
        </Button>
      </Box>

      {!busy ? <AutoSubmitOnInteraction formId={ANSWER_FORM_ID} /> : null}
    </Shell>
  );
}
