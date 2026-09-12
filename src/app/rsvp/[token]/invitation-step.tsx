/**
 * UX-60 — the invitation screen. Split from `page.tsx` (LAN-300).
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Fact, FactGrid } from "@/components/fact";

import type { SignedRsvpPage } from "@/lib/services/rsvp";

import { submitAttending } from "./actions";
import { BUSY_ERROR, CLOSED_ERROR, DECLINE_STEP, STEP_PARAM } from "./params";
import {
  ATTENDING,
  CURRENT_ANSWER_LABEL,
  CURRENT_ANSWER_NOTE,
  DEADLINE_LABEL,
  DEADLINE_NOTE,
  DESCRIPTION_LABEL,
  EQUIPMENT_LABEL,
  INVITATION_LABEL,
  NOT_ATTENDING,
  PLAYER_LABEL,
  PRIVACY_NOTE,
  VENUE_LABEL,
  formatDeadline,
  formatEventDate,
  formatEventTime,
} from "./presentation";
import { currentAnswerLabel, MIN_TOUCH_TARGET, Shell } from "./rsvp-shell";

export function Invitation({
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
        {page.templateName}
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
        {/*
          D17, LAN-264. The one screen an invited player opens, and until now
          the one that did not say what to bring. `multiline` because this is
          free text the operator typed and a kit list is a list.
        */}
        {page.requiredEquipment ? (
          <Fact
            label={EQUIPMENT_LABEL}
            value={page.requiredEquipment}
            multiline
            testId="rsvp-equipment"
          />
        ) : null}
        {/*
          LAN-323. The equipment has been here since LAN-264; what the operator
          wrote about the event never was, so a player deciding on this screen
          could not read it. Two separately labelled things, never folded
          together — that fold belongs to the calendar feed alone, which has
          nowhere else to put the equipment.
        */}
        {page.description ? (
          <Fact
            label={DESCRIPTION_LABEL}
            value={page.description}
            multiline
            testId="rsvp-description"
          />
        ) : null}
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
